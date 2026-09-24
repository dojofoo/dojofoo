import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { setImmediate as settleCallbacks } from "node:timers/promises";
import { Client } from "@dojofoo/agent/client";
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";
import { createEveAuthoringRoutes } from "@dojofoo/authoring/eve/server";
import { eveQuestion } from "@dojofoo/authoring/eve/messages";
import { startLoopbackModel } from "./loopback-openai.mjs";

// The same public CLI boundary used by Eve's framework integrations. No private
// server imports or custom HTTP routes; only inference is deterministic.
function startCli(root, home) {
  const executable = fileURLToPath(new URL("bin/eve.js", import.meta.resolve("@dojofoo/agent/eve/package.json")));
  return startServer(root, home, [executable, "dev", "--no-ui", "--host", "127.0.0.1", "--port", "0"]);
}

function startServer(root, home, args, env = {}, urlPattern = /http:\/\/127\.0\.0\.1:\d+/) {
  const child = spawn(process.execPath, args, {
    cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, HOME: home, CI: "1", NO_COLOR: "1", ...env },
  });
  let output = "";
  const ready = Promise.withResolvers();
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.once("error", ready.reject);
  child.once("exit", code => ready.reject(new Error(`Eve CLI exited (${code}): ${output}`)));
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

for (const browserMode of process.env.DOJO_AGENT_UI_ROOT ? [false, true] : [false]) {
test(`public Eve CLI restores a Pi question and native history after process restart (browser=${browserMode})`, { timeout: 180_000 }, async () => {
  const directory = await realpath(await mkdtemp(join(process.cwd(), "cli-host-")));
  const root = join(directory, "app");
  const runtime = join(directory, "runtime");
  const home = join(directory, "home");
  const endpoint = await startLoopbackModel({ toolRequest: {
    name: "ask_question", input: { prompt: "Review or continue?", options: [{ id: "review", label: "Review" }, { id: "next", label: "Continue" }] },
  } });
  let server;
  try {
    await Promise.all([mkdir(join(root, "tools"), { recursive: true }), mkdir(runtime), mkdir(home)]);
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "cli-host-fixture", private: true, type: "module", dependencies: { "@dojofoo/agent": "0.0.0" } }));
    await writeFile(join(root, "instructions.md"), "CLI_HOST_INSTRUCTIONS: Ask before continuing.\n");
    await writeFile(join(root, "tools/ask_question.ts"), 'export { default } from "@dojofoo/agent/tools/ask_question";\n');
    await writeFile(join(root, "agent.ts"), `
      import { defineAgent, defineDynamic } from "@dojofoo/agent";
      import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
      import { createLocalSandbox } from "@dojofoo/agent/experimental/local";
      import { createPi } from "@ai-sdk/harness-pi";
      export default defineAgent({
        build: { externalDependencies: ["@dojofoo/agent", "@ai-sdk/harness-pi"] },
        model: defineDynamic({ events: { "step.started": async () => ({
          model: experimental_createHarnessModel({
            harness: createPi({ auth: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: ${JSON.stringify(endpoint.baseURL)} } }),
            model: "openai/gpt-4o", permissionMode: "allow-all",
          }, { sandboxSession: await createLocalSandbox(${JSON.stringify(runtime)}) }).model,
          modelContextWindowTokens: 32000,
        }) } }),
      });
    `);
    server = startCli(root, home);
    const created = await new Client({ host: await server.url }).sessions.create({ message: "Introduce the lesson.", signal: AbortSignal.timeout(60_000) });
    const parked = await created.response.result();
    assert.equal(parked.inputRequests.length, 1, JSON.stringify(parked));
    const saved = JSON.parse(JSON.stringify(created.session.state));
    await server.close();
    if (!browserMode) server = startCli(root, home);
    if (browserMode) {
      // No EVE_BASE_URL: the UI server must own the authored runtime lifecycle,
      // in development and packaged builds, after the original CLI was stopped.
      const uiHost = await answerInBrowser({ root: process.env.DOJO_AGENT_UI_ROOT, course: runtime, agentRoot: root, home, sessionId: saved.sessionId });
      assert.equal(endpoint.requestedTools.length, 1);
      assert.equal(uiHost.receipt.optionId, "review");
      const receipts = endpoint.requests.flatMap(request => request.input?.filter(item => item.type === "function_call_output") ?? []);
      assert.equal(receipts.length, 1);
      const history = JSON.stringify(endpoint.requests.at(-1));
      for (const expected of ["Introduce the lesson", "CLI_HOST_INSTRUCTIONS", "review"]) assert.ok(history.includes(expected), expected);
      return;
    }
    const client = new Client({ host: await server.url });
    const api = createEveAuthoringRoutes(client);
    const snapshotResponse = await api.request(`/sessions/${saved.sessionId}`);
    assert.equal(snapshotResponse.status, 200);
    const snapshot = await snapshotResponse.json();
    assert.equal(snapshot.session.sessionId, saved.sessionId);
    const continued = Promise.withResolvers();
    let finished = false;
    const requests = [];
    const chat = new ChatClient({
      persistence: false, threadId: saved.sessionId,
      initialMessages: snapshot.messages,
      initialResumeSnapshot: snapshot.initialResumeSnapshot,
      connection: fetchServerSentEvents(`http://authoring.test/sessions/${saved.sessionId}/messages`, {
        fetchClient: (url, init) => {
          requests.push(JSON.parse(init.body));
          return api.fetch(new Request(url, init));
        },
      }),
      onChunk(chunk) {
        if (chunk.type === "RUN_ERROR") continued.reject(new Error(chunk.message));
        if (chunk.type === "RUN_FINISHED" && chunk.outcome?.type !== "interrupt") finished = true;
      },
      onInterruptStateChange(state) {
        // RUN_FINISHED precedes completion of the SDK's submission promise.
        // Disposing at that chunk races its final state publication.
        if (finished && !state.resuming) continued.resolve();
      },
      onError: continued.reject,
    });
    try {
      const question = chat.getInterrupts()[0];
      assert.equal(question?.id, parked.inputRequests[0].requestId);
      assert.equal(question.kind, "generic");
      assert.equal(question.canResolve, true);
      question.resolveInterrupt({ optionId: "review" });
      await continued.promise;
      // The public state notification itself runs inside submission cleanup.
      // Let that callback stack and its promise continuations finish before
      // assertions/disposal; this is an event-loop yield, not a timed retry.
      await settleCallbacks();
      assert.equal(requests.length, 1);
      assert.equal(requests[0].resume[0].interruptId, question.id);
      assert.equal(chat.getMessages().filter(message => message.role === "user").length, 1);
      const receipt = chat.getMessages().flatMap(message => message.parts)
        .filter(part => part.type === "tool-call").map(eveQuestion).find(Boolean);
      assert.equal(receipt?.response?.optionId, "review");
      assert.equal(receipt?.settled, true);
      assert.ok(chat.getMessages().some(message => message.parts.some(part => part.type === "text" && part.content === "Ready to teach.")));
    } finally { chat.dispose(); }
    assert.equal(endpoint.requestedTools.length, 1);
    const receipts = endpoint.requests.flatMap(request => request.input?.filter(item => item.type === "function_call_output") ?? []);
    assert.equal(receipts.length, 1);
    assert.match(receipts[0].output, /review/);
    const restored = client.sessions.attach(saved.sessionId, { streamIndex: (await client.sessions.attach(saved.sessionId).snapshot()).session.streamIndex });
    const next = await (await restored.send("Continue teaching.", { signal: AbortSignal.timeout(60_000) })).result();
    assert.equal(next.message, "Ready to teach.");
    const history = JSON.stringify(endpoint.requests.at(-1));
    for (const expected of ["Introduce the lesson", "CLI_HOST_INSTRUCTIONS", "review", "Continue teaching"]) assert.ok(history.includes(expected), expected);
  } finally {
    await server?.close();
    await endpoint.close();
    await rm(directory, { recursive: true, force: true });
  }
});
}

async function answerInBrowser({ root, course, agentRoot, home, sessionId }) {
  const require = createRequire(join(root, "package.json"));
  const { chromium, expect } = require("@playwright/test");
  const executable = fileURLToPath(new URL("bin/vite.js", `file://${require.resolve("vite/package.json")}`));
  await writeFile(join(course, "dojo.yaml"), "name: Native browser course\nmode: katas\ndescription: A deterministic authoring integration test\nkatas: []\n");
  const ui = startServer(root, home, [executable, "--host", "127.0.0.1", "--port", "0"], {
    DOJO_EVE_ROOT: agentRoot, DOJO_PROJECT_ROOT: course,
  }, /Local:\s+(http:\/\/127\.0\.0\.1:\d+)/);
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    const requests = [];
    const errors = [];
    const failedResponses = [];
    page.on("response", response => {
      if (response.status() >= 400) failedResponses.push(response.text().then(body => ({
        url: response.url(), status: response.status(), body,
      })));
    });
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => {
      if (request.method() === "POST") requests.push(new URL(request.url()).pathname);
    });
    await page.goto(`${await ui.url}/authoring?session=${encodeURIComponent(sessionId)}`);
    const review = page.getByRole("radio", { name: /Review/ });
    await expect(review).toBeVisible({ timeout: 30_000 });
    const [answerResponse] = await Promise.all([
      page.waitForResponse(response => response.request().method() === "POST"
        && new URL(response.url()).pathname === `/api/authoring/eve/sessions/${sessionId}/messages`),
      review.click(),
    ]);
    if (!answerResponse.ok()) {
      const snapshot = await new Client({ host: await ui.url }).sessions.attach(sessionId)
        .snapshot({ signal: AbortSignal.timeout(10_000) }).catch(error => ({ error: error.message }));
      throw new Error(JSON.stringify({ response: await answerResponse.text(), snapshot, host: ui.output() }));
    }
    try {
      await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible({ timeout: 60_000 });
    } catch (cause) {
      throw new Error(JSON.stringify({ errors, failedResponses: await Promise.all(failedResponses) }), { cause });
    }
    await expect(review).toHaveAttribute("aria-checked", "true");
    await page.reload();
    await expect(page.getByText("Ready to teach.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(review).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("alert")).toHaveCount(0);
    assert.deepEqual(requests, [`/api/authoring/eve/sessions/${sessionId}/messages`]);
    assert.deepEqual(errors, []);
    const response = await page.request.get(`${await ui.url}/api/authoring/eve/sessions/${sessionId}`);
    assert.equal(response.status(), 200);
    const snapshot = await response.json();
    const question = snapshot.messages.flatMap(message => message.parts)
      .filter(part => part.type === "tool-call").map(eveQuestion).find(Boolean);
    assert.equal(snapshot.session.sessionId, sessionId);
    assert.equal(question?.settled, true);
    return { receipt: question.response };
  } finally {
    await browser?.close();
    await ui.close();
  }
}
