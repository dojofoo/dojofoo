import type { ToolCallPart } from "@tanstack/ai-client";
import { describe, expect, it } from "vitest";
import { isAgentQuestion, parseAgentQuestions, agentQuestionState } from "./agent-question";
import { eveChatMessages } from "@dojofoo/agent/messages";

const choice: ToolCallPart = {
  type: "tool-call",
  id: "choice",
  name: "elicitation",
  arguments: "{}",
  input: { question: "What next?", options: [{ id: "review", label: "Review" }] },
  state: "input-complete",
};

describe("agent questions", () => {
  it("recognizes and parses a question tool", () => {
    expect(isAgentQuestion(choice)).toBe(true);
    expect(parseAgentQuestions(choice.input)).toEqual([expect.objectContaining({ title: "What next?" })]);
  });

  it("recognizes native permission requests as actionable choices", () => {
    expect(isAgentQuestion({ ...choice, name: "request_permission" })).toBe(true);
  });

  it("restores native answers without reopening a completed question", () => {
    const part: ToolCallPart = { ...choice, state: "complete", output: { answers: { decision: ["review"] } },
      input: { questions: [{ id: "decision", title: "What next?", options: [{ id: "review", title: "Review" }] }] } };
    expect(agentQuestionState(part)).toMatchObject({ disabled: true, answers: {
      decision: { questionId: "decision", selectedIds: ["review"] },
    } });
  });

  it.each([false, true])("restores an authored question carried by a native tool result (ACP=%s)", wrapped => {
    const part: ToolCallPart = { ...choice, name: "execute", state: "complete", input: { code: "Native code-mode call" }, output: JSON.stringify({ dojoQuestion: {
      requestId: "question-42", title: "Which hint?", options: [{ id: "example", title: "An example" }, { id: "review", title: "Review" }], answers: { decision: ["example"] },
    } }) };
    if (wrapped) part.output = { toolCallId: "call_native", status: "completed", content: [{ type: "content", content: { type: "text", text: part.output } }] };
    expect(isAgentQuestion(part)).toBe(true);
    expect(agentQuestionState(part)).toMatchObject({ disabled: true,
      questions: [{ id: "decision", title: "Which hint?" }], answers: { decision: { selectedIds: ["example"] } },
    });
  });

  it("does not mistake an ordinary tool for a question", () => {
    expect(isAgentQuestion({ ...choice, name: "dojo_lesson_verify" })).toBe(false);
  });

  it("renders Eve's own question and restores its chosen answer", () => {
    const request = { kind: "question" as const, prompt: "Review this lesson?", display: "select" as const, options: [{ id: "review", label: "Review" }], allowFreeform: true };
    const part = eveChatMessages([{ id: "assistant-1", role: "assistant", parts: [{
      type: "tool", name: "ask_question", label: "Ask a question", kind: "tool", callId: "native-call-1", stepIndex: 0,
      input: { question: "Raw arguments are not the UI request" }, state: "completed", output: { answer: "Review" },
      interaction: { interactionId: "request-42", turnId: "turn-1", stepIndex: 0, request, status: "settled", outcome: "accepted",
        answer: { interactionId: "request-42", optionId: "review" } },
    }] }])[0]!.parts[0] as ToolCallPart;
    expect(isAgentQuestion(part)).toBe(true);
    expect(agentQuestionState(part)).toEqual({
      questions: [{ id: "request-42", title: "Review this lesson?", options: [{ id: "review", title: "Review", description: undefined }], allowOther: true, freeText: false }],
      answers: { "request-42": { questionId: "request-42", selectedIds: ["review"], otherText: undefined } },
      disabled: true,
      failure: undefined,
    });
  });
});
