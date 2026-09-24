import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@dojofoo/agent/client";
import { startLoopbackModel } from "./loopback-openai.mjs";
import { createLocalSandbox, registerLocalProcessHost } from "@dojofoo/agent/experimental/local";

const eveRoot = new URL("./", import.meta.resolve("@dojofoo/agent/eve/package.json"));
const { createDevelopmentServer } = await import(new URL("dist/src/internal/nitro/host/start-development-server.js", eveRoot));

test("Eve HTTP host restores a real OpenCode question after host restart", { timeout: 180_000 }, async () => {
  const container = await realpath(await mkdtemp(join(process.cwd(), "native-host-")));
  const root = join(container, "app");
  const runtimeRoot = join(container, "runtime");
  const endpoint = await startLoopbackModel({ toolRequest: {
    name: "ask_question", input: { prompt: "Review or continue?", options: [
      { id: "review", label: "Review" }, { id: "next", label: "Continue" },
    ] },
  } });
  let server;
  let processHost;
  try {
    await mkdir(root);
    await mkdir(join(runtimeRoot, "home"), { recursive: true });
    await mkdir(join(root, "tools"));
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "native-host-fixture", private: true, type: "module" }));
    await writeFile(join(root, "instructions.md"), "NATIVE_HOST_INSTRUCTIONS: Ask before continuing.\n");
    await writeFile(join(root, "tools/ask_question.ts"), 'export { default } from "@dojofoo/agent/tools/ask_question";\n');
    const bin = fileURLToPath(new URL("./node_modules/.bin", import.meta.url));
    processHost = registerLocalProcessHost(await createLocalSandbox(runtimeRoot, { environment: {
      PATH: `${bin}:${process.env.PATH}`, HOME: join(runtimeRoot, "home"),
      XDG_CONFIG_HOME: join(runtimeRoot, "home/config"),
      XDG_DATA_HOME: join(runtimeRoot, "home/data"),
      XDG_CACHE_HOME: join(runtimeRoot, "home/cache"), CI: "1",
    } }));
    await writeFile(join(root, "agent.ts"), `
      import { defineAgent, defineDynamic } from "@dojofoo/agent";
      import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
      import { createOpenCode } from "@ai-sdk/harness-opencode";
      import { createLocalSandbox, requestLocalProcessHost } from "@dojofoo/agent/experimental/local";
      const root = ${JSON.stringify(runtimeRoot)};
      export default defineAgent({
        build: { externalDependencies: ["@ai-sdk/harness-opencode", "@dojofoo/agent"] },
        model: defineDynamic({ events: {
        "step.started": async () => {
          const processHost = await requestLocalProcessHost(${JSON.stringify(processHost.connection)});
          const acquire = () => createLocalSandbox(root, { processHost });
          const sandbox = {
            specificationVersion: "harness-sandbox-v1",
            providerId: "local-native-host-fixture",
            async createSession(options) {
              options?.abortSignal?.throwIfAborted();
              const session = await acquire();
              await options?.onFirstCreate?.(session, { abortSignal: options.abortSignal });
              return session;
            },
            resumeSession: acquire,
          };
          return { model: experimental_createHarnessModel({
            sandbox,
            model: "openai/gpt-4o", sandboxConfig: { workDir: "course" },
            harness: createOpenCode({
              auth: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: ${JSON.stringify(endpoint.baseURL)} },
              provider: "openai", port: 0, startupTimeoutMs: 30000,
              openCodeConfig: { small_model: "openai/gpt-4o", enabled_providers: ["openai"] },
            }),
          }).model, modelContextWindowTokens: 32000 };
        },
      } }) });
    `);
    server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject" });
    const { url } = await server.start();
    const created = await new Client({ host: url }).sessions.create({
      message: "Introduce the lesson.", signal: AbortSignal.timeout(60_000),
    });
    const parked = await created.response.result();
    assert.equal(parked.inputRequests.length, 1, JSON.stringify(parked));
    assert.equal(parked.inputRequests[0].prompt, "Review or continue?");
    const saved = JSON.parse(JSON.stringify(created.session.state));
    await server.close();
    server = createDevelopmentServer(root, { host: "127.0.0.1", port: 0, existing: "reject" });
    const restarted = await server.start();
    const restored = new Client({ host: restarted.url }).sessions.attach(saved.sessionId, { streamIndex: saved.streamIndex });
    const answered = await (await restored.respond([{
      requestId: parked.inputRequests[0].requestId, optionId: "review",
    }], { signal: AbortSignal.timeout(60_000) })).result();
    assert.equal(answered.message, "Ready to teach.", JSON.stringify(answered));
    assert.equal(endpoint.requestedTools.length, 1, "Restart must not request the question again");
    const resolutions = answered.events.filter(event => event.type === "input.resolved")
      .flatMap(event => event.data.resolutions);
    assert.equal(resolutions.filter(item => item.requestId === parked.inputRequests[0].requestId).length, 1);
    const withAnswer = endpoint.requests.find(request => request.input?.some(item => item.type === "function_call_output"));
    const receipts = withAnswer?.input.filter(item => item.type === "function_call_output");
    assert.equal(receipts?.length, 1);
    assert.match(receipts[0].output, /review/);
    assert.match(JSON.stringify(withAnswer.input), /Introduce the lesson/);
    assert.match(JSON.stringify(withAnswer.input), /NATIVE_HOST_INSTRUCTIONS/);
    const next = await (await restored.send("Continue teaching.", { signal: AbortSignal.timeout(60_000) })).result();
    assert.equal(next.message, "Ready to teach.");
    const continued = endpoint.requests.find(request => JSON.stringify(request.input).includes("Continue teaching."));
    assert.match(JSON.stringify(continued?.input), /review/);
    await processHost.close();
    const remaining = execFileSync("ps", ["-axo", "command"], { encoding: "utf8" })
      .split("\n").filter(command => command.includes(runtimeRoot));
    assert.deepEqual(remaining, [], "Provider-owned sandbox shutdown must not leave native processes");
  } finally {
    await server?.close();
    await processHost?.close();
    await endpoint.close();
    await rm(container, { recursive: true, force: true });
  }
});
