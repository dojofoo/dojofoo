import { defaultMessageReducer, type MessageStreamEvent } from "@dojofoo/agent/client";
import { StreamProcessor, toServerSentEventsResponse, type StreamChunk } from "@tanstack/ai";
import { expect, it } from "vitest";
import { streamEveAsAgUi } from "./stream";
import { projectEveToolCall } from "./messages";

const meta = { at: "2026-09-12T12:00:00.000Z", id: "event" };
const turn = { sequence: 1, stepIndex: 0, turnId: "current" };
const boundary: MessageStreamEvent = { type: "session.waiting", data: { continuationToken: "session", wait: "next-user-message" }, meta };
const reducer = defaultMessageReducer();
async function* events(values: MessageStreamEvent[]) { yield* values; }
async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const result: StreamChunk[] = [];
  for await (const chunk of stream) result.push(chunk);
  return result;
}

it("streams the same reply bytes with zero or thirty previous turns", async () => {
  const reply: MessageStreamEvent[] = Array.from({ length: 300 }, (_, sequence) => ({
    type: "message.appended", data: { ...turn, sequence, messageDelta: "word " }, meta,
  }));
  reply.push({ type: "message.completed", data: { ...turn, message: "word ".repeat(300), finishReason: "stop" }, meta }, boundary);
  const bytes: number[] = [];
  for (const previousTurns of [0, 30]) {
    const initial = reducer.initial();
    const messages = Array.from({ length: previousTurns }, (_, index) => ({
      id: `previous-${index}`, role: "assistant" as const,
      parts: [{ type: "text" as const, text: "Previous guidance. ".repeat(50), state: "done" as const }],
    }));
    const chunks = await collect(streamEveAsAgUi({ events: events(reply), initial: { ...initial, messages }, threadId: "session", runId: "run" }));
    expect(chunks.filter(chunk => chunk.type === "MESSAGES_SNAPSHOT")).toHaveLength(0);
    expect(chunks.filter(chunk => chunk.type === "TEXT_MESSAGE_CONTENT")).toHaveLength(300);
    async function* wire() { yield* chunks; }
    bytes.push(Buffer.byteLength(await toServerSentEventsResponse(wire()).text()));
  }
  expect(bytes[1]).toBe(bytes[0]);
  console.info(`300 streamed deltas: ${bytes[0]} bytes with no history; ${bytes[1]} bytes after 30 turns.`);
});

it("streams tool argument fragments and keeps the final parsed result and metadata", async () => {
  const action = { callId: "call", kind: "tool-call" as const, toolName: "read_file", input: { path: "notes.md" } };
  const chunks = await collect(streamEveAsAgUi({ initial: reducer.initial(), threadId: "session", runId: "run", events: events([
    { type: "action.input.appended", data: { ...turn, callId: action.callId, toolName: action.toolName, inputTextDelta: '{"path":' }, meta },
    { type: "action.input.appended", data: { ...turn, callId: action.callId, toolName: action.toolName, inputTextDelta: '"notes.md"}' }, meta },
    { type: "actions.requested", data: { ...turn, actions: [action] }, meta },
    { type: "action.partial", data: { ...turn, result: { callId: action.callId, kind: "tool-result", toolName: action.toolName, output: "Preview" } }, meta },
    { type: "action.result", data: { ...turn, status: "completed", result: { callId: action.callId, kind: "tool-result", toolName: action.toolName, output: { text: "Done" } } }, meta }, boundary,
  ]) }));
  const client = new StreamProcessor();
  const results = [];
  for (const chunk of chunks) {
    client.processChunk(JSON.parse(JSON.stringify(chunk)));
    if (chunk.type === "TOOL_CALL_RESULT") {
      const part = client.getMessages()[0].parts.find(part => part.type === "tool-call");
      if (part?.type === "tool-call") results.push(projectEveToolCall(part));
    }
  }
  const part = client.getMessages()[0].parts.find(part => part.type === "tool-call");
  expect(chunks.filter(chunk => chunk.type === "TOOL_CALL_ARGS").map(chunk => chunk.delta).join("")).toBe('{"path":"notes.md"}');
  expect(results).toMatchObject([{ state: "input-complete", output: "Preview" }, { state: "complete", output: { text: "Done" } }]);
  expect(part).toMatchObject({ id: "call", arguments: '{"path":"notes.md"}', input: { path: "notes.md" }, output: { text: "Done" }, metadata: { eve: { state: "output-available", output: { text: "Done" } } } });
});

it("attaches once and resumes saved text and reasoning without losing or duplicating prefixes", async () => {
  const initial = ([
    { type: "reasoning.appended", data: { ...turn, reasoningDelta: "Think" }, meta },
    { type: "message.appended", data: { ...turn, messageDelta: "Hel" }, meta },
  ] satisfies MessageStreamEvent[]).reduce(reducer.reduce, reducer.initial());
  const continuation: MessageStreamEvent[] = [
    { type: "reasoning.appended", data: { ...turn, reasoningDelta: " more" }, meta },
    { type: "reasoning.completed", data: { ...turn, reasoning: "Think more" }, meta },
    { type: "message.appended", data: { ...turn, messageDelta: "lo" }, meta },
    { type: "message.completed", data: { ...turn, message: "Hello", finishReason: "stop" }, meta }, boundary,
  ];
  const chunks = await collect(streamEveAsAgUi({ events: events(continuation), initial, threadId: "session", runId: "run", attach: true }));
  expect(chunks.filter(chunk => chunk.type === "MESSAGES_SNAPSHOT")).toHaveLength(1);
  const client = new StreamProcessor();
  for (const chunk of chunks) client.processChunk(chunk);
  const messages = client.getMessages();
  expect(messages).toHaveLength(1);
  expect(messages[0].id).toBe(initial.messages[0].id);
  expect(messages[0].parts).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "thinking", content: "Think more" }),
    expect.objectContaining({ type: "text", content: "Hello" }),
  ]));
});

it("keeps text on both sides of a tool call in a multi-step reply", async () => {
  const action = { callId: "read", kind: "tool-call" as const, toolName: "read_file", input: {} };
  const chunks = await collect(streamEveAsAgUi({ initial: reducer.initial(), threadId: "session", runId: "run", events: events([
    { type: "message.completed", data: { ...turn, message: "I'll inspect the file.", finishReason: "tool-calls" }, meta },
    { type: "actions.requested", data: { ...turn, actions: [action] }, meta },
    { type: "action.result", data: { ...turn, status: "completed", result: { callId: "read", kind: "tool-result", toolName: "read_file", output: "File" } }, meta },
    { type: "message.appended", data: { ...turn, stepIndex: 1, messageDelta: "Here is what I found." }, meta },
    { type: "message.completed", data: { ...turn, stepIndex: 1, message: "Here is what I found.", finishReason: "stop" }, meta }, boundary,
  ]) }));
  const client = new StreamProcessor();
  for (const chunk of chunks) client.processChunk(chunk);
  expect(client.getMessages()[0].parts.map(part => part.type === "text" ? part.content : part.type)).toEqual([
    "I'll inspect the file.", "tool-call", "tool-result", "Here is what I found.",
  ]);
});

it("shows Eve's public sign-in explanation while streaming", async () => {
  const chunks = await collect(streamEveAsAgUi({ initial: reducer.initial(), threadId: "session", runId: "run", events: events([
    { type: "authorization.required", data: { ...turn, name: "course-account", description: "Sign in to continue." }, meta }, boundary,
  ]) }));
  const client = new StreamProcessor();
  for (const chunk of chunks) client.processChunk(chunk);
  expect(client.getMessages()[0]?.parts).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "text", content: expect.stringContaining("Sign in to continue.") }),
  ]));
});
