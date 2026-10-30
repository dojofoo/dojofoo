import type { ToolCallPart } from "@tanstack/ai-client";
import { useState, type CSSProperties } from "react";
import { AskUserQuestions, type AskUserAnswer, type AskUserQuestion } from "./ask-user-questions";

/** A question a tool call puts to the learner: what it asks, what was answered, and whether it can still be answered */
export type AgentQuestionState = {
  /** Its identity: a live question and its result share it */
  id: string;
  questions: AskUserQuestion[];
  answers?: Record<string, AskUserAnswer>;
  disabled?: boolean;
  failure?: string;
};

/**
 * The question in a tool call: Dojo.foo's own (a `dojoQuestion` in its output) or an ask-user tool's input
 * (elicitation, request_permission, request_user_input, ask_user, ask_user_question). Apps add their agents' own
 * question events in front of it (packages/ui adds Eve's).
 */
export function toolQuestion(part: ToolCallPart): AgentQuestionState | undefined {
  const native = nativeQuestion(part);
  if (!native && !(isQuestionTool(part) && parseAgentQuestions(part.input).length > 0)) return undefined;
  const questions = parseAgentQuestions(native ? { id: "decision", title: native.title, options: native.options } : part.input);
  const output = native ? { answers: native.answers } : part.output && typeof part.output === "object" ? part.output as Record<string, unknown> : undefined;
  const values = output?.answers && typeof output.answers === "object" ? output.answers as Record<string, unknown> : undefined;
  const answers = values ? Object.fromEntries(questions.map(item => {
    const id = item.id!;
    const answer = Array.isArray(values[id]) ? values[id].filter((value): value is string => typeof value === "string") : [];
    const options = new Set(item.options?.map(option => option.id));
    return [id, { questionId: id, selectedIds: answer.filter(value => options.has(value)),
      ...(answer.some(value => !options.has(value)) ? { otherText: answer.filter(value => !options.has(value)).join("\n") } : {}) }];
  })) : undefined;
  return { id: native?.requestId ?? part.id, questions, ...(answers ? { answers } : {}), ...(part.state === "complete" ? { disabled: true } : {}) };
}

export function AgentQuestion({
  className,
  answers,
  disabled = false,
  failure,
  onAnswer,
  questions,
}: {
  className?: string;
  answers?: Record<string, AskUserAnswer>;
  disabled?: boolean;
  failure?: string;
  onAnswer: (answers: Record<string, AskUserAnswer>) => void | Promise<void>;
  questions: AskUserQuestion[];
}) {
  const [submitted, setSubmitted] = useState<Record<string, AskUserAnswer> | null>(null);
  const [error, setError] = useState<string>();
  return (
    <>
    <AskUserQuestions
      answers={answers ?? submitted ?? undefined}
      className={["max-sm:[&_.ui-button__icon]:hidden", className].filter(Boolean).join(" ")}
      shape="rounded"
      style={{ borderRadius: "var(--box-radius)", background: "var(--surface-3)", border: 0, boxShadow: "var(--shadow-3)", "--focus-ring": "var(--brand)" } as CSSProperties}
      disabled={disabled || submitted !== null}
      onComplete={async (answers) => {
        if (disabled || submitted) return;
        setError(undefined);
        setSubmitted(answers);
        try { await onAnswer(answers); }
        catch (cause) {
          setSubmitted(null);
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      }}
      questions={questions}
    />
    {error ?? failure ? <p role="alert" className="text-sm text-destructive">{error ?? failure}</p> : null}
    </>
  );
}

function nativeQuestion(part: ToolCallPart) {
  const candidates: unknown[] = [part.output];
  if (part.output && typeof part.output === "object") {
    const content = (part.output as Record<string, unknown>).content;
    if (Array.isArray(content)) for (const block of content) {
      if (block?.type === "content" && block.content?.type === "text") candidates.push(block.content.text);
    }
  }
  for (let output of candidates) {
    if (typeof output === "string") { try { output = JSON.parse(output); } catch { continue; } }
    if (!output || typeof output !== "object") continue;
    const value = (output as Record<string, unknown>).dojoQuestion;
    if (!value || typeof value !== "object") continue;
    const question = value as Record<string, unknown>;
    if (typeof question.requestId !== "string" || typeof question.title !== "string" || !Array.isArray(question.options)) continue;
    return { requestId: question.requestId, title: question.title, options: question.options, answers: question.answers };
  }
}

function isQuestionTool(part: ToolCallPart): boolean {
  return /^(elicitation|request_permission|request_user_input|ask_user(?:_question)?)$/iu.test(part.name);
}

export function parseAgentQuestions(input: unknown): AskUserQuestion[] {
  if (!input || typeof input !== "object") return [];
  const value = input as Record<string, unknown>;
  const raw = Array.isArray(value.questions) ? value.questions : [value];
  return raw.flatMap((question, index) => {
    if (!question || typeof question !== "object") return [];
    const item = question as Record<string, unknown>;
    const options = Array.isArray(item.options) ? item.options : [];
    return [{
      id: String(item.id ?? `answer-${index}`),
      title: String(item.title ?? item.question ?? "Choose an answer"),
      options: options.flatMap((option, optionIndex) => {
        if (!option || typeof option !== "object") return [];
        const choice = option as Record<string, unknown>;
        return [{
          id: String(choice.id ?? choice.label ?? optionIndex),
          title: String(choice.title ?? choice.label ?? `Option ${optionIndex + 1}`),
          ...(typeof choice.description === "string" ? { description: choice.description } : {}),
        }];
      }),
      allowOther: Boolean(item.allowOther),
      ...(typeof item.multiSelect === "boolean" ? { multiSelect: item.multiSelect } : {}),
      freeText: options.length === 0,
    }];
  });
}
