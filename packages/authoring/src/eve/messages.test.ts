import { describe, expect, it } from "vitest";
import type { EveMessage, EveMessagePart } from "@dojofoo/agent/client";
import { eveChatMessages, eveQuestion } from "./messages";
import { KYOSHI_START } from "./bootstrap";

type Tool = Extract<EveMessagePart, { type: "tool" }>;
type Interaction = NonNullable<Tool["interaction"]>;

function project(part: EveMessagePart) {
  return eveChatMessages([{ id: "assistant-1", role: "assistant", parts: [part] }])[0]!.parts[0]!;
}

const call = { type: "tool" as const, callId: "call-1", stepIndex: 0, kind: "tool" as const, name: "read_file", label: "Read file" };
const question: Interaction = {
  interactionId: "interaction-1", turnId: "turn-1", stepIndex: 0, status: "open",
  request: { kind: "question", prompt: "Continue?", display: "select", options: [{ id: "review", label: "Review" }] },
};

describe("Eve chat projection", () => {
  it("hides only the first server lifecycle input, not actual messages with similar text", () => {
    const messages: EveMessage[] = [
      { id: "start", role: "user", parts: [{ type: "text", text: KYOSHI_START }] },
      { id: "answer", role: "assistant", parts: [{ type: "text", text: "What would you like to teach?" }] },
      { id: "human", role: "user", parts: [{ type: "text", text: "Help me author this course." }] },
    ];
    expect(eveChatMessages(messages).map(message => message.id)).toEqual(["answer", "human"]);
    expect(messages).toHaveLength(3);
  });

  it("hides tagged turns anywhere in the conversation, but not dojo:// links", () => {
    const messages: EveMessage[] = [
      { id: "begin", role: "user", parts: [{ type: "text", text: "[dojo:begin] Begin the lesson.\n\nExcerpts from this learner's earlier conversation." }] },
      { id: "reply", role: "assistant", parts: [{ type: "text", text: "Ready to teach." }] },
      { id: "link", role: "user", parts: [{ type: "text", text: "dojo://courses/first explains it" }] },
      { id: "check", role: "user", parts: [{ type: "text", text: "[dojo:check] Ran lesson checks." }] },
      { id: "start", role: "user", parts: [{ type: "text", text: KYOSHI_START }] },
      { id: "quoted", role: "user", parts: [{ type: "text", text: "Why does [dojo:begin] show up?" }] },
    ];
    expect(eveChatMessages(messages).map(message => message.id)).toEqual(["reply", "link", "quoted"]);
  });

  it("preserves streamed arguments, identity and order without mutating source messages", () => {
    const messages: EveMessage[] = [{ id: "assistant-1", role: "assistant", parts: [
      { type: "reasoning", text: "Inspecting the course", stepIndex: 1 },
      { ...call, state: "streaming", inputText: '{"path":' },
      { type: "text", text: "Let's start here.", state: "streaming" },
    ] }];
    const before = structuredClone(messages);
    const result = eveChatMessages(messages);
    expect(result[0]!.id).toBe("assistant-1");
    expect(result[0]!.parts.map(part => part.type)).toEqual(["thinking", "tool-call", "text"]);
    expect(result[0]!.parts[1]).toMatchObject({ id: "call-1", arguments: '{"path":', state: "input-streaming" });
    expect(messages).toEqual(before);
    expect(eveChatMessages(messages)).toEqual(result);
  });

  it("reads a call's question, its answer and how Eve settled it", () => {
    const asked = project({ ...call, name: "ask_question", state: "blocked", input: {}, interaction: question });
    expect(asked).toMatchObject({ type: "tool-call", state: "input-complete" });
    expect(eveQuestion(asked as never)).toMatchObject({ interactionId: "interaction-1", settled: false, error: undefined });
    const answered = project({ ...call, name: "ask_question", state: "completed", input: {}, output: { answer: "Review" },
      interaction: { ...question, status: "settled", outcome: "accepted", answer: { interactionId: "interaction-1", optionId: "review" } } });
    expect(eveQuestion(answered as never)).toMatchObject({ settled: true, answer: { optionId: "review" }, error: undefined });
    const withdrawn = project({ ...call, name: "ask_question", state: "cancelled", input: {},
      interaction: { ...question, status: "settled", outcome: "withdrawn" } });
    expect(eveQuestion(withdrawn as never)).toMatchObject({ settled: true, error: "This question was withdrawn." });
  });

  it("shows a question no call carries as the question form", () => {
    const part = project({ ...question, type: "interaction" });
    expect(part).toMatchObject({ type: "tool-call", id: "interaction-1", state: "input-complete" });
    expect(eveQuestion(part as never)).toMatchObject({ interactionId: "interaction-1", request: { prompt: "Continue?" } });
  });

  it("retains failure, approval and running distinctions", () => {
    expect(project({ ...call, state: "failed", input: {}, error: { code: "denied", message: "Permission denied" } }))
      .toMatchObject({ state: "error", output: "Permission denied" });
    const approval: Interaction = { ...question, request: { kind: "approval", prompt: "Read it?" }, status: "settled", outcome: "declined" };
    expect(project({ ...call, state: "rejected", input: {}, interaction: approval }))
      .toMatchObject({ state: "error", approval: { id: "interaction-1", approved: false } });
    expect(project({ ...call, state: "running", input: { path: "lesson.md" }, output: "First result" }))
      .toMatchObject({ state: "input-complete", output: "First result", arguments: '{"path":"lesson.md"}' });
  });

  it("retains public attachment references and names without inventing file URLs", () => {
    const messages: EveMessage[] = [{ id: "user-1", role: "user", parts: [
      { type: "file", filename: "figure.png", mediaType: "image/png", url: "https://example.com/figure.png" },
      { type: "file", filename: "private.pdf", mediaType: "application/pdf" },
    ] }];
    expect(eveChatMessages(messages)[0]!.parts).toMatchObject([
      { type: "image", source: { type: "url", value: "https://example.com/figure.png" } },
      { type: "text", content: "private.pdf" },
    ]);
  });
});
