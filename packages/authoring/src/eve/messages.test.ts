import { describe, expect, it } from "vitest";
import { defaultMessageReducer, type EveDynamicToolPart, type EveMessage, type EveAgentReducerEvent } from "@dojofoo/agent/client";
import { eveChatMessages } from "./messages";

function project(part: EveDynamicToolPart) {
  return eveChatMessages([{ id: "assistant-1", role: "assistant", parts: [part] }])[0].parts[0];
}

describe("Eve chat projection", () => {
  it("preserves streamed arguments, identity and order without mutating source messages", () => {
    const messages: EveMessage[] = [{ id: "assistant-1", role: "assistant", parts: [
      { type: "reasoning", text: "Inspecting the course", stepIndex: 1 },
      { type: "dynamic-tool", toolCallId: "call-1", toolName: "read_file", state: "input-streaming", input: undefined, inputText: '{"path":' },
      { type: "text", text: "Let's start here.", state: "streaming" },
    ] }];
    const before = structuredClone(messages);
    const result = eveChatMessages(messages);
    expect(result[0].id).toBe("assistant-1");
    expect(result[0].parts.map(part => part.type)).toEqual(["thinking", "tool-call", "text"]);
    expect(result[0].parts[1]).toMatchObject({ id: "call-1", arguments: '{"path":', state: "input-streaming" });
    expect(messages).toEqual(before);
    expect(eveChatMessages(messages)).toEqual(result);
  });

  it("keeps authoritative question identity and response after replay", () => {
    const question: EveDynamicToolPart = {
      type: "dynamic-tool", toolCallId: "question-call", toolName: "dojo_ui_ask", input: {},
      state: "approval-requested", approval: { id: "request-1" },
      toolMetadata: { eve: { kind: "tool-call", name: "dojo_ui_ask", inputRequest: {
        requestId: "request-1", kind: "question", display: "select", prompt: "Continue?",
        options: [{ id: "review", label: "Review" }],
      } } },
    };
    expect(project(question)).toMatchObject({ state: "approval-requested", metadata: { eve: question } });
    const answered = { ...question, state: "approval-responded" as const, toolMetadata: { eve: {
      ...question.toolMetadata!.eve!, inputResponse: { requestId: "request-1", optionId: "review" },
    } } };
    expect(project(answered)).toMatchObject({ state: "approval-responded", metadata: { eve: answered } });
  });

  it("retains failure, denied and preliminary result distinctions", () => {
    const base = { type: "dynamic-tool" as const, toolCallId: "call-1", toolName: "read_file", input: {} };
    expect(project({ ...base, state: "output-error", errorText: "Permission denied" })).toMatchObject({ state: "error", output: "Permission denied" });
    const denied = { ...base, state: "output-denied" as const, approval: { id: "request-1", approved: false as const } };
    expect(project(denied)).toMatchObject({ state: "error", approval: { approved: false }, metadata: { eve: denied } });
    const partial = { ...base, state: "output-available" as const, output: "First result", partial: true as const };
    expect(project(partial)).toMatchObject({ state: "input-complete", output: "First result", metadata: { eve: partial } });
  });

  it("projects the official reducer identically during streaming and full replay", () => {
    const reducer = defaultMessageReducer();
    const events: EveAgentReducerEvent[] = ([
      { type: "message.appended", data: { sequence: 1, stepIndex: 0, turnId: "turn-1", messageDelta: "Let's " } },
      { type: "message.appended", data: { sequence: 2, stepIndex: 0, turnId: "turn-1", messageDelta: "begin." } },
      { type: "message.completed", data: { sequence: 3, stepIndex: 0, turnId: "turn-1", message: "Let's begin.", finishReason: "stop" } },
    ] as const).map((event, index) => ({ ...event, meta: { at: "2026-09-12T12:00:00.000Z", id: `event-${index}` } }));
    let data = reducer.initial();
    const states = events.map(event => {
      data = reducer.reduce(data, event);
      return eveChatMessages(data.messages);
    });
    expect(states[0][0].parts[0]).toMatchObject({ type: "text", content: "Let's " });
    expect(states[1][0].parts[0]).toMatchObject({ type: "text", content: "Let's begin." });
    expect(states[2][0].parts).toHaveLength(1);
    expect(states.map(messages => messages[0].id)).toEqual([states[0][0].id, states[0][0].id, states[0][0].id]);
    const replayed = events.reduce(reducer.reduce, reducer.initial());
    expect(eveChatMessages(replayed.messages)).toEqual(states[2]);
  });

  it("retains public attachment references and names without inventing file URLs", () => {
    const messages: EveMessage[] = [{ id: "user-1", role: "user", parts: [
      { type: "file", filename: "figure.png", mediaType: "image/png", url: "https://example.com/figure.png" },
      { type: "file", filename: "private.pdf", mediaType: "application/pdf" },
    ] }];
    expect(eveChatMessages(messages)[0].parts).toMatchObject([
      { type: "image", source: { type: "url", value: "https://example.com/figure.png" } },
      { type: "text", content: "private.pdf" },
    ]);
  });
});
