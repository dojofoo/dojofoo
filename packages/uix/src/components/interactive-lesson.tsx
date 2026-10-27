import type { ReactNode } from "react";
import { Button } from "./button";
import { LessonBrief, type LessonResource } from "./lesson-brief";

/** Controlled authored step. The host owns answers, grading and progression. */
export function InteractiveLesson({ title, step, totalSteps, complete, question, response, explanation, answer, onAnswerChange, onAnswer, onContinue, busy, resources, children }: {
  title: string;
  step: number;
  totalSteps: number;
  complete: boolean;
  question: boolean;
  response?: { answer: string; correct: boolean } | null;
  explanation?: ReactNode;
  answer: string;
  onAnswerChange(value: string): void;
  onAnswer(): void;
  onContinue(): void;
  busy?: boolean;
  resources?: LessonResource[];
  children: ReactNode;
}) {
  return <>
    <p className="mb-5 text-xs text-[var(--muted)]">Step {Math.min(step + 1, totalSteps)} of {totalSteps}</p>
    <LessonBrief title={title} resources={resources}>
      {complete ? <p>Your progress was saved. You can keep asking Sensei or return to Courses.</p> : <>
        {children}
        {question && (response ? <div className="mt-6 space-y-4">
          <p role="status">{response.correct ? "Correct" : "Not quite"}: {response.answer}</p>
          {explanation}
        </div> : <form className="mt-6 space-y-3" onSubmit={event => { event.preventDefault(); if (answer.trim() && !busy) onAnswer(); }}>
          <label htmlFor="interactive-answer" className="block text-sm">Your answer</label>
          <input id="interactive-answer" autoComplete="off" className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]" value={answer} onChange={event => onAnswerChange(event.target.value)} disabled={busy} />
          <Button type="submit" disabled={busy || !answer.trim()}>Check answer</Button>
        </form>)}
        {(!question || response) && <div className="mt-6"><Button disabled={busy} onClick={onContinue}>Continue</Button></div>}
      </>}
    </LessonBrief>
  </>;
}
