import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@dojofoo/harness/client";
import { startLoopbackModel } from "./loopback-openai.mjs";

const eveRoot = new URL("./", import.meta.resolve("@dojofoo/harness/eve/package.json"));
const { createDevelopmentServer } = await import(new URL("dist/src/internal/nitro/host/start-development-server.js", eveRoot));
// OpenCode runs in a local sandbox; do not wait on an installed Docker CLI on close.
process.env.EVE_DOCKER_PATH ??= join(process.cwd(), "no-docker");

test("Eve HTTP host restores a real OpenCode question after host restart", { timeout: 180_000 }, async () => {
  const container = await realpath(await mkdtemp(join(process.cwd(), "native-host-")));
  const root = join(container, "app");
  // 1.0 resolves the agent directory inside its package.
  const agent = join(root, "agent");
  const runtimeRoot = join(container, "runtime");
  const endpoint = await startLoopbackModel({ toolRequest: {
    name: "ask_question", input: { question: "Review or continue?", options: [
      { label: "Review", description: "Review the lesson" }, { label: "Continue", description: "Continue learning" },
    ] },
  } });
  let server;
  try {
    await mkdir(join(agent, "tools"), { recursive: true });
    await mkdir(join(runtimeRoot, "home"), { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "native-host-fixture", private: true, type: "module" }));
    await writeFile(join(agent, "instructions.md"), "NATIVE_HOST_INSTRUCTIONS: Ask before continuing.\n");
    await writeFile(join(agent, "tools/ask_question.ts"), 'export { default } from "@dojofoo/harness/tools/ask_question";\n');
    const bin = fileURLToPath(new URL("./node_modules/.bin", import.meta.url));
    const environment = {
      PATH: `${bin}:${process.env.PATH}`, HOME: join(runtimeRoot, "home"),
      XDG_CONFIG_HOME: join(runtimeRoot, "home/config"),
      XDG_DATA_HOME: join(runtimeRoot, "home/data"),
      XDG_CACHE_HOME: join(runtimeRoot, "home/cache"), CI: "1",
    };
    await writeFile(join(agent, "agent.ts"), `
      import { defineAgent, defineDynamic } from "@dojofoo/harness";
      import { experimental_createHarnessModel, createLocalHarnessSandbox } from "@dojofoo/harness/adapters";
      import { createOpenCode } from "@ai-sdk/harness-opencode";
      export default defineAgent({
        build: { externalDependencies: ["@ai-sdk/harness-opencode", "@dojofoo/harness"] },
        model: defineDynamic(async () => {
          // As in Kyoshi: the sandbox is built where the model runs.
          const sandbox = createLocalHarnessSandbox(${JSON.stringify(runtimeRoot)}, {
            environment: ${JSON.stringify(environment)},
          });
          return { model: experimental_createHarnessModel({
            sandbox,
            model: "openai/gpt-4o", sandboxConfig: { workDir: "course" },
            harness: createOpenCode({
              auth: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: ${JSON.stringify(endpoint.baseURL)} },
              provider: "openai", port: 0, startupTimeoutMs: 30000,
              openCodeConfig: { small_model: "openai/gpt-4o", enabled_providers: ["openai"] },
            }),
          }, { mode: "full" }).model, modelContextWindowTokens: 32000 };
        }),
      });
    `);
    server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject", resume: true });
    const { url } = await server.start();
    const created = await new Client({ baseUrl: url }).sessions.create({
      message: "Introduce the lesson.", signal: AbortSignal.timeout(60_000),
    });
    const parked = await created.delivery.result({ signal: AbortSignal.timeout(60_000) });
    assert.equal(parked.status, "awaiting-input", JSON.stringify(parked));
    assert.equal(parked.interactions.length, 1, JSON.stringify(parked));
    assert.equal(parked.interactions[0].request.prompt, "Review or continue?");
    const { interactionId } = parked.interactions[0];
    const saved = JSON.parse(JSON.stringify(created.session.state));
    await server.close();
    server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject", resume: true });
    const restarted = await server.start();
    const restored = new Client({ baseUrl: restarted.url }).sessions.attach(saved.sessionId, saved);
    const answer = await restored.respond([{ interactionId, optionId: "Review" }], { signal: AbortSignal.timeout(60_000) });
    const answered = await answer.result({ signal: AbortSignal.timeout(60_000) });
    assert.equal(answered.reply, "Ready to teach.", JSON.stringify(answered));
    assert.equal(endpoint.requestedTools.length, 1, "Restart must not request the question again");
    const events = await Array.fromAsync(answer.stream({ signal: AbortSignal.timeout(60_000) }));
    const settled = events.filter(event => event.type === "interaction.settled" && event.data.interactionId === interactionId);
    assert.equal(settled.length, 1, JSON.stringify(events));
    assert.equal(settled[0].data.outcome, "accepted");
    const withAnswer = endpoint.requests.find(request => request.input?.some(item => item.type === "function_call_output"));
    const receipts = withAnswer?.input.filter(item => item.type === "function_call_output");
    assert.equal(receipts?.length, 1);
    assert.match(receipts[0].output, /Review/);
    assert.match(JSON.stringify(withAnswer.input), /Introduce the lesson/);
    assert.match(JSON.stringify(withAnswer.input), /NATIVE_HOST_INSTRUCTIONS/);
    const next = await (await restored.send("Continue teaching.", { signal: AbortSignal.timeout(60_000) })).result();
    assert.equal(next.reply, "Ready to teach.", JSON.stringify(next));
    const continued = endpoint.requests.find(request => JSON.stringify(request.input).includes("Continue teaching."));
    assert.match(JSON.stringify(continued?.input), /Review/);
  } finally {
    await server?.close();
    // The dev server terminates its worker without running process exit
    // handlers, so the sandbox's OpenCode outlives the host (which is also how
    // the pending question survives the restart). Reap it here.
    for (const line of execFileSync("ps", ["-axo", "pgid=,command="], { encoding: "utf8" }).split("\n")) {
      if (line.includes(runtimeRoot)) try { process.kill(-Number.parseInt(line), "SIGKILL"); } catch {}
    }
    await endpoint.close();
    await rm(container, { recursive: true, force: true });
  }
});
