import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { once } from "node:events";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { scaffoldAuthoringWorkspace } from "../scaffold.ts";
import { kyoshiInstructions } from "./instructions.ts";
import { startLoopbackModel } from "../../../agent/experiments/model-provider/loopback-openai.mjs";
import { opencodeExecutable } from "../../../ui/src/server/harness/opencode.ts";

// Manual browser fixture: real UI/server/harness; only inference is loopback.
const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-browser-"));
const learning = join(root, "learning");
const source = join(root, "source");
const course = join(learning, "courses/browser-authoring-fixture");
const home = join(root, "home");
// Resolve the installed CLI before isolating HOME. Otherwise trials can fall
// back to an unrelated (and potentially pre-ACP) executable on PATH.
const opencode = opencodeExecutable();
const endpoint = await startLoopbackModel({ latencyMs: 1500,
  selectResponsesTool(input) {
    const history = Array.isArray(input.input) ? input.input : [];
    const user = history.findLastIndex(item => item.role === "user");
    const content = history[user]?.content;
    const texts = typeof content === "string" ? [content]
      : Array.isArray(content) ? content.filter(part => part.type === "input_text" || part.type === "text").map(part => part.text) : [];
    // OpenCode may concatenate embedded context and learner text into one part.
    // Strip only Dojo's envelopes; quoted commands in evidence must not trigger.
    if (user < 0 || history.slice(user + 1).some(item => item.type === "function_call_output")) return;
    const tools = (input.tools ?? []).flatMap(tool => tool.type === "namespace"
      ? tool.tools.map(child => ({ ...child, namespace: tool.name })) : [tool]);
    const context = /(?:^|\n)(?:(?:\[(?:dojo|dojofoo):\/\/[^\]\n]+\]|(?:dojo|dojofoo):\/\/[^\n]+)\n)?<context ref="(?:dojo|dojofoo):\/\/[^"]+"[^>]*>\n?[\s\S]*?\n?<\/context>/gu;
    if (!texts.some(text => text.replace(context, "").trim() === "Complete this fixture lesson")) return;
    const complete = tools.find(tool => tool.name?.endsWith("dojo_lesson_complete"));
    if (complete) return { ...complete, input: {} };
    // Native OpenCode can expose MCP tools through Code Mode's catalog.
    const catalog = [input.instructions, ...history.filter(item => item.type === "message" && ["developer", "system"].includes(item.role))
      .flatMap(item => typeof item.content === "string" ? [item.content] : item.content?.map(part => part.text ?? "") ?? [])].join("\n");
    const call = catalog.match(/\b(tools\.(?:[\w$]+\.)*(?:[\w$]+_)?dojo_lesson_complete|tools\.[\w$]+\["dojo_lesson_complete"\])\s*\(/u)?.[1];
    if (call && tools.some(tool => tool.name === "execute")) {
      return { name: "execute", input: { code: `return await ${call}({});` } };
    }
  },
  toolRequest: process.env.DOJO_AUTHORING_ENTRY_FIXTURE === "1" ? undefined : {
  name: "harness-tools_course_question", input: { question: "Who should this course teach?", options: [
    { label: "Beginners", description: "New to the topic" },
    { label: "Experienced developers", description: "Already knows the basics" },
  ] },
} });
const cli = process.env.DOJO_CLI ?? fileURLToPath(new URL("../../../cli/dist/index.js", import.meta.url));
await access(cli);
const config = join(home, "config/opencode");
await mkdir(config, { recursive: true });
await mkdir(join(home, ".codex"), { recursive: true });
await writeFile(join(config, "opencode.json"), JSON.stringify({
  model: "openai/gpt-4o", small_model: "openai/gpt-4o", enabled_providers: ["openai"],
  provider: { openai: { options: { baseURL: endpoint.baseURL, apiKey: "fixture-only" } } },
}));
scaffoldAuthoringWorkspace({ root: source, name: "browser-authoring-fixture", style: "katas" });
await mkdir(join(source, "src/installed-start"), { recursive: true });
await writeFile(join(source, "src/installed-start/kata.ts"), "export const start = () => 0;\n");
await writeFile(join(source, "dojo.yaml"), "mode: katas\nname: browser-authoring-fixture\nversion: 0.0.1\ndescription: Learn pure functions.\ntest: npx vitest run {template}\nkatas:\n  - name: installed-start\n    template: src/installed-start/kata.ts\n");
await mkdir(join(source, ".dojo/kyoshi/tools"), { recursive: true });
await mkdir(join(source, ".dojo/kyoshi/skills/master-fixture"), { recursive: true });
await writeFile(join(source, ".dojo/kyoshi/instructions.md"), `${kyoshiInstructions()}\n\nMASTER_KYOSHI_INSTRUCTIONS\n`);
await writeFile(join(source, ".dojo/kyoshi/tools/course_question.ts"), 'export { default } from "@dojofoo/agent/tools/ask_question";\n');
await writeFile(join(source, ".dojo/kyoshi/skills/master-fixture/SKILL.md"), "---\nname: master-fixture\ndescription: Course-specific authoring fixture.\n---\nMASTER_KYOSHI_SKILL\n");
await mkdir(learning, { recursive: true });
await promisify(execFile)(process.execPath, [cli, "add", source, "--master"], {
  cwd: learning, timeout: 120_000,
  env: { ...process.env, DOJO_PROJECT_ROOT: learning, DOJOFOO_HOME: join(home, ".dojofoo"),
    DO_NOT_TRACK: "1", MISE_TRUSTED_CONFIG_PATHS: root },
});
let child;
let restart = false;
const stop = () => {
  if (!child?.pid) return;
  if (process.platform === "win32") child.kill("SIGTERM");
  else process.kill(-child.pid, "SIGTERM");
};
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
let port = String(reservation.address().port);
await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));
process.on("message", message => {
  if (message === "restart") { restart = true; stop(); }
});
process.once("SIGINT", () => { restart = false; stop(); });
process.once("SIGTERM", () => { restart = false; stop(); });
try {
do {
restart = false;
child = spawn(process.execPath, [cli, "ui", "--authoring", "--no-open"], {
  cwd: course, stdio: ["ignore", "pipe", "pipe"], detached: process.platform !== "win32",
  env: { ...process.env, NODE_ENV: "production", EVE_MOCK_AUTHORED_MODELS: "0",
    NODE_PATH: undefined,
    DOJO_EVE_ROOT: "", EVE_BASE_URL: "", DOJO_PROJECT_ROOT: undefined, DOJOFOO_HARNESS: "opencode",
    DOJO_UI_DISABLE_PORTLESS: "1",
    DOJO_CLI: cli, DOJOFOO_HOME: join(home, ".dojofoo"), PORT: port, DOJO_UI_BASE_URL: `http://127.0.0.1:${port}`,
    DOJOFOO_MODEL: "", DOJOFOO_AUTHORING_MODEL: "", DOJOFOO_LESSON_MODEL: "",
    MISE_TRUSTED_CONFIG_PATHS: root,
    MISE_DATA_DIR: process.env.MISE_DATA_DIR ?? join(homedir(), ".local/share/mise"),
    OPENCODE_BIN: opencode,
    HOME: home, XDG_CONFIG_HOME: join(home, "config"), XDG_DATA_HOME: join(home, "data"), XDG_CACHE_HOME: join(home, "cache"),
    CODEX_HOME: join(home, ".codex"),
    DEFAULT_AUTH_REQUEST: JSON.stringify({ methodId: "api-key" }),
    MODEL_PROVIDER: "dojo-loopback",
    CODEX_CONFIG: JSON.stringify({ model_provider: "dojo-loopback", model_providers: { "dojo-loopback": {
      name: "Dojo loopback", base_url: endpoint.baseURL, env_key: "CODEX_API_KEY", wire_api: "responses", requires_openai_auth: false,
    } } }),
    OPENAI_API_KEY: "fixture-only", CODEX_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL, AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "",
    PATH: `${resolve(import.meta.dirname, "../../node_modules/.bin")}:${process.env.PATH}`, CI: "", TEST: "",
  },
});
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
console.log(JSON.stringify({ course }));
const url = `http://127.0.0.1:${port}/`;
const deadline = Date.now() + 60_000;
while (true) {
  if (child.exitCode !== null) throw new Error(`Authoring CLI exited before startup (${child.exitCode})`);
  const response = await fetch(`${url}api/authoring/backend`).catch(() => null);
  if (response?.ok) break;
  if (response) throw new Error(`Authoring startup failed (${response.status}): ${await response.text()}`);
  if (Date.now() >= deadline) throw new Error("Authoring CLI did not become ready");
  await new Promise(resolve => setTimeout(resolve, 100));
}
process.send?.({ ready: true, url, course, root });
await once(child, "close");
} while (restart);
}
finally {
  if (child && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "close");
    stop();
    await exited;
  }
  console.log(JSON.stringify({ inference: endpoint.paths, requestedTools: endpoint.requestedTools,
    masterInstructionsLoaded: endpoint.requests.some(input => JSON.stringify(input).includes("MASTER_KYOSHI_INSTRUCTIONS")),
    customToolUsed: endpoint.requestedTools.some(name => name.endsWith("course_question")),
    completionRequests: endpoint.requests.filter(input => JSON.stringify(input.input ?? input.messages ?? []).includes("Complete this fixture lesson"))
      .map(input => ({ history: (input.input ?? input.messages).map(item => ({ role: item.role, type: item.type })),
        tools: input.tools?.map(tool => ({ type: tool.type, name: tool.name ?? tool.function?.name })) })) }));
  if (process.env.DOJO_AUTHORING_REQUEST_LOG) {
    await writeFile(process.env.DOJO_AUTHORING_REQUEST_LOG, JSON.stringify(endpoint.requests, null, 2));
  }
  await endpoint.close();
  await rm(root, { recursive: true, force: true });
  process.disconnect?.();
}
