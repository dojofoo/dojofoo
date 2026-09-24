import type { ToolCallPart } from "@tanstack/ai-client";
import { describe, expect, it } from "vitest";
import { isAgentQuestion, parseAgentQuestions, agentQuestionState } from "./agent-question";
import { eveChatMessages } from "@dojofoo/authoring/eve/messages";

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

  it("does not mistake an ordinary tool for a question", () => {
    expect(isAgentQuestion({ ...choice, name: "dojo_lesson_verify" })).toBe(false);
  });

  it("renders Eve's authoritative request and restores its chosen answer", () => {
    const request = { requestId: "request-42", kind: "question" as const, prompt: "Review this lesson?", display: "select" as const, options: [{ id: "review", label: "Review" }], allowFreeform: true };
    const part = eveChatMessages([{ id: "assistant-1", role: "assistant", parts: [{
      type: "dynamic-tool", toolName: "dojo_ui_ask", toolCallId: "native-call-1", input: { prompt: "Raw arguments are not the UI request" },
      state: "approval-responded", approval: { id: request.requestId },
      toolMetadata: { eve: { kind: "tool-call", name: "dojo_ui_ask", inputRequest: request, inputResponse: { requestId: request.requestId, optionId: "review" } } },
    }] }])[0].parts[0] as ToolCallPart;
    expect(isAgentQuestion(part)).toBe(true);
    expect(agentQuestionState(part)).toEqual({
      questions: [{ id: "request-42", title: "Review this lesson?", options: [{ id: "review", title: "Review", description: undefined }], allowOther: true, freeText: false }],
      answers: { "request-42": { questionId: "request-42", selectedIds: ["review"], otherText: undefined } },
      disabled: true,
    });
  });
});
