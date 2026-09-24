import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { scaffoldAuthoringWorkspace } from "../scaffold.ts";
import { startLoopbackModel } from "../../../agent/experiments/model-provider/loopback-openai.mjs";
import { opencodeExecutable } from "../../../ui/src/server/harness/opencode.ts";

// Manual browser fixture: real UI/server/harness; only inference is loopback.
const root = await mkdtemp(join(tmpdir(), "dojo-kyoshi-browser-"));
const course = join(root, "course");
const home = join(root, "home");
// Resolve the installed CLI before isolating HOME. Otherwise trials can fall
// back to an unrelated (and potentially pre-ACP) executable on PATH.
const opencode = opencodeExecutable();
const endpoint = await startLoopbackModel({ toolRequest: {
  name: "dojo_ui_ask", input: { prompt: "Who should this course teach?", options: [
    { id: "beginner", label: "Beginners" }, { id: "experienced", label: "Experienced developers" },
  ] },
} });
const ui = fileURLToPath(new URL("../../../ui/", import.meta.url));
const require = createRequire(join(ui, "package.json"));
const config = join(home, "config/opencode");
await mkdir(config, { recursive: true });
await writeFile(join(config, "opencode.json"), JSON.stringify({
  model: "openai/gpt-4o", small_model: "openai/gpt-4o", enabled_providers: ["openai"],
  provider: { openai: { options: { baseURL: endpoint.baseURL, apiKey: "fixture-only" } } },
}));
scaffoldAuthoringWorkspace({ root: course, name: "Browser authoring fixture", style: "katas" });
let child;
let restart = false;
let port = "0";
process.on("message", message => {
  if (message === "restart") { restart = true; child?.kill("SIGTERM"); }
});
process.once("SIGINT", () => { restart = false; child?.kill("SIGTERM"); });
process.once("SIGTERM", () => { restart = false; child?.kill("SIGTERM"); });
try {
do {
restart = false;
child = spawn(process.execPath, [join(dirname(require.resolve("vite/package.json")), "bin/vite.js"), "--host", "127.0.0.1", "--port", port], {
  cwd: ui, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, NODE_ENV: "development", EVE_MOCK_AUTHORED_MODELS: "0",
    DOJO_EVE_ROOT: "", EVE_BASE_URL: "", DOJO_PROJECT_ROOT: course, DOJOFOO_HARNESS: "opencode",
    OPENCODE_BIN: opencode,
    HOME: home, XDG_CONFIG_HOME: join(home, "config"), XDG_DATA_HOME: join(home, "data"), XDG_CACHE_HOME: join(home, "cache"),
    OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: endpoint.baseURL, AI_GATEWAY_API_KEY: "", VERCEL_OIDC_TOKEN: "",
    PATH: `${resolve(import.meta.dirname, "../../node_modules/.bin")}:${process.env.PATH}`, CI: "1",
  },
});
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
console.log(JSON.stringify({ course }));
let output = "";
child.stdout.on("data", chunk => {
  output += chunk;
  const url = output.match(/Local:\s+(http:\/\/127\.0\.0\.1:(\d+)\/)/);
  if (url) {
    port = url[2];
    process.send?.({ ready: true, url: url[1], course });
    output = "";
  }
});
await once(child, "exit");
} while (restart);
}
finally {
  await endpoint.close();
  await rm(root, { recursive: true, force: true });
  process.disconnect?.();
}
