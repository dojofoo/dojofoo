import { ChatClient, fetchServerSentEvents, stream, type UIMessage } from "@tanstack/ai-client";
import { toServerSentEventsResponse } from "@tanstack/ai";
import { streamEveAsAgUi } from "@dojofoo/authoring/eve/stream";
import { defaultMessageReducer } from "@dojofoo/agent/client";
import { agentQuestionState } from "@/components/chat/agent-question";
import { describe, expect, it, vi } from "vitest";

type Input = Parameters<typeof streamEveAsAgUi>[0];
type EveEvent = Input["events"] extends AsyncIterable<infer T> ? T : never;
const stamp = <const T>(event: T) => ({ ...event, meta: { id: "fixture-event", at: "2026-09-12T12:00:00.000Z" } });
async function* events(values: EveEvent[]) { yield* values; }
const wait = stamp({ type: "session.waiting", data: { continuationToken: "session-1", wait: "next-user-message" } });
const options = { initial: { messages: [] }, threadId: "session-1", runId: "run-1" };

describe("Eve stream consumed by TanStack ChatClient", () => {
  it("resumes an Eve question through a bound AG-UI interrupt without inventing a user message or tool result", async () => {
    const action = { callId: "call-1", kind: "tool-call" as const, toolName: "dojo_ui_ask", input: {} };
    const request = { action, requestId: "request-1", kind: "question" as const, display: "select" as const, prompt: "Review?", options: [{ id: "review", label: "Review" }] };
    const data = { turnId: "turn-1", stepIndex: 0, sequence: 1 };
    const contexts: unknown[] = [];
    const chunks: unknown[] = [];
    let paused: Input["initial"] = { messages: [] };
    const client = new ChatClient({
      persistence: false,
      onChunk: chunk => { chunks.push(chunk); },
      connection: fetchServerSentEvents("http://authoring.test/messages", {
        fetchClient: (async (_url, init) => {
          const context = JSON.parse(String(init?.body));
          contexts.push(context);
          const resumed = Boolean(context?.resume?.length);
          const source = resumed ? [
            stamp({ type: "input.resolved", data: { ...data, resolutions: [{ requestId: "request-1", kind: "question", outcome: "answered", response: { requestId: "request-1", optionId: "review" } }] } }), wait,
          ] : [
            stamp({ type: "message.received", data: { ...data, message: "Help me author" } }),
            stamp({ type: "actions.requested", data: { ...data, actions: [action] } }),
            stamp({ type: "input.requested", data: { ...data, requests: [request] } }), wait,
          ];
          const output = streamEveAsAgUi({ ...options, runId: context.runId, initial: paused, events: events(source) });
          paused = source.reduce(defaultMessageReducer().reduce, paused);
          return toServerSentEventsResponse(output);
        }) as typeof fetch,
      }),
    });
    try {
      await client.sendMessage("Help me author");
      const interrupt = client.getInterrupts()[0];
      expect(interrupt, JSON.stringify({ chunks, error: client.getError()?.message, state: client.getInterruptState() })).toMatchObject({ kind: "generic", id: "request-1", canResolve: true });
      if (interrupt?.kind !== "generic") throw new Error("Missing bound Eve question");
      interrupt.resolveInterrupt({ optionId: "review" });
      await vi.waitFor(() => expect(contexts).toHaveLength(2));
      await vi.waitFor(() => expect(client.getInterrupts()).toHaveLength(0));
      expect(contexts[1]).toMatchObject({
        threadId: "session-1", parentRunId: (contexts[0] as { runId: string }).runId,
        resume: [{ interruptId: "request-1", payload: { optionId: "review" } }],
      });
      expect(client.getMessages().filter(message => message.role === "user")).toHaveLength(1);
      const question = client.getMessages().flatMap(message => message.parts).find(part => part.type === "tool-call");
      if (question?.type !== "tool-call") throw new Error("Missing question receipt");
      expect(agentQuestionState(question)).toMatchObject({ disabled: true, answers: { "request-1": { selectedIds: ["review"] } } });
    } finally { client.dispose(); }
  });

  it("streams partial text and preserves previous messages without duplicating the optimistic user", async () => {
    const source = [
      stamp({ type: "message.received", data: { sequence: 1, turnId: "turn-1", message: "Hello" } }),
      stamp({ type: "message.appended", data: { sequence: 2, turnId: "turn-1", stepIndex: 0, messageDelta: "Hi " } }),
      stamp({ type: "message.appended", data: { sequence: 3, turnId: "turn-1", stepIndex: 0, messageDelta: "there" } }),
      stamp({ type: "message.completed", data: { sequence: 4, turnId: "turn-1", stepIndex: 0, message: "Hi there", finishReason: "stop" } }), wait,
    ];
    const snapshots: UIMessage[][] = [];
    const client = new ChatClient({
      connection: stream(() => streamEveAsAgUi({ ...options, events: events(source), initial: { messages: [{ id: "earlier", role: "assistant", parts: [{ type: "text", text: "Earlier lesson" }] }] } })),
      persistence: false,
      onMessagesChange: messages => snapshots.push(structuredClone(messages)),
    });
    await client.sendMessage("Hello");
    const last = snapshots.at(-1)!;
    expect(last.filter(message => message.role === "user")).toHaveLength(1);
    expect(last.find(message => message.id === "earlier")?.parts[0]).toMatchObject({ content: "Earlier lesson" });
    expect(snapshots.some(messages => messages.some(message => message.parts.some(part => part.type === "text" && part.content === "Hi ")))).toBe(true);
    expect(last.at(-1)?.parts[0]).toMatchObject({ type: "text", content: "Hi there" });
  });

  it("retains question request metadata and the accepted response through AG-UI", async () => {
    const action = { callId: "call-1", kind: "tool-call" as const, toolName: "dojo_ui_ask", input: {} };
    const request = { action, requestId: "request-1", kind: "question" as const, display: "select" as const, prompt: "Review?", options: [{ id: "review", label: "Review" }] };
    const data = { turnId: "turn-1", stepIndex: 0, sequence: 1 };
    let messages: UIMessage[] = [];
    const client = new ChatClient({
      connection: stream(() => streamEveAsAgUi({ ...options, events: events([
        stamp({ type: "actions.requested", data: { ...data, actions: [action] } }),
        stamp({ type: "input.requested", data: { ...data, requests: [request] } }),
        stamp({ type: "input.resolved", data: { ...data, resolutions: [{ requestId: "request-1", kind: "question", outcome: "answered", response: { requestId: "request-1", optionId: "review" } }] } }), wait,
      ]) })), persistence: false, onMessagesChange: value => { messages = value; },
    });
    await client.sendMessage("Continue");
    const question = messages.flatMap(message => message.parts).find(part => part.type === "tool-call");
    expect(question?.type).toBe("tool-call");
    if (question?.type !== "tool-call") throw new Error("Question missing");
    expect(agentQuestionState(question)).toMatchObject({ disabled: true, answers: { "request-1": { selectedIds: ["review"] } } });
  });

  it("forwards backend failures and rejects a truncated response instead of reporting success", async () => {
    for (const source of [[], [stamp({ type: "turn.failed", data: { sequence: 1, turnId: "turn-1", code: "PROVIDER_AUTH", message: "Login required" } })]]) {
      const chunks = await Array.fromAsync(streamEveAsAgUi({ ...options, events: events(source) }));
      expect(chunks.at(-1)?.type).toBe("RUN_ERROR");
      expect(chunks.some(chunk => chunk.type === "RUN_FINISHED")).toBe(false);
      if (source.length) expect(chunks.at(-1)).toMatchObject({ code: "PROVIDER_AUTH", message: "Login required" });
    }
  });

  it("closes the Eve response iterator when the downstream reader disconnects", async () => {
    let closed = false;
    async function* source() {
      try {
        yield stamp({ type: "message.appended", data: { sequence: 1, turnId: "turn-1", stepIndex: 0, messageDelta: "Hi" } });
        yield wait;
      } finally { closed = true; }
    }
    const output = streamEveAsAgUi({ ...options, events: source() });
    expect((await output.next()).value?.type).toBe("RUN_STARTED");
    expect((await output.next()).value?.type).toBe("MESSAGES_SNAPSHOT");
    await output.return(undefined);
    expect(closed).toBe(true);
  });
});
