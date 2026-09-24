import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Readable } from "node:stream";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { HarnessAgent } from "@ai-sdk/harness/agent";
import { generateText, jsonSchema } from "ai";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
import { createRuntime } from "./opencode-runtime.fixture.mjs";
import { startLoopbackModel } from "./loopback-openai.mjs";

async function runWorker(input) {
  const child = spawn(process.execPath, [fileURLToPath(new URL("./opencode-recovery-worker.mjs", import.meta.url))], { stdio: "pipe" });
  const closed = once(child, "close");
  child.stdin.end(JSON.stringify(input));
  const [stdout, stderr, [code]] = await Promise.all([
    new Response(Readable.toWeb(child.stdout)).text(), new Response(Readable.toWeb(child.stderr)).text(), closed,
  ]);
  assert.equal(code, 0, stderr);
  return JSON.parse(stdout);
}

for (const backend of ["official", "provider", "process", "eve", "eve-tools", "eve-question", "eve-native"]) test(`OpenCode runs and resumes native history through ${backend}`, { timeout: 120000 }, async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-opencode-startup-")));
  const home = join(root, "home");
  await mkdir(home);
  const evidence = `NATIVE_FILE_EVIDENCE_${root.split("/").at(-1)}`;
  await mkdir(join(root, "course"));
  const lessonFile = join(root, "course", "lesson.txt");
  await writeFile(lessonFile, evidence);
  const endpoint = await startLoopbackModel({ toolRequest: backend === "eve-tools"
    ? { name: "lesson_context", input: {} }
    : backend === "eve-question" ? { name: "dojo_ui_ask", input: { prompt: "Review or move on?" } }
    : backend === "eve-native" ? { name: "read", input: { filePath: lessonFile } } : undefined });
  const { sandboxSession, runtime } = await createRuntime(root, endpoint.baseURL);
  try {
    if (backend === "eve-question") {
      const eveRoot = new URL("./", import.meta.resolve("@dojofoo/agent/eve/package.json"));
      const { createToolLoopHarness } = await import(new URL("dist/src/harness/tool-loop.js", eveRoot));
      const events = [];
      const definition = { name: "dojo_ui_ask", description: "Ask the author", inputSchema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] } };
      const config = { mode: "conversation", capabilities: { requestInput: true },
        resolveModel: async () => experimental_createHarnessModel(runtime, { sandboxSession }).model,
        handleEvent: async event => { events.push(event); },
        tools: new Map([[definition.name, { ...definition, inputSchema: jsonSchema(definition.inputSchema),
          behavior: { availability: ["requires-request-input"], handling: { kind: "request-input", request: "question" } },
        }]]),
      };
      const session = { agent: { modelReference: { id: "local-opencode" }, system: "Ask the author how to proceed.", tools: [definition] },
        compaction: { recentWindowSize: 10, threshold: 100000 }, continuationToken: "native-question", sessionId: "native-question", history: [] };
      const parked = await createToolLoopHarness(config)(session, { message: "Introduce the lesson." });
      assert.equal(parked.next, null);
      assert.equal(parked.settledTurn, undefined);
      const request = events.find(event => event.type === "input.requested")?.data.requests[0];
      assert.equal(request?.prompt, "Review or move on?");
      const resumed = await createToolLoopHarness(config)(JSON.parse(JSON.stringify(parked.session)), {
        inputResponses: [{ requestId: request.requestId, text: "Review" }],
      });
      assert.equal(resumed.settledTurn?.output, "Ready to teach.");
      assert.equal(events.filter(event => event.type === "input.resolved").length, 1);
      const resultRequest = endpoint.requests.find(request => request.input?.some(item => item.type === "function_call_output"));
      const outputs = resultRequest?.input.filter(item => item.type === "function_call_output");
      assert.equal(outputs?.length, 1);
      assert.match(outputs[0].output, /Review/);
      return;
    } else if (backend.startsWith("eve")) {
      const eveRoot = new URL("./", import.meta.resolve("@dojofoo/agent/eve/package.json"));
      const { createToolLoopHarness } = await import(new URL("dist/src/harness/tool-loop.js", eveRoot));
      const definition = { name: "lesson_context", description: "Read the current lesson context", inputSchema: { type: "object", properties: {}, additionalProperties: false } };
      let executions = 0;
      const tools = backend === "eve-tools" ? new Map([[definition.name, {
        ...definition, inputSchema: jsonSchema(definition.inputSchema),
        execute: async () => { executions++; return "LESSON_CONTEXT_EVIDENCE"; },
      }]]) : new Map();
      let session = {
        agent: { modelReference: { id: "local-opencode" }, system: "Teach one concept at a time.", tools: tools.size ? [definition] : [] },
        compaction: { recentWindowSize: 10, threshold: 100000 },
        continuationToken: "native-eve-test", sessionId: "native-eve-test", history: [],
      };
      for (const message of ["Introduce the lesson.", "Continue the lesson."]) {
        const { model } = experimental_createHarnessModel(runtime, { sandboxSession });
        let step = createToolLoopHarness({ mode: "conversation", resolveModel: async () => model, tools });
        let output;
        for (let index = 0; step && index < 5; index++) {
          const result = await step(JSON.parse(JSON.stringify(session)), index === 0 ? { message } : undefined);
          session = result.session;
          if (result.settledTurn) output = result.settledTurn.output;
          step = typeof result.next === "function" ? result.next : null;
        }
        assert.equal(step, null);
        assert.equal(output, "Ready to teach.");
      }
      assert.match(JSON.stringify(session.history), /Introduce the lesson\./);
      assert.match(JSON.stringify(session.history), /Continue the lesson\./);
      if (backend === "eve-tools") {
        assert.equal(executions, 1);
        assert.equal(endpoint.requestedTools.length, 1);
        assert.ok(endpoint.requests.some(request => JSON.stringify(request).includes("LESSON_CONTEXT_EVIDENCE")));
      }
      if (backend === "eve-native") {
        assert.equal(executions, 0, "Eve must not execute the harness's native file tool");
        assert.deepEqual(endpoint.requestedTools, ["read"]);
        const nativeResults = endpoint.requests.flatMap(request => request.input ?? [])
          .filter(item => item.type === "function_call_output" && item.output?.includes(evidence));
        assert.ok(nativeResults.length > 0, `Real file contents must reach the native model: ${JSON.stringify(endpoint.requests.flatMap(request => request.input ?? []).filter(item => item.type === "function_call_output"))}`);
        assert.match(JSON.stringify(session.history), /NATIVE_FILE_EVIDENCE_/);
      }
    } else if (backend !== "official") {
      const makeModel = () => experimental_createHarnessModel(runtime, { sandboxSession }).model;
      const generate = async messages => {
        if (backend === "process") return runWorker({ root, baseURL: endpoint.baseURL, messages });
        const result = await generateText({ model: makeModel(), messages, abortSignal: AbortSignal.timeout(90000), maxRetries: 0 });
        return { text: result.text, messages: result.response.messages };
      };
      const first = await generate([{ role: "user", content: "Introduce the lesson." }]);
      assert.equal(first.text, "Ready to teach.");
      const history = JSON.parse(JSON.stringify(first.messages));
      const second = await generate([...history, { role: "user", content: "Continue the lesson." }]);
      assert.equal(second.text, "Ready to teach.");
      if (backend === "process") {
        assert.notEqual(first.pid, second.pid);
        assert.notEqual(first.pid, process.pid);
        assert.notEqual(second.pid, process.pid);
      }
      const sessionId = messages => messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
        .map(part => part.providerOptions?.harness?.sessionId).find(Boolean);
      assert.ok(sessionId(history));
      assert.equal(sessionId(second.messages), sessionId(history));
    } else {
      const agent = new HarnessAgent(runtime);
      const session = await agent.createSession({ sandboxSession, abortSignal: AbortSignal.timeout(90000) });
      assert.ok(session.sessionId);
      const first = await agent.generate({ session, prompt: "Introduce the lesson.", abortSignal: AbortSignal.timeout(30000) });
      assert.equal(first.text, "Ready to teach.");
      const checkpoint = await session.stop();
      assert.ok(checkpoint, "Stopping must return the official lifecycle checkpoint");
      const resumed = await agent.createSession({ sandboxSession, sessionId: session.sessionId, resumeFrom: JSON.parse(JSON.stringify(checkpoint)), abortSignal: AbortSignal.timeout(30000) });
      const second = await agent.generate({ session: resumed, prompt: "Continue the lesson.", abortSignal: AbortSignal.timeout(30000) });
      assert.equal(second.text, "Ready to teach.");
      assert.equal(resumed.sessionId, session.sessionId);
      await resumed.stop();
    }
    assert.ok(endpoint.requests.some(request => JSON.stringify(request).includes("Introduce the lesson.")));
    const continuation = endpoint.requests.find(request => JSON.stringify(request).includes("Continue the lesson."));
    assert.ok(continuation);
    assert.match(JSON.stringify(continuation), /Introduce the lesson\./);
    assert.match(JSON.stringify(continuation), /Ready to teach\./);
  } finally {
    await sandboxSession.stop();
    await endpoint.close();
    await rm(root, { recursive: true, force: true });
  }
});
