import type { ReactNode } from "react";
import { Button } from "./button";
import { LessonBrief, type LessonResource } from "./lesson-brief";

/** Controlled authored step. The host owns answers, grading and progression. */
export function InteractiveLesson({ title, lead, slideTitle, slideId, step, totalSteps, complete, question, response, explanation, answer, onAnswerChange, onAnswer, onNext, onPrevious, nextLabel = "Next", unlockedStep = step, busy, resources, children }: {
  title: string;
  lead?: string;
  slideTitle?: string;
  slideId?: string;
  step: number;
  totalSteps: number;
  complete: boolean;
  question: boolean;
  response?: { answer: string; correct: boolean } | null;
  explanation?: ReactNode;
  answer: string;
  onAnswerChange(value: string): void;
  onAnswer(): void;
  onNext(): void;
  onPrevious?: () => void;
  nextLabel?: string;
  unlockedStep?: number;
  busy?: boolean;
  resources?: LessonResource[];
  children: ReactNode;
}) {
  return <LessonBrief title={title} lead={lead} resources={resources}>
    <section key={slideId} className="mt-6 rounded-[var(--box-radius)] bg-[var(--surface-2)] p-6" aria-roledescription="slide" aria-label={slideTitle ?? title}>
      {complete ? <p>Your progress was saved. You can revisit lessons from the sidebar.</p> : <>
        {slideTitle && <h2 className="mb-4 text-lg font-semibold">{slideTitle}</h2>}
        {children}
        {question && <>
        {response && <div className="mt-6 space-y-4">
          <p role="status">{response.correct ? "Correct" : "Not quite"}: {response.answer}</p>
          {explanation}
        </div>}
        {!response?.correct && <form className="mt-6 space-y-3" onSubmit={event => { event.preventDefault(); if (answer.trim() && !busy) onAnswer(); }}>
          <label htmlFor="interactive-answer" className="block text-sm">Your answer</label>
          <input id="interactive-answer" autoComplete="off" className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]" value={answer} onChange={event => onAnswerChange(event.target.value)} disabled={busy} />
          <Button type="submit" disabled={busy || !answer.trim()}>Check answer</Button>
        </form>}
        </>}
      </>}
      <nav className="mt-6 flex flex-wrap items-center justify-between gap-3" aria-label="Slides">
        <Button variant="secondary" disabled={busy || !onPrevious || step === 0} onClick={onPrevious}>Previous</Button>
        <span className="text-sm text-[var(--muted)]">Slide {Math.min(step + 1, totalSteps)} of {totalSteps}</span>
        {!complete && <Button disabled={busy || (question && !response?.correct && step >= unlockedStep)} onClick={onNext}>{nextLabel}</Button>}
      </nav>
    </section>
  </LessonBrief>;
}
