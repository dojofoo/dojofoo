import type { ToolCallPart } from "@tanstack/ai-client";
import { eveQuestion } from "@dojofoo/agent/messages";
import { toolQuestion, type AgentQuestionState } from "@dojofoo/uix/components/agent-question";

// The form and the questions of plain tools live in uix, where the chat renders; Eve's questions are the app's
export { AgentQuestion, parseAgentQuestions } from "@dojofoo/uix/components/agent-question";

/** The question in a tool call: Eve's own question, else Dojo.foo's own or an ask-user tool's */
export function agentQuestion(part: ToolCallPart): AgentQuestionState | undefined {
  const question = eveQuestion(part);
  if (!question) return toolQuestion(part);
  const { interactionId, request, answer, settled, error: failure } = question;
  return {
    id: part.id,
    questions: [{
      id: interactionId,
      title: request.prompt,
      options: request.options?.map(option => ({ id: option.id, title: option.label, description: option.description })),
      allowOther: request.allowFreeform ?? false,
      freeText: request.display === "text" || !request.options?.length,
    }],
    answers: answer ? { [interactionId]: {
      questionId: interactionId,
      selectedIds: answer.optionId ? [answer.optionId] : [],
      otherText: answer.text,
    } } : undefined,
    disabled: settled,
    failure,
  };
}

export function isAgentQuestion(part: ToolCallPart): boolean {
  return agentQuestion(part) !== undefined;
}

export function agentQuestionState(part: ToolCallPart): Omit<AgentQuestionState, "id"> {
  const { id: _, ...state } = agentQuestion(part) ?? { id: part.id, questions: [] };
  return state;
}

/** Native result metadata keeps the same identity as its live question event. */
export function agentQuestionId(part: ToolCallPart): string { return agentQuestion(part)?.id ?? part.id; }
