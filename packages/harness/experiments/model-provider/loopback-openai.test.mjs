import assert from "node:assert/strict";
import { test } from "node:test";
import { startLoopbackModel } from "./loopback-openai.mjs";

test("Chat Completions fixture emits one tool call followed by text", async t => {
  const endpoint = await startLoopbackModel({ responses: false,
    toolRequest: { name: "dojo_ui_ask", input: { prompt: "Which learner?" } } });
  t.after(() => endpoint.close());
  const post = (path, input) => fetch(`${endpoint.baseURL}/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  assert.equal((await post("responses", {})).status, 404);
  const input = { model: "fixture", stream: true,
    tools: [{ type: "function", function: { name: "mcp_dojo_ui_ask" } }] };
  const first = await (await post("chat/completions", input)).text();
  assert.match(first, /"tool_calls"/);
  assert.match(first, /mcp_dojo_ui_ask/);
  assert.match(first, /data: \[DONE\]/);
  const second = await (await post("chat/completions", input)).text();
  assert.match(second, /Ready to teach\./);
  assert.doesNotMatch(second, /"tool_calls"/);
  assert.deepEqual(endpoint.requestedTools, ["mcp_dojo_ui_ask"]);
});

test("Responses remains the default fixture protocol", async t => {
  const endpoint = await startLoopbackModel();
  t.after(() => endpoint.close());
  const response = await fetch(`${endpoint.baseURL}/responses`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stream: true }),
  });
  assert.match(await response.text(), /event: response.completed/);
});

test("Responses can select a native tool without changing its input", async t => {
  const endpoint = await startLoopbackModel({ selectResponsesTool: (_input, requested) =>
    requested.length ? undefined : { name: "exec_command", input: { cmd: "fixture command" } },
  });
  t.after(() => endpoint.close());
  const post = async () => (await fetch(`${endpoint.baseURL}/responses`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stream: true }),
  })).text();
  const events = (await post()).split("\n").filter(line => line.startsWith("data: "))
    .map(line => JSON.parse(line.slice(6)));
  const call = events.find(event => event.type === "response.completed").response.output[0];
  assert.equal(call.name, "exec_command");
  assert.deepEqual(JSON.parse(call.arguments), { cmd: "fixture command" });
  assert.match(await post(), /Ready to teach/);
  assert.deepEqual(endpoint.requestedTools, ["exec_command"]);
});

test("Responses discovers a deferred namespaced tool before calling it once", async t => {
  const endpoint = await startLoopbackModel({ toolRequest: {
    name: "dojo_ui_ask", input: { prompt: "Which learner?" },
  } });
  t.after(() => endpoint.close());
  const post = async input => {
    const response = await fetch(`${endpoint.baseURL}/responses`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stream: true, ...input }),
    });
    const events = (await response.text()).split("\n")
      .filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
    return events.find(event => event.type === "response.completed").response.output[0];
  };
  const tools = [{ type: "tool_search", execution: "client" }];
  const search = await post({ tools });
  assert.equal(search.type, "tool_search_call");
  assert.deepEqual(search.arguments, { query: "dojo_ui_ask", limit: 1 });
  const input = [{ type: "tool_search_output", execution: "client", call_id: search.call_id,
    tools: [{ type: "namespace", name: "dojo", tools: [{ type: "function", name: "dojo_ui_ask" }] }] }];
  const call = await post({ tools, input });
  assert.equal(call.type, "function_call");
  assert.equal(call.namespace, "dojo");
  assert.equal(call.name, "dojo_ui_ask");
  assert.deepEqual(JSON.parse(call.arguments), { prompt: "Which learner?" });
  assert.equal((await post({ tools, input })).type, "message");
  assert.deepEqual(endpoint.requestedTools, ["tool_search", "dojo_ui_ask"]);
});

test("Gateway fixture uses FX's upstream completion event shape", async t => {
  const endpoint = await startLoopbackModel();
  t.after(() => endpoint.close());
  const response = await fetch(`${endpoint.baseURL.replace(/\/v1$/, "")}/v4/ai/language-model`, {
    method: "POST", headers: { "Content-Type": "application/json", "ai-language-model-id": "openai/gpt-5.5" }, body: JSON.stringify({ prompt: [] }),
  });
  const chunks = (await response.text()).split("\n\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  assert.equal(chunks[0].delta, "Ready to teach.");
  assert.deepEqual(chunks[1].finishReason, { unified: "stop", raw: "stop" });
  assert.equal(chunks[1].usage.outputTokens.total, 5);
  assert.deepEqual(endpoint.requestedModels, ["openai/gpt-5.5"]);
});

test("Gateway fixture emits the requested MCP tool with its input", async t => {
  const endpoint = await startLoopbackModel({ toolRequest: { name: "dojo_ui_ask", input: { prompt: "Which learner?" } } });
  t.after(() => endpoint.close());
  const response = await fetch(`${endpoint.baseURL.replace(/\/v1$/, "")}/v4/ai/language-model`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tools: [{ name: "mcp_dojo_ui_ask" }] }),
  });
  const chunks = (await response.text()).split("\n\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  assert.equal(chunks[0].type, "tool-call");
  assert.equal(chunks[0].toolName, "mcp_dojo_ui_ask");
  assert.deepEqual(chunks[0].input, { prompt: "Which learner?" });
  assert.equal(chunks[1].finishReason.unified, "tool-calls");
});

test("Gateway permission review uses the upstream decision tool without consuming lesson calls", async t => {
  const endpoint = await startLoopbackModel();
  t.after(() => endpoint.close());
  const response = await fetch(`${endpoint.baseURL.replace(/\/v1$/, "")}/v4/ai/language-model`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tools: [{ name: "permission_decision" }] }),
  });
  const chunks = (await response.text()).split("\n\n").filter(line => line.startsWith("data: {")).map(line => JSON.parse(line.slice(6)));
  assert.equal(chunks[0].toolName, "permission_decision");
  assert.equal(chunks[0].input.decision, "clear");
  assert.deepEqual(endpoint.requestedTools, []);
});

test("held response matches the target turn rather than a background request", async t => {
  const endpoint = await startLoopbackModel();
  t.after(() => endpoint.close());
  const held = endpoint.holdNextResponse(input => input.prompt === "target");
  let started = false;
  held.started.then(() => { started = true; });
  const post = prompt => fetch(`${endpoint.baseURL}/responses`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }),
  });
  await (await post("background")).text();
  assert.equal(started, false);
  const target = post("target");
  await held.started;
  held.release();
  assert.equal((await target).status, 200);
});

test("held response exposes physical client cancellation", async t => {
  const endpoint = await startLoopbackModel();
  t.after(() => endpoint.close());
  const held = endpoint.holdNextResponse();
  assert.ok(held.closed instanceof Promise);
  const controller = new AbortController();
  const request = fetch(`${endpoint.baseURL}/responses`, { method: "POST", signal: controller.signal,
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: "cancel" }) });
  const rejected = assert.rejects(request, { name: "AbortError" });
  await held.started;
  controller.abort();
  await rejected;
  await held.closed;
});

const postMessages = (endpoint, input, path = "v1/messages?beta=true") => fetch(`${endpoint.anthropicBaseURL}/${path}`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
});
const messageEvents = async response => (await response.text()).split("\n\n").filter(Boolean).map(block => {
  const [event, data] = block.split("\n");
  const parsed = JSON.parse(data.slice("data: ".length));
  assert.equal(event, `event: ${parsed.type}`);
  return parsed;
});

test("Messages streams one text reply and records the offered tools", async t => {
  const endpoint = await startLoopbackModel();
  t.after(() => endpoint.close());
  assert.doesNotMatch(endpoint.anthropicBaseURL, /\/v1$/);
  const events = await messageEvents(await postMessages(endpoint, { model: "claude-sonnet", stream: true,
    tools: [{ name: "Read" }, { name: "Grep" }], messages: [{ role: "user", content: "Introduce the lesson." }] }));
  assert.deepEqual(events.map(event => event.type), ["message_start", "content_block_start", "content_block_delta",
    "content_block_stop", "message_delta", "message_stop"]);
  assert.equal(events[0].message.model, "claude-sonnet");
  assert.deepEqual(events[2].delta, { type: "text_delta", text: "Ready to teach." });
  assert.equal(events[4].delta.stop_reason, "end_turn");
  assert.deepEqual(endpoint.toolLists, [["Read", "Grep"]]);
  assert.deepEqual(endpoint.routes, ["messages"]);
  assert.deepEqual(endpoint.requestedModels, ["claude-sonnet"]);
  assert.deepEqual(endpoint.requestedTools, []);
});

test("Messages calls a requested host tool once, then answers", async t => {
  const endpoint = await startLoopbackModel({ toolRequest: { name: "dojo_conformance_echo", input: { value: "receipt" } } });
  t.after(() => endpoint.close());
  const input = { model: "fixture", stream: true, tools: [{ name: "Read" }, { name: "mcp__harness-tools__dojo_conformance_echo" }] };
  const first = await messageEvents(await postMessages(endpoint, input));
  assert.deepEqual(first[1].content_block, { type: "tool_use", id: "toolu_lesson_1", name: "mcp__harness-tools__dojo_conformance_echo", input: {} });
  assert.deepEqual(first[2].delta, { type: "input_json_delta", partial_json: JSON.stringify({ value: "receipt" }) });
  assert.equal(first[4].delta.stop_reason, "tool_use");
  const second = await messageEvents(await postMessages(endpoint, input));
  assert.equal(second[2].delta.text, "Ready to teach.");
  assert.deepEqual(endpoint.requestedTools, ["mcp__harness-tools__dojo_conformance_echo"]);
});

test("Messages answers without streaming", async t => {
  const endpoint = await startLoopbackModel();
  t.after(() => endpoint.close());
  const response = await postMessages(endpoint, { model: "fixture", messages: [] }, "v1/messages");
  assert.match(response.headers.get("content-type"), /application\/json/);
  const message = await response.json();
  assert.equal(message.type, "message");
  assert.deepEqual(message.content, [{ type: "text", text: "Ready to teach." }]);
  assert.equal(message.stop_reason, "end_turn");
});

test("Messages discovers a host tool that is not offered yet", async t => {
  const endpoint = await startLoopbackModel({ toolRequest: { name: "dojo_conformance_echo", input: { value: "receipt" },
    discovery: { name: "ToolSearch", input: { query: "select:mcp__harness-tools__dojo_conformance_echo", max_results: 1 } } } });
  t.after(() => endpoint.close());
  const search = await (await postMessages(endpoint, { model: "fixture", tools: [{ name: "ToolSearch" }] }, "v1/messages")).json();
  assert.equal(search.content[0].name, "ToolSearch");
  assert.deepEqual(search.content[0].input, { query: "select:mcp__harness-tools__dojo_conformance_echo", max_results: 1 });
  const call = await (await postMessages(endpoint, { model: "fixture",
    tools: [{ name: "ToolSearch" }, { name: "mcp__harness-tools__dojo_conformance_echo" }] }, "v1/messages")).json();
  assert.equal(call.content[0].name, "mcp__harness-tools__dojo_conformance_echo");
  assert.deepEqual(call.content[0].input, { value: "receipt" });
  assert.deepEqual(endpoint.requestedTools, ["ToolSearch", "mcp__harness-tools__dojo_conformance_echo"]);
});

test("Messages can select a native tool without changing its input", async t => {
  const write = { file_path: "/course/probe.txt", content: "ok\n" };
  const endpoint = await startLoopbackModel({ selectMessagesTool: (_input, requested) =>
    requested.length ? undefined : { name: "Write", input: write } });
  t.after(() => endpoint.close());
  const call = await (await postMessages(endpoint, { model: "fixture", tools: [{ name: "Write" }] }, "v1/messages")).json();
  assert.equal(call.content[0].name, "Write");
  assert.deepEqual(call.content[0].input, write);
  const answer = await (await postMessages(endpoint, { model: "fixture", tools: [{ name: "Write" }] }, "v1/messages")).json();
  assert.equal(answer.content[0].text, "Ready to teach.");
  assert.deepEqual(endpoint.requestedTools, ["Write"]);
});

test("every route records the tool names it offered", async t => {
  const endpoint = await startLoopbackModel({ responses: true });
  t.after(() => endpoint.close());
  const post = (path, input) => fetch(`${endpoint.anthropicBaseURL}/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }).then(response => response.text());
  await post("v1/responses", { tools: [{ type: "tool_search", execution: "client" }, { type: "function", name: "exec_command" }],
    input: [{ type: "tool_search_output", tools: [{ type: "namespace", name: "dojo", tools: [{ type: "function", name: "dojo_ui_ask" }] }] }] });
  await post("v1/chat/completions", { tools: [{ type: "function", function: { name: "search_tool" } }] });
  await post("v4/ai/language-model", { tools: [{ name: "capability_search" }] });
  await post("v1/messages", { tools: [{ name: "Read" }] });
  await post("v1/chat/completions", { messages: [] });
  assert.deepEqual(endpoint.toolLists, [["tool_search", "exec_command", "dojo_ui_ask"], ["search_tool"], ["capability_search"], ["Read"], []]);
  assert.deepEqual(endpoint.routes, ["responses", "chat", "gateway", "messages", "chat"]);
  assert.equal(endpoint.requests.length, endpoint.toolLists.length);
  assert.equal(endpoint.requestedModels.length, endpoint.toolLists.length);
});

test("count_tokens is answered without recording a request", async t => {
  const endpoint = await startLoopbackModel();
  t.after(() => endpoint.close());
  const response = await postMessages(endpoint, { model: "fixture", messages: [] }, "v1/messages/count_tokens?beta=true");
  assert.deepEqual(await response.json(), { input_tokens: 1 });
  assert.deepEqual(endpoint.paths, ["POST /v1/messages/count_tokens?beta=true"]);
  assert.deepEqual(endpoint.requests, []);
  assert.deepEqual(endpoint.toolLists, []);
  assert.deepEqual(endpoint.routes, []);
});

test("a held Messages response waits for release", async t => {
  const endpoint = await startLoopbackModel();
  t.after(() => endpoint.close());
  const held = endpoint.holdNextResponse(input => JSON.stringify(input).includes("Wait for the model"));
  let answered = false;
  const pending = postMessages(endpoint, { model: "fixture", stream: true, messages: [{ role: "user", content: "Wait for the model" }] })
    .then(async response => { answered = true; return messageEvents(response); });
  await held.started;
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(answered, false);
  held.release();
  assert.equal((await pending).at(-1).type, "message_stop");
});

test("respondText overrides the default answer on every route", async t => {
  const seen = [];
  const endpoint = await startLoopbackModel({ respondText: (input, route) => {
    seen.push(route);
    return JSON.stringify(input).includes("LEARNER-ROLE") ? `Learner on ${route}.` : undefined;
  } });
  t.after(() => endpoint.close());
  const post = (path, input) => fetch(`${endpoint.baseURL}/${path}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }).then(response => response.text());
  const gateway = input => fetch(`${endpoint.anthropicBaseURL}/v4/ai/language-model`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  }).then(response => response.text());
  const learner = { model: "fixture", stream: true, messages: [{ role: "user", content: "LEARNER-ROLE" }], input: "LEARNER-ROLE" };
  assert.match(await post("responses", learner), /Learner on responses\./);
  assert.match(await post("chat/completions", learner), /Learner on chat\./);
  assert.match(await gateway(learner), /Learner on gateway\./);
  assert.match(JSON.stringify(await messageEvents(await postMessages(endpoint, learner))), /Learner on messages\./);
  assert.match(await post("responses", { stream: true, input: "Teach." }), /Ready to teach\./);
  assert.deepEqual(seen, ["responses", "chat", "gateway", "messages", "responses"]);
});
