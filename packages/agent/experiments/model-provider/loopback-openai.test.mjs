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
