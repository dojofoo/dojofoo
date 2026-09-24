import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { test } from "node:test";
import { createPi } from "@ai-sdk/harness-pi";
import { createJustBashSandbox } from "@ai-sdk/sandbox-just-bash";
import { generateText, jsonSchema, tool } from "ai";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
const eveRoot = new URL("./", import.meta.resolve("@dojofoo/agent/eve/package.json"));
const { createToolLoopHarness } = await import(new URL("dist/src/harness/tool-loop.js", eveRoot));
const { compactMessages } = await import(new URL("dist/src/harness/compaction.js", eveRoot));

for (const mode of ["conversation", "tool", "eve-question", ...(process.env.EVE_NATIVE_COMPACTION === "1" ? ["compaction"] : [])]) test(`official Pi journal recovery without paid inference (${mode})`, async () => {
  const question = mode === "tool" || mode === "eve-question";
  const requests = [];
  const blockedOrigins = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    const part = { type: "output_text", text: "Ready to teach.", annotations: [] };
    const item = { id: "msg_fixture", type: "message", role: "assistant", status: "completed", content: [part] };
    const result = { id: "resp_fixture", object: "response", created_at: 1, model: "gpt-4o", status: "completed", output: [item],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } };
    let events = [
      { type: "response.created", response: { ...result, status: "in_progress", output: [] } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
      { type: "response.content_part.added", item_id: item.id, output_index: 0, content_index: 0, part: { ...part, text: "" } },
      { type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta: part.text },
      { type: "response.output_text.done", item_id: item.id, output_index: 0, content_index: 0, text: part.text },
      { type: "response.content_part.done", item_id: item.id, output_index: 0, content_index: 0, part },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response: result },
    ];
    if (question && requests.length === 1) {
      const call = { id: "fc_question", call_id: "call_question", type: "function_call", name: "ask_question", arguments: '{"prompt":"Review or move on?"}', status: "completed" };
      events = [
        { type: "response.created", response: { ...result, status: "in_progress", output: [] } },
        { type: "response.output_item.added", output_index: 0, item: { ...call, arguments: "", status: "in_progress" } },
        { type: "response.function_call_arguments.delta", item_id: call.id, output_index: 0, delta: call.arguments },
        { type: "response.function_call_arguments.done", item_id: call.id, output_index: 0, arguments: call.arguments },
        { type: "response.output_item.done", output_index: 0, item: call },
        { type: "response.completed", response: { ...result, output: [call] } },
      ];
    }
    for (const [sequence_number, event] of events.entries()) response.write(`event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number })}\n\n`);
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.origin !== baseUrl) {
      blockedOrigins.push(url.origin);
      throw new Error("Non-loopback inference is forbidden in the Pi fixture");
    }
    return originalFetch(input, options);
  };
  const sandboxSession = await createJustBashSandbox().createSession();
  try {
    const harness = createPi({ auth: { OPENAI_API_KEY: "fixture-only", OPENAI_BASE_URL: `${baseUrl}/v1` } });
    const { model } = experimental_createHarnessModel({ harness, model: "openai/gpt-4o", permissionMode: "allow-all" }, { sandboxSession });
    if (mode === "eve-question") {
      const events = [];
      const definition = { name: "ask_question", description: "Ask the student", inputSchema: { type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] } };
      const config = { mode: "conversation", capabilities: { requestInput: true },
        resolveModel: async () => model, handleEvent: async event => { events.push(event); },
        tools: new Map([["ask_question", { ...definition, inputSchema: jsonSchema(definition.inputSchema),
          behavior: { availability: ["requires-request-input"], handling: { kind: "request-input", request: "question" } } }]]),
      };
      const session = { agent: { modelReference: { id: "pi" }, system: "Teach one concept at a time.", tools: [definition] },
        compaction: { recentWindowSize: 10, threshold: 100000 }, continuationToken: "pi-question", sessionId: "eve-pi-question", history: [] };
      const parked = await createToolLoopHarness(config)(session, { message: "Introduce the lesson." });
      assert.equal(parked.next, null);
      assert.equal(parked.settledTurn, undefined);
      assert.equal(requests.length, 1);
      const request = events.find(event => event.type === "input.requested")?.data.requests[0];
      assert.equal(request.prompt, "Review or move on?");
      const resumed = await createToolLoopHarness(config)(JSON.parse(JSON.stringify(parked.session)), {
        inputResponses: [{ requestId: request.requestId, text: "Review" }],
      });
      assert.equal(resumed.settledTurn.output, "Ready to teach.");
      assert.ok(events.some(event => event.type === "input.resolved"));
      assert.equal(requests.length, 2);
      const results = requests[1].input.filter(item => item.type === "function_call_output");
      assert.equal(results.length, 1);
      assert.match(results[0].output, /Review/);
      assert.deepEqual(blockedOrigins, []);
      return;
    }
    const tools = question ? { ask_question: tool({ inputSchema: jsonSchema({ type: "object", properties: { prompt: { type: "string" } }, required: ["prompt"] }) }) } : undefined;
    const introduction = mode === "compaction" ? "Earlier lesson evidence. ".repeat(4000) : "Introduce the lesson.";
    const first = await generateText({ model, tools, system: "Teach one concept at a time.", prompt: introduction });
    assert.equal(first.text, question ? "" : "Ready to teach.");
    if (mode === "compaction") {
      // Exceed Pi's native recent-history window without changing its settings.
      const recent = { role: "user", content: "Recent lesson evidence. ".repeat(4000) };
      const second = await generateText({ model, messages: [
        { role: "user", content: introduction }, ...first.response.messages, recent,
      ] });
      const compacted = await compactMessages([
        { role: "user", content: introduction }, ...first.response.messages,
        recent, ...second.response.messages,
        { role: "user", content: "Continue after compaction." },
      ], model, { threshold: 1000, recentWindowSize: 1 });
      assert.equal(requests.length, 3, "Pi itself requests the native summary");
      const next = await generateText({ model, system: "Teach one concept at a time.", messages: compacted });
      assert.equal(next.text, "Ready to teach.");
      assert.equal(requests.length, 4);
      const before = first.response.messages.flatMap(message => message.content).find(part => part.providerOptions?.harness).providerOptions.harness;
      const after = next.response.messages.flatMap(message => message.content).find(part => part.providerOptions?.harness).providerOptions.harness;
      assert.equal(before.sessionId, after.sessionId);
      assert.ok(JSON.stringify(requests[3]).includes("Continue after compaction."));
      assert.deepEqual(blockedOrigins, []);
      return;
    }
    if (question) {
      assert.equal(first.toolCalls.length, 1);
      assert.equal(first.toolCalls[0].toolName, "ask_question");
      assert.equal(requests.length, 1, "No additional inference before the student answers");
    }
    const second = await generateText({ model, tools, system: "Teach one concept at a time.", messages: [
      { role: "user", content: "Introduce the lesson." }, ...first.response.messages,
      question
        ? { role: "tool", content: [{ type: "tool-result", toolCallId: first.toolCalls[0].toolCallId, toolName: "ask_question", output: { type: "json", value: { status: "answered", optionId: "review" } } }] }
        : { role: "user", content: "Continue the lesson." },
    ] });
    assert.equal(second.text, "Ready to teach.");
    assert.equal(requests.length, 2);
    assert.deepEqual(blockedOrigins, []);
    const checkpoint = result => result.response.messages.flatMap(message => message.content)
      .find(part => part.providerOptions?.harness)?.providerOptions.harness;
    assert.equal(checkpoint(first).sessionId, checkpoint(second).sessionId);
    const history = JSON.stringify(requests[1]);
    const expectedHistory = question ? ["Teach one concept at a time", "Introduce the lesson", "ask_question", "review"]
      : ["Teach one concept at a time", "Introduce the lesson", "Ready to teach", "Continue the lesson"];
    for (const expected of expectedHistory) assert.ok(history.includes(expected));
    if (question) assert.equal(requests[1].input.filter(item => item.type === "function_call_output").length, 1);
  } catch (error) {
    throw new Error(`Pi fixture failed: ${requests.length} local requests; blocked origins: ${JSON.stringify(blockedOrigins)}`, { cause: error });
  } finally {
    globalThis.fetch = originalFetch;
    await sandboxSession.stop();
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
