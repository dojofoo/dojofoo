import type { ToolCallPart } from "@tanstack/ai-client";
import { eveQuestion } from "@dojofoo/authoring/eve/messages";
import { useState, type CSSProperties } from "react";
import {
  AskUserQuestions,
  type AskUserAnswer,
  type AskUserQuestion,
} from "@dojofoo/ui/ask-user-questions";

export function isAgentQuestion(part: ToolCallPart): boolean {
  return Boolean(eveQuestion(part)) || Boolean(nativeQuestion(part)) || (isQuestionTool(part) && parseAgentQuestions(part.input).length > 0);
}

export function agentQuestionState(part: ToolCallPart): {
  questions: AskUserQuestion[];
  answers?: Record<string, AskUserAnswer>;
  disabled?: boolean;
  failure?: string;
} {
  const question = eveQuestion(part);
  if (!question) {
    const native = nativeQuestion(part);
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
    return { questions, ...(answers ? { answers } : {}), ...(part.state === "complete" ? { disabled: true } : {}) };
  }
  const { request, response, settled, error: failure } = question;
  return {
    questions: [{
      id: request.requestId,
      title: request.prompt,
      options: request.options?.map(option => ({ id: option.id, title: option.label, description: option.description })),
      allowOther: request.allowFreeform ?? false,
      freeText: request.display === "text" || !request.options?.length,
    }],
    answers: response ? { [request.requestId]: {
      questionId: request.requestId,
      selectedIds: response.optionId ? [response.optionId] : [],
      otherText: response.text,
    } } : undefined,
    disabled: settled,
    failure,
  };
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

/** Native result metadata keeps the same identity as its live question event. */
export function agentQuestionId(part: ToolCallPart): string { return nativeQuestion(part)?.requestId ?? part.id; }

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
      freeText: options.length === 0,
    }];
  });
}
