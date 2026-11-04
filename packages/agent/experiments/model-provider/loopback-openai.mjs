import { createServer } from "node:http";
import { once } from "node:events";

/** The tool names a request offered, per route; a Responses tool without a name contributes its type. */
function offeredTools(route, input) {
  if (route === "chat") return (input.tools ?? []).map(tool => tool.function?.name).filter(Boolean);
  if (route !== "responses") return (input.tools ?? []).map(tool => tool.name).filter(Boolean);
  const discovered = Array.isArray(input.input)
    ? input.input.filter(entry => entry.type === "tool_search_output").flatMap(entry => entry.tools ?? []) : [];
  return [...(input.tools ?? []), ...discovered].flatMap(tool =>
    tool.type === "namespace" ? (tool.tools ?? []).map(child => child.name ?? child.type) : [tool.name ?? tool.type]);
}

/** Deterministic Responses, Chat Completions, FX gateway and Anthropic Messages endpoint; real harness/CLI, no external inference. */
export async function startLoopbackModel({ toolRequest, responses = true, selectChatTool, selectResponsesTool, selectMessagesTool, selectGatewayTool, latencyMs = 0 } = {}) {
  const requests = [];
  const requestedModels = [];
  const paths = [];
  const requestedTools = [];
  const toolLists = [];
  const routes = [];
  let nextHeldResponse;
  const server = createServer(async (request, response) => {
    paths.push(`${request.method} ${request.url}`);
    let body = "";
    for await (const chunk of request) body += chunk;
    if (request.method !== "POST") { response.writeHead(404); response.end(); return; }
    if (!responses && request.url === "/v1/responses") { response.writeHead(404); response.end(); return; }
    const { pathname } = new URL(request.url, "http://loopback");
    if (pathname === "/v1/messages/count_tokens") {
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ input_tokens: 1 }));
      return;
    }
    const input = JSON.parse(body);
    const route = pathname === "/v4/ai/language-model" ? "gateway" : pathname === "/v1/chat/completions" ? "chat"
      : pathname === "/v1/messages" ? "messages" : "responses";
    requests.push(input);
    requestedModels.push(request.headers["ai-language-model-id"] ?? input.model);
    toolLists.push(offeredTools(route, input));
    routes.push(route);
    if (nextHeldResponse?.matches(input)) {
      const held = nextHeldResponse;
      nextHeldResponse = undefined;
      response.once("close", () => held.closed.resolve());
      held.started.resolve();
      await Promise.race([held.release.promise, once(response, "close")]);
      if (response.destroyed) return;
    }
    if (latencyMs) await new Promise(resolve => setTimeout(resolve, latencyMs));
    if (route === "messages") {
      const offered = input.tools ?? [];
      const target = toolRequest && offered.find(tool => tool.name?.endsWith(toolRequest.name));
      const discovery = toolRequest?.discovery;
      const selected = selectMessagesTool?.(input, requestedTools)
        ?? (target && !requestedTools.includes(target.name) ? { name: target.name, input: toolRequest.input }
          : !target && discovery && requestedTools.length === 0 && offered.some(tool => tool.name === discovery.name) ? discovery : undefined);
      if (selected) requestedTools.push(selected.name);
      const usage = { input_tokens: 10, output_tokens: 5 };
      const content = selected ? { type: "tool_use", id: `toolu_lesson_${requestedTools.length}`, name: selected.name, input: selected.input }
        : { type: "text", text: "Ready to teach." };
      const message = { id: `msg_${requests.length}`, type: "message", role: "assistant", model: input.model,
        content: [content], stop_reason: selected ? "tool_use" : "end_turn", stop_sequence: null, usage };
      if (!input.stream) { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(message)); return; }
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const event of [
        { type: "message_start", message: { ...message, content: [], stop_reason: null } },
        { type: "content_block_start", index: 0, content_block: selected ? { ...content, input: {} } : { type: "text", text: "" } },
        { type: "content_block_delta", index: 0, delta: selected
          ? { type: "input_json_delta", partial_json: JSON.stringify(selected.input) } : { type: "text_delta", text: content.text } },
        { type: "content_block_stop", index: 0 },
        { type: "message_delta", delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: { output_tokens: 5 } },
        { type: "message_stop" },
      ]) response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      response.end();
      return;
    }
    if (request.url === "/v4/ai/language-model") {
      // Same gateway event shape as vercel-labs/fx tests/e2e/tmux-helpers.ts.
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      let events = [
        { type: "text-delta", id: "answer_1", delta: "Ready to teach." },
        { type: "finish", finishReason: { unified: "stop", raw: "stop" },
          usage: { inputTokens: { total: 3 }, outputTokens: { total: 5 } } },
      ];
      const contextTool = toolRequest && input.tools?.find(tool => tool.name?.endsWith(toolRequest.name));
      const discovery = toolRequest?.discovery;
      const discover = !contextTool && discovery && requestedTools.length === 0 && input.tools?.some(tool => tool.name === discovery.name);
      const permissionReview = input.tools?.length === 1 && input.tools[0].name === "permission_decision";
      const selected = permissionReview ? { name: "permission_decision", input: { risk: "low", decision: "clear", rationale: "Local test fixture" } }
        : selectGatewayTool?.(input, requestedTools) ?? (contextTool && !requestedTools.includes(contextTool.name)
        ? { name: contextTool.name, input: toolRequest.input } : discover ? discovery : undefined);
      if (selected) {
        if (!permissionReview) requestedTools.push(selected.name);
        events = [
          { type: "tool-call", toolCallId: `call_lesson_${requestedTools.length}`, toolName: selected.name, input: selected.input },
          { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" } },
        ];
      }
      for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
      response.end("data: [DONE]\n\n");
      return;
    }
    if (request.url === "/v1/chat/completions") {
      const base = { id: `chat_${requests.length}`, object: "chat.completion", created: 1, model: input.model };
      const contextTool = toolRequest && input.tools?.find(tool => tool.function?.name?.endsWith(toolRequest.name));
      const selected = selectChatTool ? selectChatTool(input, requestedTools)
        : contextTool && requestedTools.length === 0 ? { name: contextTool.function.name, input: toolRequest.input } : undefined;
      const call = selected ? { id: `call_lesson_${requestedTools.length}`, type: "function",
        function: { name: selected.name, arguments: JSON.stringify(selected.input) } } : undefined;
      if (call) requestedTools.push(call.function.name);
      const message = call ? { role: "assistant", content: null, tool_calls: [call] }
        : { role: "assistant", content: "Ready to teach." };
      const finishReason = call ? "tool_calls" : "stop";
      if (!input.stream) {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ ...base, choices: [{ index: 0,
          message, finish_reason: finishReason }] }));
        return;
      }
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      for (const choice of [
        { index: 0, delta: call ? { role: "assistant", tool_calls: [{ index: 0, ...call }] } : message, finish_reason: null },
        { index: 0, delta: {}, finish_reason: finishReason },
      ]) response.write(`data: ${JSON.stringify({ ...base, object: "chat.completion.chunk", choices: [choice] })}\n\n`);
      response.end("data: [DONE]\n\n");
      return;
    }
    const part = { type: "output_text", text: "Ready to teach.", annotations: [] };
    const item = { id: `msg_${requests.length}`, type: "message", role: "assistant", status: "completed", content: [part] };
    const result = { id: `resp_${requests.length}`, object: "response", created_at: 1, model: "gpt-4o", status: "completed", output: [item],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } };
    if (!input.stream) { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify(result)); return; }
    response.writeHead(200, { "Content-Type": "text/event-stream" });
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
    // Responses client-side search returns deferred schemas in input, possibly
    // namespaced. Match the documented tool_search_output contract, not prose.
    const discovered = Array.isArray(input.input)
      ? input.input.filter(entry => entry.type === "tool_search_output").flatMap(entry => entry.tools ?? []) : [];
    const available = [...(input.tools ?? []), ...discovered].flatMap(tool =>
      tool.type === "namespace" ? tool.tools.map(child => ({ ...child, namespace: tool.name })) : [tool]);
    const selected = selectResponsesTool?.(input, requestedTools);
    const contextTool = selected ?? (toolRequest && available.find(tool => tool.name?.endsWith(toolRequest.name)));
    const search = toolRequest && !contextTool && requestedTools.length === 0
      && input.tools?.some(tool => tool.type === "tool_search" && tool.execution === "client");
    if (search) {
      requestedTools.push("tool_search");
      const call = { id: "search_lesson", call_id: "call_search_lesson", type: "tool_search_call",
        execution: "client", status: "completed", arguments: { query: toolRequest.name, limit: 1 } };
      events = [
        { type: "response.created", response: { ...result, status: "in_progress", output: [] } },
        { type: "response.output_item.added", output_index: 0, item: { ...call, status: "in_progress" } },
        { type: "response.output_item.done", output_index: 0, item: call },
        { type: "response.completed", response: { ...result, output: [call] } },
      ];
    } else if (contextTool && (selected || !requestedTools.includes(contextTool.name))) {
      requestedTools.push(contextTool.name);
      const suffix = requestedTools.length === 1 ? "" : `_${requestedTools.length}`;
      const call = { id: `fc_lesson${suffix}`, call_id: `call_lesson${suffix}`, type: "function_call", name: contextTool.name,
        ...(contextTool.namespace ? { namespace: contextTool.namespace } : {}),
        arguments: JSON.stringify(selected ? selected.input : toolRequest.input), status: "completed" };
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
  const origin = `http://127.0.0.1:${server.address().port}`;
  return { requests, requestedModels, paths, requestedTools, toolLists, routes, baseURL: `${origin}/v1`, anthropicBaseURL: origin,
    holdNextResponse(matches = () => true) {
      if (nextHeldResponse) throw new Error("A fixture response is already held.");
      const held = { started: Promise.withResolvers(), release: Promise.withResolvers(), closed: Promise.withResolvers(), matches };
      nextHeldResponse = held;
      return { started: held.started.promise, closed: held.closed.promise, release: () => held.release.resolve() };
    },
    close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }),
  };
}
