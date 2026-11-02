import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { Client } from "@dojofoo/agent/client";
import { startLoopbackModel } from "./loopback-openai.mjs";

// The same public CLI boundary used by Eve's framework integrations. No private
// server imports or custom HTTP routes; only inference is deterministic.
function startCli(root, home) {
  const executable = fileURLToPath(new URL("bin/eve.js", import.meta.resolve("@dojofoo/agent/eve/package.json")));
  return startServer(root, home, [executable, "dev", "--no-ui", "--host", "127.0.0.1", "--port", "0", "--resume"]);
}

function startServer(root, home, args, env = {}, urlPattern = /http:\/\/127\.0\.0\.1:\d+/) {
  const child = spawn(process.execPath, args, {
    cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"],
    // Pi runs in a local sandbox; a nonexistent Docker CLI keeps shutdown from
    // waiting on an installed CLI whose daemon is down.
    env: { PATH: process.env.PATH, HOME: home, CI: "1", NO_COLOR: "1", EVE_DOCKER_PATH: join(home, "no-docker"), ...env },
  });
  let output = "";
  const ready = Promise.withResolvers();
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.once("error", ready.reject);
  child.once("exit", (code, signal) => ready.reject(new Error(`Server exited (${code ?? signal}, ${args[0]}): ${output}`)));
  for (const stream of [child.stdout, child.stderr]) stream.on("data", chunk => {
    output += chunk.toString();
    const match = output.match(urlPattern);
    const url = match?.[1] ?? match?.[0];
    if (url) ready.resolve(url);
  });
  const timer = setTimeout(() => ready.reject(new Error(`Eve CLI startup timed out: ${output}`)), 60_000);
  return {
    output: () => output,
    url: ready.promise.finally(() => clearTimeout(timer)),
    async close() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      process.kill(-child.pid, "SIGTERM");
      const timeout = setTimeout(() => {
        try { process.kill(-child.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
      }, 10_000);
      try { await exited; } finally { clearTimeout(timeout); }
    },
  };
}

test("public Eve CLI restores a Pi question and native history after process restart", { timeout: 180_000 }, async () => {
  const directory = await realpath(await mkdtemp(join(process.cwd(), "cli-host-")));
  const root = join(directory, "app");
  // 1.0 resolves the agent directory inside its package.
  const agent = join(root, "agent");
  const runtime = join(directory, "runtime");
  const home = join(directory, "home");
  const endpoint = await startLoopbackModel({ toolRequest: {
    name: "ask_question", input: { question: "Review or continue?", options: [{ label: "Review", description: "Review the lesson" }, { label: "Continue", description: "Continue learning" }] },
  } });
  let server;
  try {
    await Promise.all([mkdir(join(agent, "tools"), { recursive: true }), mkdir(runtime), mkdir(home)]);
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "cli-host-fixture", private: true, type: "module", dependencies: { "@dojofoo/agent": "0.0.0" } }));
    await writeFile(join(agent, "instructions.md"), "CLI_HOST_INSTRUCTIONS: Ask before continuing.\n");
    await writeFile(join(agent, "tools/ask_question.ts"), 'export { default } from "@dojofoo/agent/tools/ask_question";\n');
    await writeFile(join(agent, "agent.ts"), `
      import { defineAgent, defineDynamic } from "@dojofoo/agent";
      import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
      import { createLocalSandbox } from "@dojofoo/agent/experimental/local";
      import { createPi } from "@ai-sdk/harness-pi";
      export default defineAgent({
        build: { externalDependencies: ["@dojofoo/agent", "@ai-sdk/harness-pi"] },
        model: defineDynamic(async () => ({
          model: experimental_createHarnessModel({
            harness: createPi({ auth: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: ${JSON.stringify(endpoint.baseURL)} } }),
            model: "openai/gpt-4o", permissionMode: "allow-all",
          }, { sandboxSession: await createLocalSandbox(${JSON.stringify(runtime)}) }).model,
          modelContextWindowTokens: 32000,
        })),
      });
    `);
    server = startCli(root, home);
    const created = await new Client({ baseUrl: await server.url }).sessions.create({ message: "Introduce the lesson.", signal: AbortSignal.timeout(60_000) });
    const parked = await created.delivery.result({ signal: AbortSignal.timeout(60_000) });
    assert.equal(parked.status, "awaiting-input", JSON.stringify(parked));
    assert.equal(parked.interactions.length, 1, JSON.stringify(parked));
    const { interactionId } = parked.interactions[0];
    const saved = JSON.parse(JSON.stringify(created.session.state));
    await server.close();
    server = startCli(root, home);
    const client = new Client({ baseUrl: await server.url });
    // A client with no saved state must see the restored, still-open question
    // in the session's own snapshot after the CLI restart.
    const snapshot = await client.sessions.attach(saved.sessionId).snapshot({ signal: AbortSignal.timeout(30_000) });
    assert.equal(snapshot.session.sessionId, saved.sessionId);
    const open = snapshot.events.filter(event => event.type === "interaction.opened");
    assert.deepEqual(open.map(event => event.data.interactionId), [interactionId]);
    assert.equal(open[0].data.request.prompt, "Review or continue?");
    assert.ok(!snapshot.events.some(event => event.type === "interaction.settled"), "The question is still open after restart");
    const restored = client.sessions.attach(saved.sessionId, snapshot.session);
    const answer = await restored.respond([{ interactionId, optionId: "Review" }], { signal: AbortSignal.timeout(60_000) });
    const answered = await answer.result({ signal: AbortSignal.timeout(60_000) });
    assert.equal(answered.status, "completed", JSON.stringify(answered));
    assert.equal(answered.reply, "Ready to teach.");
    const events = await Array.fromAsync(answer.stream({ signal: AbortSignal.timeout(60_000) }));
    const settled = events.filter(event => event.type === "interaction.settled" && event.data.interactionId === interactionId);
    assert.equal(settled.length, 1, JSON.stringify(events));
    assert.equal(settled[0].data.outcome, "accepted");
    assert.equal(settled[0].data.response?.optionId, "Review");
    // Answering resumes the parked turn; it must not invent a learner message.
    assert.ok(!events.some(event => event.type === "turn.started"), JSON.stringify(events));
    assert.ok(events.filter(event => event.type === "delivery.consumed").every(event => event.data.parts.length === 0), JSON.stringify(events));
    assert.equal(endpoint.requestedTools.length, 1);
    const receipts = endpoint.requests.flatMap(request => request.input?.filter(item => item.type === "function_call_output") ?? []);
    assert.equal(receipts.length, 1);
    assert.match(receipts[0].output, /Review/);
    const next = await (await restored.send("Continue teaching.", { signal: AbortSignal.timeout(60_000) })).result({ signal: AbortSignal.timeout(60_000) });
    assert.equal(next.reply, "Ready to teach.", JSON.stringify(next));
    const history = JSON.stringify(endpoint.requests.at(-1));
    for (const expected of ["Introduce the lesson", "CLI_HOST_INSTRUCTIONS", "Review", "Continue teaching"]) assert.ok(history.includes(expected), expected);
    // Optional upgrade artifact: real persisted data, generated only by the
    // loopback fixture (never a user's conversation or credentials).
    if (process.env.DOJO_AGENT_CAPTURE_LEGACY_HISTORY) {
      const target = process.env.DOJO_AGENT_CAPTURE_LEGACY_HISTORY;
      const snapshot = await restored.snapshot();
      await server.close();
      await mkdir(target, { recursive: true });
      await cp(root, join(target, "app"), { recursive: true });
      await writeFile(join(target, "snapshot.json"), JSON.stringify(snapshot, null, 2));
    }
  } finally {
    await server?.close();
    await endpoint.close();
    await rm(directory, { recursive: true, force: true });
  }
});
