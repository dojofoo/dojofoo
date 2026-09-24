import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createJustBashSandbox } from "@ai-sdk/sandbox-just-bash";
import { generateText, jsonSchema, Output, streamText, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { defineAgent } from "@dojofoo/agent";
import { experimental_createHarnessModel as createHarnessModel } from "@dojofoo/agent/experimental";

// Exercise the exact runtime shipped to consumers, not a workspace dependency.
const eveRoot = new URL("./", import.meta.resolve("@dojofoo/agent/eve/package.json"));
const { createToolLoopHarness } = await import(new URL("dist/src/harness/tool-loop.js", eveRoot));
const { compactMessages } = await import(new URL("dist/src/harness/compaction.js", eveRoot));
const { compileAgentConfig } = await import(new URL("dist/src/compiler/normalize-agent-config.js", eveRoot));
const { ContextContainer, contextStorage } = await import(new URL("dist/src/context/container.js", eveRoot));
const { SessionKey } = await import(new URL("dist/src/context/keys.js", eveRoot));
const { resolveRuntimeModelSelection } = await import(new URL("dist/src/runtime/agent/resolve-model.js", eveRoot));
const { resolveWebSearchBackend } = await import(new URL("dist/src/harness/provider-tools.js", eveRoot));

test("dynamic external models retain provider routing without injecting Gateway tools", {
  skip: process.env.EVE_NATIVE_COMPACTION !== "1",
}, async () => {
  for (const [provider, expected] of [
    ["harness", null],
    ["custom.provider", null],
    ["openai.responses", "openai"],
    ["anthropic.messages", "anthropic"],
    ["google.generative-ai", "google"],
    ["gateway", "exa"],
  ]) {
    const model = new MockLanguageModelV4({ provider, modelId: "fixture" });
    const { reference } = await resolveRuntimeModelSelection({
      selection: { model, modelContextWindowTokens: 32_000 },
      durability: "ephemeral",
      state: new ContextContainer(),
    });
    assert.equal(reference.provider, provider);
    assert.equal(resolveWebSearchBackend(reference), expected);
  }
  assert.equal(resolveWebSearchBackend({ id: "openai/gpt-4o" }), "exa");
  assert.equal(resolveWebSearchBackend({ id: "openai/gpt-4o" }, "parallel"), "parallel");
  assert.equal(resolveWebSearchBackend({
    id: "harness/fixture", source: { logicalPath: "agent.ts" },
  }), null);
});
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const finish = { unified: "stop", raw: "stop" };
const text = value => [
  { type: "text-start", id: "t" },
  ...value.split(" ").map((word, index) => ({ type: "text-delta", id: "t", delta: `${index ? " " : ""}${word}` })),
  { type: "text-end", id: "t" },
  { type: "finish-step", finishReason: finish, usage },
  { type: "finish", finishReason: finish, totalUsage: usage },
];

test("the package reexports Eve and the official HarnessAgent without wrapping them", async () => {
  const [facade, eve, harness, official] = await Promise.all([
    import("@dojofoo/agent"), import(new URL("dist/src/index.js", eveRoot)),
    import("@dojofoo/agent/harness"), import("@ai-sdk/harness/agent"),
  ]);
  assert.deepEqual(Object.keys(facade), Object.keys(eve));
  for (const key of Object.keys(eve)) assert.equal(facade[key], eve[key]);
  assert.equal(harness.HarnessAgent, official.HarnessAgent);
  const [server, upstreamServer] = await Promise.all([
    import("@dojofoo/agent/server"),
    import(new URL("dist/src/internal/nitro/host/start-development-server.js", eveRoot)),
  ]);
  assert.equal(server.createDevelopmentServer, upstreamServer.createDevelopmentServer);
});

test("Eve compiles an authored harness model as an external provider without catalog access", async () => {
  const adapter = fixture();
  const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox() });
  const definition = defineAgent({ model, modelContextWindowTokens: 32_000 });
  const source = { sourceKind: "module", sourceId: "author-agent", logicalPath: "agent.ts", exportName: "default" };
  const compiled = await compileAgentConfig(
    { agentId: "author", appRoot: process.cwd(), agentRoot: process.cwd() },
    { modelCatalog: {
      getModelLimits() { assert.fail("Explicit context limits must not query the gateway"); },
      getByProviderModelId() { assert.fail("A local harness must not need gateway discovery"); },
    } },
    { definition, source, binding: { backing: { kind: "programmatic" } } },
  );
  assert.equal(definition.model, model);
  assert.equal(compiled.model.id, "harness/provider-fixture");
  assert.equal(compiled.model.contextWindowTokens, 32_000);
  assert.deepEqual(compiled.model.routing, { kind: "external", provider: "harness" });
  assert.deepEqual(compiled.model.source, source);
  assert.deepEqual(adapter.starts, []);
});

// Only the adapter is scripted. Eve, AI SDK and HarnessAgent execute normally.
test("JSON schema requests reach HarnessAgent and survive an external tool continuation", async () => {
  const adapter = fixture(false, false, '{"ready":true}');
  const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox() });
  const schema = { type: "object", properties: { ready: { type: "boolean" } }, required: ["ready"], additionalProperties: false };
  const output = Output.object({ schema: jsonSchema(schema), name: "lesson-status", description: "Lesson readiness" });
  const tools = { echo: tool({ inputSchema: jsonSchema({ type: "object", properties: { value: { type: "string" } } }) }) };
  const first = await generateText({ model, output, tools, prompt: "Use the tool." });
  assert.equal(first.toolCalls.length, 1);
  const second = await generateText({ model, output, tools, messages: [
    { role: "user", content: "Use the tool." }, ...first.response.messages,
    { role: "tool", content: [{ type: "tool-result", toolCallId: first.toolCalls[0].toolCallId, toolName: "echo", output: { type: "text", value: "confirmed" } }] },
  ] });
  assert.deepEqual(second.output, { ready: true });
  const expected = { type: "json", schema, name: "lesson-status", description: "Lesson readiness" };
  assert.deepEqual(adapter.prompts[0].responseFormat, expected);
  assert.deepEqual(adapter.continuations[0].responseFormat, expected);
  assert.equal(adapter.results.length, 1);
});

for (const valid of [true, false]) test(`schemaless JSON uses official output parsing (valid=${valid})`, async () => {
  const adapter = fixture(false, false, valid ? '{"ready":true}' : "not JSON");
  const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox() });
  const operation = generateText({ model, output: Output.json(), prompt: "Report readiness." });
  if (valid) assert.deepEqual((await operation).output, { ready: true });
  else await assert.rejects(operation, /JSON|parse|output/i);
  assert.equal(adapter.prompts[0].responseFormat.type, "json");
  assert.equal(adapter.active, 0);
});

for (const data of [
  { type: "data", data: new Uint8Array([0, 1, 255]) },
  { type: "url", url: new URL("https://example.invalid/diagram.svg") },
  { type: "text", text: "A learner's notes" },
  { type: "reference", reference: { fixture: "file-123" } },
]) test(`structured user file reaches the official adapter unchanged (${data.type})`, async () => {
  const adapter = fixture();
  const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox() });
  const message = { role: "user", content: [
    { type: "text", text: "Discuss this attachment." },
    { type: "file", data, mediaType: "application/octet-stream", filename: "lesson.bin", providerOptions: { fixture: { detail: "original" } } },
  ] };
  await model.doGenerate({ prompt: [message] });
  assert.deepEqual(adapter.prompts[0].prompt, message);
  assert.equal(adapter.active, 0);
});

test("incremental tool input retains order and arguments", async () => {
  const events = [
    { type: "tool-input-start", id: "native-1", toolName: "shell", title: "Inspect lesson", providerExecuted: true, dynamic: true },
    { type: "tool-input-delta", id: "native-1", delta: '{"command":' },
    { type: "tool-input-delta", id: "native-1", delta: '"pwd"}' },
    { type: "tool-input-end", id: "native-1" },
    { type: "tool-call", toolCallId: "native-1", toolName: "shell", input: '{"command":"pwd"}', providerExecuted: true, dynamic: true },
    { type: "tool-result", toolCallId: "native-1", toolName: "shell", result: "/course", dynamic: true },
    ...text("Inspected."),
  ];
  const adapter = fixture(false, false, events);
  const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox() });
  const result = streamText({ model, prompt: "Inspect." });
  const parts = await Array.fromAsync(result.fullStream);
  const inputs = parts.filter(part => part.type.startsWith("tool-input-"));
  assert.equal(inputs[0].toolName, "shell");
  assert.deepEqual(inputs.map(part => part.type), ["tool-input-start", "tool-input-delta", "tool-input-delta", "tool-input-end"]);
  assert.equal(inputs.filter(part => part.type === "tool-input-delta").map(part => part.delta).join(""), '{"command":"pwd"}');
  assert.ok(parts.indexOf(inputs.at(-1)) < parts.findIndex(part => part.type === "tool-call"));
  assert.equal(await result.text, "Inspected.");
  assert.equal(adapter.active, 0);
});

test("unsupported model options produce warnings in both generate and stream", async () => {
  const adapter = fixture();
  const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox() });
  const options = { prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }], temperature: 0, maxOutputTokens: 100, topP: 0.2, topK: 2, stopSequences: ["end"], presencePenalty: 0, frequencyPenalty: 0, seed: 1, reasoning: "high", toolChoice: { type: "required" }, providerOptions: { vendor: { custom: true } }, includeRawChunks: true };
  const generated = await model.doGenerate(options);
  const streamed = await Array.fromAsync((await model.doStream(options)).stream);
  const warnings = streamed.find(part => part.type === "stream-start").warnings;
  assert.equal(warnings.length, 12);
  assert.deepEqual(generated.warnings, warnings);
  assert.ok(warnings.every(warning => warning.type === "unsupported"));
});

test("per-call headers reach the official adapter without mutating runtime defaults", async () => {
  const adapter = fixture();
  const headers = [];
  const harness = { ...adapter.harness, doStart(options) {
    headers.push(options.headers);
    return adapter.harness.doStart(options);
  } };
  const defaults = Object.freeze({ "X-Course": "default", "X-App": "dojo" });
  const { model } = createHarnessModel({ harness, sandbox: fixtureSandbox(), headers: defaults });
  const prompt = [{ role: "user", content: [{ type: "text", text: "Hi" }] }];
  const result = await model.doGenerate({ prompt, headers: { "x-course": "lesson", "User-Agent": "ai-sdk/test" } });
  assert.deepEqual(headers[0], { "x-course": "lesson", "x-app": "dojo" });
  assert.ok(!result.warnings.some(warning => warning.feature === "headers"));
  await Array.fromAsync((await model.doStream({ prompt })).stream);
  assert.deepEqual(headers[1], { "x-course": "default", "x-app": "dojo" });
  assert.deepEqual(defaults, { "X-Course": "default", "X-App": "dojo" });
});

test("managed per-call headers are rejected by HarnessAgent before starting a session", async () => {
  const adapter = fixture();
  const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox() });
  for (const name of ["Authorization", "X-API-Key", "X-Client-App"]) {
    await assert.rejects(model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      headers: { [name]: "fixture-only" },
    }), /must not include the managed header/);
  }
  assert.equal(adapter.starts.length, 0);
});

test("official prepareCall dynamically selects model, instructions and skills between turns", async () => {
  const adapter = fixture();
  let selected = "model-one";
  let calls = 0;
  const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox(),
    prepareCall: input => { calls++; return { ...input, model: selected, instructions: `Teach using ${selected}`, skills: [{ name: "teaching", description: "Teach", content: selected }] }; },
  });
  const first = await generateText({ model, prompt: "Start." });
  selected = "model-two";
  await generateText({ model, messages: [...first.response.messages, { role: "user", content: "Continue." }] });
  assert.equal(calls, 2);
  assert.deepEqual(adapter.prompts.map(turn => turn.model), ["model-one", "model-two"]);
  assert.deepEqual(adapter.prompts.map(turn => turn.instructions), ["Teach using model-one", "Teach using model-two"]);
  assert.equal(adapter.prompts[1].skills[0].content, "model-two");
  assert.equal(new Set(adapter.starts).size, 1);
});

for (const approved of [true, false]) test(`native tool approval resumes through a fresh provider (approved=${approved})`, async () => {
  const adapter = fixture();
  const originalStart = adapter.harness.doStart;
  const approvals = [];
  const call = { type: "tool-call", toolCallId: "native-approval", toolName: "shell", input: '{"command":"write file"}', providerExecuted: true, dynamic: true };
  adapter.harness.doStart = async start => {
    const session = await originalStart(start);
    const begin = options => {
      const done = Promise.withResolvers();
      options.emit(call);
      options.emit({ type: "tool-approval-request", approvalId: "permission-1", toolCallId: call.toolCallId });
      return { done: start.continueFrom ? done.promise : Promise.resolve(), async submitToolResult() {}, async submitToolApproval(answer) {
        approvals.push(answer);
        options.emit({ type: "tool-result", toolCallId: call.toolCallId, toolName: "shell", result: answer.approved ? "Written" : "Denied", dynamic: true });
        for (const event of text(answer.approved ? "Approved and finished." : "Denied safely.")) options.emit(event);
        done.resolve();
      } };
    };
    return { ...session, doPromptTurn: begin, doContinueTurn: begin,
      async doSuspendTurn() { const handle = await session.doSuspendTurn(); return { ...handle, data: { ...handle.data, approvalFixture: true } }; },
    };
  };
  const runtime = { harness: adapter.harness, sandbox: fixtureSandbox(), permissionMode: "allow-reads" };
  const first = await generateText({ model: createHarnessModel(runtime).model, prompt: "Write a file." });
  const request = first.response.messages.flatMap(message => message.content).find(part => part.type === "tool-approval-request");
  assert.equal(request.approvalId, "permission-1");
  assert.equal(approvals.length, 0);
  const history = JSON.parse(JSON.stringify(first.response.messages));
  const next = await generateText({ model: createHarnessModel(runtime).model, messages: [ ...history,
    { role: "tool", content: [{ type: "tool-approval-response", approvalId: request.approvalId, approved, reason: "Student decision", providerExecuted: true }] },
  ] });
  assert.equal(next.text, approved ? "Approved and finished." : "Denied safely.");
  assert.equal(approvals.length, 1);
  assert.equal(approvals[0].approved, approved);
  assert.equal(approvals[0].reason, "Student decision");
  const restarted = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL("recovery-worker.mjs", import.meta.url))], {
    input: JSON.stringify([[...history, { role: "tool", content: [{ type: "tool-approval-response", approvalId: request.approvalId, approved, reason: "Student decision", providerExecuted: true }] }]]), encoding: "utf8",
  }));
  assert.deepEqual(restarted.texts, [approved ? "Approved and finished." : "Denied safely."]);
  assert.equal(restarted.toolApprovals.length, 1);
  assert.equal(restarted.toolApprovals[0].approved, approved);
  assert.equal(restarted.starts[0], adapter.starts[0]);
  assert.equal(new Set(adapter.starts).size, 1);
  assert.equal(adapter.active, 0);
});

test("a background notification first settles the parked tool then reaches the same native session", async () => {
  const native = fixture();
  const runtime = { harness: native.harness, sandbox: fixtureSandbox() };
  const tools = { echo: tool({ inputSchema: jsonSchema({ type: "object" }) }) };
  const first = await generateText({ model: createHarnessModel(runtime).model, prompt: "Use the tool.", tools });
  const next = await generateText({ model: createHarnessModel(runtime).model, tools, messages: [
    ...JSON.parse(JSON.stringify(first.response.messages)),
    { role: "tool", content: [{ type: "tool-result", toolCallId: "echo-1", toolName: "echo", output: { type: "text", value: "receipt" } }] },
    { role: "user", content: "Child completed." },
  ] });
  assert.equal(native.results.length, 1);
  assert.deepEqual(native.prompts.map(turn => turn.prompt), ["Use the tool.", "Child completed."]);
  assert.equal(new Set(native.starts).size, 1);
  assert.match(next.text, /Tool received: receipt/);
  assert.match(next.text, /A streamed response/);
  assert.equal(next.totalUsage.inputTokens, 2);
  assert.equal(native.active, 0);
});

test("queued input survives another tool suspension and provider reconstruction", async () => {
  const native = fixture();
  const originalStart = native.harness.doStart;
  const receipts = [];
  native.harness.doStart = async start => {
    const session = await originalStart(start);
    let stage = (start.continueFrom ?? start.resumeFrom)?.data.stage ?? 0;
    return { ...session,
      async doContinueTurn(turn) {
        const done = Promise.withResolvers();
        const toolCallId = stage === 0 ? "echo-1" : "echo-2";
        turn.emit({ type: "tool-call", toolCallId, toolName: "echo", input: "{}" });
        return { done: done.promise, async submitToolResult(result) {
          receipts.push(result.toolCallId);
          turn.emit({ type: "tool-result", toolCallId, toolName: "echo", result: result.output });
          turn.emit({ type: "finish-step", finishReason: { unified: "tool-calls" }, usage });
          if (stage++ === 0) turn.emit({ type: "tool-call", toolCallId: "echo-2", toolName: "echo", input: "{}" });
          else for (const event of text("Both receipts received.")) turn.emit(event);
          done.resolve();
        } };
      },
      async doSuspendTurn() { const handle = await session.doSuspendTurn(); return { ...handle, data: { ...handle.data, stage } }; },
    };
  };
  const runtime = { harness: native.harness, sandbox: fixtureSandbox() };
  const tools = { echo: tool({ inputSchema: jsonSchema({ type: "object" }) }) };
  const toolMessage = id => ({ role: "tool", content: [{ type: "tool-result", toolCallId: id, toolName: "echo", output: { type: "text", value: "receipt" } }] });
  const first = await generateText({ model: createHarnessModel(runtime).model, tools, prompt: "Use the tool." });
  const paused = await generateText({ model: createHarnessModel(runtime).model, tools, messages: [
    ...first.response.messages, toolMessage("echo-1"),
    { role: "user", content: "Child completed." },
    { role: "user", content: "Agent status updated." },
    { role: "user", content: [{ type: "file", data: new Uint8Array([0, 1, 255]), mediaType: "application/octet-stream", filename: "lesson.bin" }] },
  ] });
  assert.equal(paused.finishReason, "tool-calls");
  assert.equal(native.prompts.length, 1, "Do not inject new prompts into an unfinished turn");
  const resumed = await generateText({ model: createHarnessModel(runtime).model, tools, messages: [
    ...JSON.parse(JSON.stringify(paused.response.messages)), toolMessage("echo-2"),
  ] });
  assert.deepEqual(receipts, ["echo-1", "echo-2"]);
  assert.deepEqual(native.prompts.slice(0, 3).map(turn => turn.prompt), ["Use the tool.", "Child completed.", "Agent status updated."]);
  const attachment = native.prompts[3].prompt.content[0];
  assert.equal(attachment.filename, "lesson.bin");
  assert.deepEqual(attachment.data, { type: "data", data: "AAH/" });
  assert.equal(new Set(native.starts).size, 1);
  assert.equal(resumed.totalUsage.inputTokens, 4);
  assert.equal(native.active, 0);
});

test("prepareCall is not re-run during a suspended tool continuation", async () => {
  const native = fixture();
  let selected = "model-one";
  let preparations = 0;
  const runtime = { harness: native.harness, sandbox: fixtureSandbox(), prepareCall: input => {
    preparations++; return { ...input, model: selected, instructions: selected };
  } };
  const tools = { echo: tool({ inputSchema: jsonSchema({ type: "object", properties: { value: { type: "string" } } }) }) };
  const first = await generateText({ model: createHarnessModel(runtime).model, tools, prompt: "Use the tool." });
  selected = "model-two";
  const answer = { role: "tool", content: [{ type: "tool-result", toolCallId: "echo-1", toolName: "echo", output: { type: "text", value: "Review" } }] };
  const resumed = await generateText({ model: createHarnessModel(runtime).model, tools, messages: [
    ...JSON.parse(JSON.stringify(first.response.messages)),
    answer,
  ] });
  assert.equal(resumed.text, "Tool received: Review.");
  assert.equal(preparations, 1);
  assert.equal(native.continuations[0].model, "model-one");
  assert.equal(native.continuations[0].instructions, "model-one");
  await generateText({ model: createHarnessModel(runtime).model, messages: [
    ...first.response.messages, answer, ...resumed.response.messages,
    { role: "user", content: "Continue teaching." },
  ] });
  assert.equal(preparations, 2);
  assert.equal(native.prompts.at(-1).model, "model-two");
  assert.equal(native.prompts.at(-1).instructions, "model-two");
  assert.equal(new Set(native.starts).size, 1, "A model change must not fork the lesson session");
  assert.equal(native.active, 0);
});

test("queued learner input picks up selection changes immediately after a suspended turn settles", async () => {
  const native = fixture();
  let selected = "model-one";
  const preparations = [];
  const { model } = createHarnessModel({
    harness: native.harness, sandbox: fixtureSandbox(),
    prepareCall: async input => {
      preparations.push(selected);
      return { ...input, model: selected };
    },
  });
  const tools = { echo: tool({ inputSchema: jsonSchema({ type: "object", properties: { value: { type: "string" } } }) }) };
  const paused = await generateText({ model, tools, prompt: "Use the tool." });
  selected = "model-two";
  await generateText({ model, tools, messages: [
    ...JSON.parse(JSON.stringify(paused.response.messages)),
    { role: "tool", content: [{ type: "tool-result", toolCallId: "echo-1", toolName: "echo", output: { type: "text", value: "Review" } }] },
    { role: "user", content: "Continue teaching with my new selection." },
  ] });
  assert.deepEqual(preparations, ["model-one", "model-two"]);
  assert.equal(native.continuations[0].model, "model-one");
  assert.equal(native.prompts.at(-1).model, "model-two");
  assert.equal(native.prompts.at(-1).prompt, "Continue teaching with my new selection.");
  assert.equal(new Set(native.starts).size, 1);
  assert.equal(native.active, 0);
});

test("injected model selections remain isolated across concurrent sessions", async () => {
  const native = fixture();
  const selections = { first: "model-a", second: "model-b" };
  const modelFor = key => createHarnessModel({
    harness: native.harness,
    sandbox: fixtureSandbox(),
    prepareCall: async input => ({ ...input, model: selections[key] }),
  }).model;
  const firstModel = modelFor("first");
  const secondModel = modelFor("second");
  const [first, second] = await Promise.all([
    generateText({ model: firstModel, prompt: "First lesson." }),
    generateText({ model: secondModel, prompt: "Second lesson." }),
  ]);
  selections.first = "model-c";
  await Promise.all([
    generateText({ model: firstModel, messages: [
      ...first.response.messages, { role: "user", content: "Continue first lesson." },
    ] }),
    generateText({ model: secondModel, messages: [
      ...second.response.messages, { role: "user", content: "Continue second lesson." },
    ] }),
  ]);
  assert.deepEqual(Object.fromEntries(native.prompts.map(turn => [turn.prompt, turn.model])), {
    "First lesson.": "model-a",
    "Second lesson.": "model-b",
    "Continue first lesson.": "model-c",
    "Continue second lesson.": "model-b",
  });
  assert.equal(new Set(native.starts).size, 2, "Selection changes must not create replacement sessions");
  assert.equal(native.active, 0);
});

test("async prepareCall reads the injected selection and propagates resolver errors without fallback", async () => {
  const native = fixture();
  let selection = "selected-model";
  const readSelection = async () => {
    if (!selection) throw new Error("Selected model is unavailable");
    return selection;
  };
  const { model } = createHarnessModel({ harness: native.harness, sandbox: fixtureSandbox(),
    prepareCall: async input => ({ ...input, model: await readSelection() }),
  });
  const first = await generateText({ model, prompt: "Hello." });
  assert.equal(native.prompts[0].model, "selected-model");
  selection = "";
  await assert.rejects(generateText({ model, maxRetries: 0, messages: [
    ...first.response.messages, { role: "user", content: "Continue." },
  ] }), /Selected model is unavailable/);
  assert.equal(native.prompts.length, 1, "Do not send a turn with stale or default settings");
  assert.equal(native.active, 0);
});

function fixture(echoHistory = false, question = false, response) {
  const toolName = question ? "ask_question" : "echo";
  const input = JSON.stringify(question
    ? { prompt: "How would you like to continue?", options: [{ id: "review", label: "Review" }, { id: "next", label: "Move on" }] }
    : { value: "receipt" });
  const prompts = [];
  const results = [];
  const starts = [];
  const continuations = [];
  const compactions = [];
  const waiting = Promise.withResolvers();
  let aborted = false;
  let active = 0;
  const harness = {
    specificationVersion: "harness-v1", harnessId: "provider-fixture", builtinTools: {},
    async doStart(start) {
      starts.push(start.sessionId);
      active++;
      const history = structuredClone((start.continueFrom ?? start.resumeFrom)?.data.history ?? []);
      const snapshot = type => ({ type, harnessId: "provider-fixture", specificationVersion: "harness-v1", data: { history } });
      const play = (options, events) => {
        for (const event of events) options.emit(event);
        return {
          done: Promise.resolve(),
          async submitToolResult(result) { results.push(result); },
        };
      };
      return {
        sessionId: start.sessionId, isResume: Boolean(start.continueFrom || start.resumeFrom),
        async doCompact() {
          compactions.push(start.sessionId);
          history.splice(0, history.length, "Native summary of the earlier lesson.");
        },
        async doPromptTurn(options) {
          prompts.push(options);
          history.push(options.prompt);
          if (Array.isArray(response)) return play(options, response);
          if (options.prompt === "Run native tool." || options.prompt === "Fail native tool.") {
            const failed = options.prompt === "Fail native tool.";
            return play(options, [
              { type: "tool-call", toolCallId: "native-1", toolName: "shell", input: '{"command":"pwd"}', providerExecuted: true, dynamic: true },
              { type: "tool-result", toolCallId: "native-1", toolName: "shell", result: failed ? "Permission denied" : { stdout: "/course" }, isError: failed, dynamic: true },
              { type: "finish-step", finishReason: { unified: "tool-calls" }, usage },
              ...text("Native command finished."),
            ]);
          }
          if (options.prompt === "Wait.") {
            const done = new Promise((resolve, reject) => options.abortSignal.addEventListener("abort", () => {
              aborted = true;
              reject(options.abortSignal.reason);
            }, { once: true }));
            waiting.resolve();
            return { done, async submitToolResult() {} };
          }
          return play(options, options.prompt === "Use the tool."
            ? [{ type: "tool-call", toolCallId: "echo-1", toolName, input }]
            : text(response ?? (echoHistory ? JSON.stringify(history) : "A streamed response.")));
        },
        async doContinueTurn(options) {
          continuations.push(options);
          const done = Promise.withResolvers();
          options.emit({ type: "tool-call", toolCallId: "echo-1", toolName, input });
          return {
            done: done.promise,
            async submitToolResult(result) {
              results.push(result);
              options.emit({ type: "tool-result", toolCallId: result.toolCallId, toolName, result: result.output, isError: result.isError });
              options.emit({ type: "finish-step", finishReason: { unified: "tool-calls" }, usage });
              for (const event of text(response ?? (result.isError ? "Tool failed safely." : `Tool received: ${result.output}.`))) options.emit(event);
              done.resolve();
            },
          };
        },
        async doStop() { active--; return snapshot("resume-session"); },
        async doSuspendTurn() { active--; return snapshot("continue-turn"); },
        async doDestroy() { active--; },
      };
    },
  };
  return { harness, prompts, results, starts, continuations, compactions, waiting: waiting.promise, get aborted() { return aborted; }, get active() { return active; } };
}

// This adapter fixture stores native state in its opaque handle and never uses
// files. Fresh just-bash environments suffice here; this does NOT certify real
// just-bash resume or a bridge-backed adapter's filesystem recovery.
function fixtureSandbox() {
  const sandbox = createJustBashSandbox();
  return { ...sandbox, resumeSession: options => sandbox.createSession(options) };
}

test("provider streams chunks through the official AI SDK", async () => {
  const native = fixture();
  const provider = createHarnessModel({ harness: native.harness, sandbox: fixtureSandbox() });
  try {
    const chunks = [];
    const result = streamText({ model: provider.model, prompt: "Hello." });
    for await (const chunk of result.textStream) chunks.push(chunk);
    assert.deepEqual(chunks, ["A", " streamed", " response."]);
    assert.equal(await result.text, "A streamed response.");
    assert.equal((await result.totalUsage).inputTokens, 1);
  } finally { assert.equal(native.active, 0); }
});

for (const failure of [false, true]) test(`unmodified Eve settles the tool once and continues two user turns (failure=${failure})`, async () => {
  const native = fixture();
  const provider = createHarnessModel({ harness: native.harness, sandbox: fixtureSandbox() });
  let executed = 0;
  const schema = { type: "object", properties: { value: { type: "string" } }, required: ["value"] };
  const tools = new Map([["echo", {
    name: "echo", description: "Echo the input", inputSchema: jsonSchema(schema),
    execute: async ({ value }) => { executed++; if (failure) throw new Error("Fixture tool failure"); return value; },
  }]]);
  let session = {
    agent: { modelReference: { id: "local" }, system: "Use echo.", tools: [{ name: "echo", description: "Echo", inputSchema: schema }] },
    compaction: { recentWindowSize: 10, threshold: 100000 },
    continuationToken: "provider-test", sessionId: randomUUID(), history: [],
  };
  const run = async message => {
    let step = createToolLoopHarness({ mode: "conversation", resolveModel: async () => provider.model, tools });
    let output;
    for (let index = 0; step && index < 5; index++) {
      const result = await step(session, index === 0 ? { message } : undefined);
      session = result.session;
      if (result.settledTurn) output = result.settledTurn.output;
      step = typeof result.next === "function" ? result.next : null;
    }
    assert.equal(step, null);
    return output;
  };
  try {
    assert.equal(await run("Use the tool."), failure ? "Tool failed safely." : "Tool received: receipt.");
    assert.equal(executed, 1);
    assert.equal(native.results.length, 1);
    assert.equal(Boolean(native.results[0].isError), failure);
    if (failure) assert.match(JSON.stringify(native.results[0].output), /Fixture tool failure/);
    else assert.equal(native.results[0].output, "receipt");
    assert.equal(await run("What next?"), "A streamed response.");
    assert.equal(native.starts.length, 3);
    assert.equal(new Set(native.starts).size, 1);
    assert.deepEqual(native.prompts.map(options => options.prompt), ["Use the tool.", "What next?"]);
  } finally { assert.equal(native.active, 0); }
});

test("Eve parks its real ask_question tool and resumes from serialized session state", async () => {
  const native = fixture(false, true);
  const sandbox = fixtureSandbox();
  const events = [];
  const schema = { type: "object" };
  const toolDefinition = { name: "ask_question", description: "Ask the student", inputSchema: schema };
  const config = {
    mode: "conversation", capabilities: { requestInput: true },
    handleEvent: async event => { events.push(event); },
    tools: new Map([["ask_question", {
      ...toolDefinition, inputSchema: jsonSchema(schema),
      behavior: { availability: ["requires-request-input"], handling: { kind: "request-input", request: "question" } },
    }]]),
  };
  const freshStep = () => createToolLoopHarness({ ...config, resolveModel: async () =>
    createHarnessModel({ harness: native.harness, sandbox }).model });
  const session = {
    agent: { modelReference: { id: "local" }, system: "Teach", tools: [toolDefinition] },
    compaction: { recentWindowSize: 10, threshold: 100000 },
    continuationToken: "question-test", sessionId: randomUUID(), history: [],
  };
  const parked = await freshStep()(session, { message: "Use the tool." });
  assert.equal(parked.next, null);
  assert.equal(parked.settledTurn, undefined);
  const request = events.find(event => event.type === "input.requested")?.data.requests[0];
  assert.equal(request.kind, "question");
  assert.equal(request.prompt, "How would you like to continue?");
  assert.deepEqual(request.options, [{ id: "review", label: "Review" }, { id: "next", label: "Move on" }]);
  assert.equal(native.results.length, 0);
  assert.equal(native.active, 0);
  const resumed = await freshStep()(JSON.parse(JSON.stringify(parked.session)), {
    inputResponses: [{ requestId: request.requestId, optionId: "review" }],
  });
  assert.equal(resumed.next, null);
  assert.ok(resumed.settledTurn);
  assert.equal(native.results.length, 1);
  assert.deepEqual(native.results[0].output, { optionId: "review", text: undefined, status: "answered" });
  assert.equal(new Set(native.starts).size, 1);
  assert.equal(native.active, 0);
  assert.ok(events.some(event => event.type === "input.resolved"));
});

for (const failure of [false, true]) test(`native tool calls retain execution ownership, results and stream order (failure=${failure})`, async () => {
  const native = fixture();
  const { model } = createHarnessModel({ harness: native.harness, sandbox: fixtureSandbox() });
  const result = streamText({ model, prompt: failure ? "Fail native tool." : "Run native tool." });
  const parts = [];
  for await (const part of result.fullStream) parts.push(part);
  const call = parts.find(part => part.type === "tool-call");
  assert.equal(call.providerExecuted, true);
  assert.equal(call.dynamic, true);
  const output = parts.find(part => part.type === (failure ? "tool-error" : "tool-result"));
  if (failure) assert.equal(output.error, "Permission denied");
  else assert.deepEqual(output.output, { stdout: "/course" });
  assert.ok(parts.indexOf(call) < parts.indexOf(output));
  assert.ok(parts.indexOf(output) < parts.findIndex(part => part.type === "text-start"));
  assert.equal(await result.text, "Native command finished.");
  assert.equal(native.results.length, 0);
  assert.equal(native.active, 0);
});

for (const decision of ["approve", "deny"]) test(`Eve authorizes its host tool after serialized suspension (${decision})`, async () => {
  const native = fixture();
  const events = [];
  let executions = 0;
  const definition = { name: "echo", description: "Write the lesson", inputSchema: { type: "object", properties: { value: { type: "string" } }, required: ["value"] } };
  const config = { mode: "conversation", capabilities: { requestInput: true },
    handleEvent: async event => { events.push(event); },
    resolveModel: async () => createHarnessModel({ harness: native.harness, sandbox: fixtureSandbox() }).model,
    tools: new Map([["echo", { ...definition, inputSchema: jsonSchema(definition.inputSchema), approval: () => "user-approval", execute: async ({ value }) => { executions++; return value; } }]]),
  };
  const session = { agent: { modelReference: { id: "local" }, system: "Teach", tools: [definition] }, compaction: { recentWindowSize: 10, threshold: 100000 }, continuationToken: "approval-test", sessionId: randomUUID(), history: [] };
  const context = new ContextContainer();
  context.set(SessionKey, { sessionId: session.sessionId, auth: { current: null, initiator: null }, turn: { id: "turn_0", sequence: 0 } });
  const run = (state, input) => contextStorage.run(context, () => createToolLoopHarness(config)(state, input));
  let parked = await run(session, { message: "Use the tool." });
  for (let i = 0; typeof parked.next === "function" && i < 4; i++) parked = await contextStorage.run(context, () => parked.next(parked.session));
  assert.equal(executions, 0);
  const request = events.find(event => event.type === "input.requested")?.data.requests[0];
  assert.ok(request, JSON.stringify({ events, parked }));
  assert.equal(request.kind, "tool-approval");
  let result = await run(JSON.parse(JSON.stringify(parked.session)), { inputResponses: [{ requestId: request.requestId, optionId: decision }] });
  for (let i = 0; typeof result.next === "function" && i < 4; i++) result = await contextStorage.run(context, () => result.next(result.session));
  assert.ok(result.settledTurn);
  assert.equal(executions, decision === "approve" ? 1 : 0);
  assert.equal(native.results.length, 1);
  assert.equal(native.active, 0);
  assert.ok(events.some(event => event.type === "input.resolved"));
});

test("authored skill bundles reach the official adapter unchanged", async () => {
  const native = fixture();
  const skills = [{ name: "author-course", description: "Guide course authoring",
    content: "Ask the author about their intended audience.",
    files: [{ path: "references/katas.md", content: "Practice one concept." }],
  }];
  const { model } = createHarnessModel({ harness: native.harness, sandbox: fixtureSandbox(), skills });
  await generateText({ model, system: "Course authoring instructions", prompt: "Hello" });
  assert.deepEqual(native.prompts[0].skills, skills);
  assert.equal(native.prompts[0].instructions, "Course authoring instructions");
  assert.equal(native.active, 0);
});

for (const phase of ["start", "stream", "cleanup"]) test(`harness cleanup preserves failures without duplication (${phase})`, async () => {
  const failure = new Error("Harness failed");
  const cleanup = new Error("Cleanup failed");
  const harness = { specificationVersion: "harness-v1", harnessId: "failing-fixture", builtinTools: {},
    async doStart(options) {
      return { sessionId: options.sessionId, isResume: false,
        async doPromptTurn(turn) {
          if (phase === "start") throw failure;
          for (const event of phase === "stream" ? [{ type: "error", error: failure }] : text("Completed")) turn.emit(event);
          return { done: Promise.resolve(), async submitToolResult() {} };
        },
        async doStop() { throw cleanup; },
        async doDestroy() {},
      };
    },
  };
  const { model } = createHarnessModel({ harness, sandbox: createJustBashSandbox() });
  await assert.rejects(async () => {
    const { stream } = await model.doStream({ prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }] });
    for await (const _ of stream) { /* Drain errors surfaced by the SDK stream. */ }
  }, error => {
    if (phase === "cleanup") {
      assert.equal(error, cleanup);
      return true;
    }
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [failure, cleanup]);
    return true;
  });
});

test("cancelling the provider stream aborts the active harness turn", async () => {
  const native = fixture();
  const provider = createHarnessModel({ harness: native.harness, sandbox: fixtureSandbox() });
  try {
    const { stream } = await provider.model.doStream({ prompt: [{ role: "user", content: [{ type: "text", text: "Wait." }] }] });
    await native.waiting;
    await stream.cancel(new Error("Reader stopped"));
    assert.equal(native.aborted, true);
  } finally { assert.equal(native.active, 0); }
});

test("one shared provider isolates concurrent conversations and recovers both in a new process", async () => {
  const native = fixture(true);
  const { model } = createHarnessModel({ harness: native.harness, sandbox: fixtureSandbox() });
  const names = ["Alice", "Bob"];
  const first = await Promise.all(names.map(prompt => generateText({ model, prompt })));
  assert.deepEqual(first.map(result => JSON.parse(result.text)), [["Alice"], ["Bob"]]);
  assert.equal(new Set(native.starts).size, 2);
  assert.equal(native.active, 0);
  const conversations = first.map((result, index) => [
    { role: "user", content: names[index] },
    ...result.response.messages,
    { role: "user", content: "Continue" },
  ]);
  const restarted = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL("recovery-worker.mjs", import.meta.url))], {
    input: JSON.stringify(conversations), encoding: "utf8", timeout: 15000,
  }));
  assert.deepEqual(restarted.texts.map(value => JSON.parse(value)), [["Alice", "Continue"], ["Bob", "Continue"]]);
  assert.deepEqual(new Set(restarted.starts), new Set(native.starts));
});

test("a pending external question resumes in a new process with the student's actual answer", async () => {
  const native = fixture();
  const { model } = createHarnessModel({ harness: native.harness, sandbox: fixtureSandbox() });
  const first = await generateText({ model, prompt: "Use the tool.", tools: {
    echo: tool({ inputSchema: jsonSchema({ type: "object", properties: { value: { type: "string" } }, required: ["value"] }) }),
  } });
  assert.equal(first.toolCalls.length, 1);
  assert.equal(native.results.length, 0);
  assert.equal(native.active, 0);
  const messages = [
    { role: "user", content: "Use the tool." }, ...first.response.messages,
    { role: "tool", content: [{ type: "tool-result", toolCallId: first.toolCalls[0].toolCallId, toolName: "echo", output: { type: "text", value: "Review" } }] },
  ];
  const restarted = JSON.parse(execFileSync(process.execPath, [fileURLToPath(new URL("recovery-worker.mjs", import.meta.url))], {
    input: JSON.stringify([messages]), encoding: "utf8", timeout: 15000,
  }));
  assert.deepEqual(restarted.starts, native.starts);
  assert.deepEqual(restarted.texts, ["Student chose: Review"]);
  assert.equal(restarted.toolResults.length, 1);
  assert.equal(restarted.toolResults[0].output, "Review");
});

test("settings change on the next user turn, not during a suspended tool continuation", async () => {
  const native = fixture();
  const sandbox = fixtureSandbox();
  const initial = createHarnessModel({ harness: native.harness, sandbox, model: "initial-model" }).model;
  const changed = createHarnessModel({ harness: native.harness, sandbox, model: "changed-model" }).model;
  const tools = { echo: tool({ inputSchema: jsonSchema({ type: "object", properties: { value: { type: "string" } }, required: ["value"] }) }) };
  const first = await generateText({ model: initial, system: "Initial teaching rules", prompt: "Use the tool.", tools });
  const messages = [
    { role: "user", content: "Use the tool." }, ...first.response.messages,
    { role: "tool", content: [{ type: "tool-result", toolCallId: first.toolCalls[0].toolCallId, toolName: "echo", output: { type: "text", value: "Review" } }] },
  ];
  const continued = await generateText({ model: changed, system: "Changed teaching rules", messages, tools });
  assert.equal(native.continuations.length, 1);
  assert.equal(native.continuations[0].model, "initial-model");
  assert.equal(native.continuations[0].instructions, "Initial teaching rules");
  await generateText({ model: changed, system: "Changed teaching rules", messages: [
    ...messages, ...continued.response.messages, { role: "user", content: "What next?" },
  ], tools });
  assert.equal(native.prompts[1].model, "changed-model");
  assert.equal(native.prompts[1].instructions, "Changed teaching rules");
  assert.equal(new Set(native.starts).size, 1);
  assert.equal(native.active, 0);
});

test("caller-owned official sandbox survives turns and remains the caller's cleanup responsibility", async () => {
  const native = fixture(true);
  const sandbox = createJustBashSandbox();
  const sandboxSession = await sandbox.createSession();
  let stopped = 0;
  const stop = sandboxSession.stop.bind(sandboxSession);
  sandboxSession.stop = async () => { stopped++; await stop(); };
  const filesystem = sandboxSession.restricted();
  await filesystem.writeTextFile({ path: "/retained.txt", content: "Learner edits" });
  try {
    const { model } = createHarnessModel({ harness: native.harness }, { sandboxSession });
    const first = await generateText({ model, prompt: "Hello" });
    const second = await generateText({ model, messages: [
      { role: "user", content: "Hello" }, ...first.response.messages,
      { role: "user", content: "Continue" },
    ] });
    assert.deepEqual(JSON.parse(second.text), ["Hello", "Continue"]);
    assert.equal(new Set(native.starts).size, 1);
    assert.equal(await filesystem.readTextFile({ path: "/retained.txt" }), "Learner edits");
    assert.equal(stopped, 0);
    assert.equal(native.active, 0);
  } finally {
    await sandboxSession.stop();
  }
  assert.equal(stopped, 1);
});

test("a non-resumable sandbox is rejected instead of silently replacing the native session", async () => {
  const native = fixture();
  const { model } = createHarnessModel({ harness: native.harness, sandbox: createJustBashSandbox() });
  const first = await generateText({ model, prompt: "Hello" });
  await assert.rejects(generateText({ model, messages: [
    { role: "user", content: "Hello" }, ...first.response.messages,
    { role: "user", content: "Continue" },
  ] }), /does not support resume/);
  assert.equal(native.starts.length, 1);
  assert.equal(native.active, 0);
});

if (process.env.EVE_NATIVE_COMPACTION === "1") {
  test("Eve's compact-only action persists the native checkpoint for the next turn", async () => {
    const adapter = fixture(true);
    const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox() });
    const config = { mode: "conversation", resolveModel: async () => model, tools: new Map() };
    const initial = {
      agent: { modelReference: { id: "local" }, system: "Teach carefully.", tools: [] },
      compaction: { threshold: 100000, recentWindowSize: 10 },
      continuationToken: "compact-test", sessionId: randomUUID(), history: [],
    };
    const first = await createToolLoopHarness(config)(initial, { message: "Learn trimming." });
    const compacted = await createToolLoopHarness({ ...config, compactOnly: true })(first.session);
    assert.equal(adapter.compactions.length, 1);
    assert.equal(adapter.prompts.length, 1);
    const next = await createToolLoopHarness(config)(JSON.parse(JSON.stringify(compacted.session)), { message: "Continue learning." });
    assert.deepEqual(JSON.parse(next.settledTurn.output), ["Native summary of the earlier lesson.", "Continue learning."]);
    assert.equal(new Set(adapter.starts).size, 1);
    assert.equal(adapter.active, 0);
  });

  test("Eve delegates compaction, preserves the checkpoint and sends only the new user message", async () => {
    const adapter = fixture(true);
    const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox() });
    const first = await generateText({ model, prompt: "Learn trimming." });
    const next = { role: "user", content: "Now teach whitespace." };
    const history = [{ role: "user", content: "Learn trimming." }, ...first.response.messages, next];
    const before = structuredClone(history);
    const compacted = await compactMessages(history, model, { threshold: 1000, recentWindowSize: 1 });
    assert.deepEqual(history, before, "Do not mutate persisted input on success or failure");
    assert.equal(adapter.compactions.length, 1);
    assert.equal(adapter.prompts.length, 1, "No summarization prompt sent through Eve");
    assert.equal(compacted.length, 2);
    assert.equal(compacted[1], next);
    const resumed = await generateText({ model, messages: compacted });
    assert.deepEqual(JSON.parse(resumed.text), ["Native summary of the earlier lesson.", "Now teach whitespace."]);
    assert.equal(new Set(adapter.starts).size, 1);
    assert.equal(adapter.active, 0);
  });

  test("native compaction rejects missing checkpoints and aborts, but defers unfinished tool turns", async () => {
    const adapter = fixture();
    const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox() });
    const config = { threshold: 1000, recentWindowSize: 1 };
    await assert.rejects(compactMessages([{ role: "user", content: "Start" }], model, config), /requires a harness checkpoint/);
    const abort = new AbortController();
    abort.abort(new Error("Cancelled by test"));
    await assert.rejects(compactMessages([], model, config, undefined, undefined, undefined, abort.signal), /Cancelled by test/);
    assert.equal(adapter.starts.length, 0);
    const first = await generateText({ model, prompt: "Use the tool.", tools: { echo: tool({ inputSchema: jsonSchema({ type: "object" }) }) } });
    const deferred = await compactMessages(first.response.messages, model, config);
    assert.equal(deferred, first.response.messages);
    assert.equal(adapter.compactions.length, 0);
    const resumed = await generateText({ model, messages: [...deferred, { role: "tool", content: [{ type: "tool-result", toolCallId: "echo-1", toolName: "echo", output: { type: "text", value: "receipt" } }] }], tools: { echo: tool({ inputSchema: jsonSchema({ type: "object" }) }) } });
    assert.equal(resumed.text, "Tool received: receipt.");
    assert.equal(adapter.results.length, 1);
    await compactMessages([...deferred, ...resumed.response.messages], model, config);
    assert.equal(adapter.compactions.length, 1);
    assert.equal(new Set(adapter.starts).size, 1);
  });

  test("compaction failures propagate without falling back to Eve summarization", async () => {
    const error = new Error("Native compaction unavailable");
    const model = new MockLanguageModelV4();
    model.experimental_compact = async () => { throw error; };
    await assert.rejects(compactMessages([{ role: "user", content: "Keep this" }], model, { threshold: 1000, recentWindowSize: 1 }), value => value === error);
    assert.equal(model.doGenerateCalls.length, 0);
  });

  for (const cleanupFails of [false, true]) test(`native compaction releases its session on failure (cleanupFails=${cleanupFails})`, async () => {
    const adapter = fixture();
    const { model } = createHarnessModel({ harness: adapter.harness, sandbox: fixtureSandbox() });
    const first = await generateText({ model, prompt: "Start lesson." });
    const history = structuredClone(first.response.messages);
    const originalStart = adapter.harness.doStart;
    const failure = new Error("Native compaction unavailable");
    const cleanupFailure = new Error("Could not save native checkpoint");
    adapter.harness.doStart = async options => {
      const session = await originalStart(options);
      const originalStop = session.doStop;
      return { ...session,
        async doCompact() { throw failure; },
        async doStop() {
          const checkpoint = await originalStop();
          if (cleanupFails) throw cleanupFailure;
          return checkpoint;
        },
      };
    };
    await assert.rejects(compactMessages(history, model, { threshold: 1000, recentWindowSize: 1 }), error => {
      if (cleanupFails) assert.deepEqual(error.errors, [failure, cleanupFailure]);
      else assert.equal(error, failure);
      return true;
    });
    assert.deepEqual(history, first.response.messages);
    assert.equal(adapter.active, 0);
    assert.equal(adapter.prompts.length, 1);
  });

  test("Eve rejects an empty native-compaction result", async () => {
    const model = new MockLanguageModelV4();
    model.experimental_compact = async () => [];
    await assert.rejects(compactMessages([], model, { threshold: 1000, recentWindowSize: 1 }), /non-empty messages/);
    assert.equal(model.doGenerateCalls.length, 0);
  });
}

for (const dropTail of [false, true]) test(`Eve compaction drops summary metadata; native checkpoint depends on retained tail (dropTail=${dropTail})`, async () => {
  const checkpoint = { harness: { sessionId: "native-before-compaction", resumeFrom: { opaque: "fixture" } } };
  const summaryCheckpoint = { harness: { sessionId: "native-summary", resumeFrom: { opaque: "summary-fixture" } } };
  const model = new MockLanguageModelV4({ doGenerate: {
    content: [{ type: "text", text: "The learner understands trimming.", providerMetadata: summaryCheckpoint }],
    finishReason: finish, usage, warnings: [],
  } });
  const history = [
    { role: "user", content: "Teach trimming." },
    { role: "assistant", content: [{ type: "text", text: "Trimming removes outer whitespace.".repeat(dropTail ? 1000 : 1), providerOptions: checkpoint }] },
  ];
  const compacted = await compactMessages(history, model, { recentWindowSize: 1, threshold: 1000 }, undefined, undefined, undefined, undefined, true);
  assert.equal(model.doGenerateCalls.length, 1);
  assert.ok(JSON.stringify(compacted).includes("The learner understands trimming."));
  assert.equal(JSON.stringify(compacted).includes("native-before-compaction"), !dropTail);
  assert.ok(!JSON.stringify(compacted).includes("native-summary"));
  assert.ok(!JSON.stringify(model.doGenerateCalls[0].prompt).includes("native-before-compaction"));
});

for (const location of ["content", "response"]) test(`Eve metadata round trip: ${location}`, async () => {
  const marker = { harness: { checkpoint: { sessionId: "native-marker", cursor: 7 } } };
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text: "Hello.", ...(location === "content" ? { providerMetadata: marker } : {}) }],
      finishReason: finish, usage, warnings: [],
      ...(location === "response" ? { providerMetadata: marker } : {}),
    },
  });
  let session = {
    agent: { modelReference: { id: "local" }, system: "Teach.", tools: [] },
    compaction: { recentWindowSize: 10, threshold: 100000 },
    continuationToken: "metadata-test", sessionId: randomUUID(), history: [],
  };
  for (const message of ["Hello", "Continue"]) {
    const step = createToolLoopHarness({ mode: "conversation", resolveModel: async () => model, tools: new Map() });
    const result = await step(session, { message });
    assert.equal(result.settledTurn.output, "Hello.");
    // Exercise the JSON boundary; do not retain an object-identity side channel.
    session = JSON.parse(JSON.stringify(result.session));
  }
  const assistant = model.doGenerateCalls[1].prompt.find(message => message.role === "assistant");
  const restored = assistant.content.find(part => part.type === "text").providerOptions;
  assert.deepEqual(restored, location === "content" ? marker : undefined);
});

test("streamed text-end metadata survives standard response-message serialization", async () => {
  const marker = { harness: { checkpoint: { sessionId: "stream-marker", cursor: 8 } } };
  const model = new MockLanguageModelV4({
    doStream: { stream: new ReadableStream({
      start(controller) {
        for (const event of [
          { type: "stream-start", warnings: [] },
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "Hello." },
          { type: "text-end", id: "t", providerMetadata: marker },
          { type: "finish", finishReason: finish, usage },
        ]) controller.enqueue(event);
        controller.close();
      },
    }) },
  });
  const result = streamText({ model, prompt: "Hello" });
  await result.consumeStream();
  const response = JSON.parse(JSON.stringify(await result.response));
  assert.deepEqual(response.messages[0].content[0].providerOptions, marker);
});

test("Eve returns tool-call metadata beside the externally executed tool result", async () => {
  const marker = { harness: { checkpoint: { sessionId: "tool-marker", cursor: 9 } } };
  const model = new MockLanguageModelV4({ doGenerate: [
    {
      content: [{ type: "tool-call", toolCallId: "echo-metadata", toolName: "echo", input: "{}", providerMetadata: marker }],
      finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage, warnings: [],
    },
    { content: [{ type: "text", text: "Received." }], finishReason: finish, usage, warnings: [] },
  ] });
  const schema = { type: "object", properties: {} };
  const tools = new Map([["echo", { name: "echo", description: "Echo", inputSchema: jsonSchema(schema), execute: async () => "answer" }]]);
  let session = {
    agent: { modelReference: { id: "local" }, system: "Use echo.", tools: [{ name: "echo", description: "Echo", inputSchema: schema }] },
    compaction: { recentWindowSize: 10, threshold: 100000 },
    continuationToken: "tool-metadata-test", sessionId: randomUUID(), history: [],
  };
  let step = createToolLoopHarness({ mode: "conversation", resolveModel: async () => model, tools });
  let output;
  for (let index = 0; step && index < 5; index++) {
    const result = await step(session, index === 0 ? { message: "Use echo." } : undefined);
    session = result.session;
    if (result.settledTurn) output = result.settledTurn.output;
    step = typeof result.next === "function" ? result.next : null;
  }
  assert.equal(step, null);
  assert.equal(output, "Received.");
  const prompt = JSON.parse(JSON.stringify(model.doGenerateCalls[1].prompt));
  const call = prompt.flatMap(message => Array.isArray(message.content) ? message.content : [])
    .find(part => part.type === "tool-call");
  assert.deepEqual(call.providerOptions, marker);
  assert.equal(prompt.at(-1).role, "tool");
  assert.equal(prompt.at(-1).content[0].toolCallId, "echo-metadata");
});
