import { useCallback, useEffect, useRef, useState } from "react";
import { useContentPreferences } from "../lib/content-preferences";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { Button } from "./button";
import { Icon } from "./app-shell";
import { ArrowLeft01Icon, ArrowRight01Icon } from "../lib/icons";

/** Embed the built deck without remounting it when its display preferences change. */
export function SlideDeck({ src, title, course, testId }: { src: string; title: string; testId?: string; course?: {
  state: { step: number; totalSteps: number; unlockedStep: number; busy: boolean; lessonIndex: number; lessons: unknown[];
    current: { id: string; type: string } | null; response: { correct: boolean } | null; slides: { id: string; title: string; locked: boolean }[]; error?: string };
  onAction(action: "answer" | "next" | "previous" | "exit", answer?: string): void;
} }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [position, setPosition] = useState({ current: 1, total: 0 });
  const { slides } = useContentPreferences();
  const reduced = useReducedMotion();
  const origin = typeof window === "undefined" ? "" : new URL(src, window.location.href).origin;
  const courseRef = useRef(course);
  courseRef.current = course;
  const controlled = Boolean(course);
  const send = useCallback(() => {
    const target = controlled ? "*" : origin;
    frame.current?.contentWindow?.postMessage({ type: "dojo:slides-settings", preferences: { ...slides, reducedMotion: slides.reducedMotion || reduced } }, target);
    if (courseRef.current) frame.current?.contentWindow?.postMessage({ type: "dojo:course-state", state: courseRef.current.state }, target);
  }, [slides, reduced, origin, controlled]);
  useEffect(send, [send, course?.state]);
  useEffect(() => {
    send();
    const ready = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== (controlled ? "null" : origin)) return;
      if (event.data?.type === "dojo:slides-ready") send();
      if (controlled && event.data?.type === "dojo:course-action" && ["answer", "next", "previous", "exit"].includes(event.data.action)) {
        if (event.data.action === "answer" && typeof event.data.answer !== "string") return;
        courseRef.current?.onAction(event.data.action, event.data.answer);
      }
      if (event.data?.type === "dojo:slides-position") {
        const { current, total } = event.data;
        if (Number.isInteger(current) && Number.isInteger(total) && current >= 1 && current <= total) setPosition({ current, total });
      }
    };
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, [send, origin, controlled]);
  useEffect(() => { setPosition({ current: 1, total: 0 }); }, [src]);
  const navigate = (direction: "previous" | "next") => frame.current?.contentWindow?.postMessage({ type: "dojo:slides-navigate", direction }, origin);
  const state = course?.state;
  const current = state ? state.step + 1 : position.current;
  const total = state?.totalSteps ?? position.total;
  const finishedLesson = state?.current?.type === "complete";
  const lastLesson = state && state.lessonIndex === state.lessons.length - 1;
  const nextLabel = finishedLesson ? lastLesson ? "Back to courses" : "Next lesson" : state?.current?.type === "question" ? "Finish lesson" : "Next";
  const nextDisabled = state ? state.busy || (state.current?.type === "question" && !state.response?.correct && state.step >= state.unlockedStep) : !total || current >= total;
  const viewport = <div className="ui-slide-deck__viewport">
    {!controlled && slides.progress && position.total > 0 && <div className="ui-slide-deck__progress" role="progressbar" aria-label="Slide completion" aria-valuemin={0} aria-valuemax={position.total} aria-valuenow={position.current} aria-valuetext={`Slide ${position.current} of ${position.total}`}>
      <span style={{ transform: `scaleX(${position.current / position.total})` }} />
    </div>}
    <iframe ref={frame} src={src} title={title} onLoad={send} className="h-full min-h-0 w-full border-0"
      sandbox={controlled ? "allow-scripts" : undefined}
      allow="fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    </div>;
  return <div className="ui-slide-deck" data-fit={slides.fit} data-testid={testId}>
    <style href="ui-slide-deck" precedence="default">{css}</style>
    {viewport}
    <nav className="ui-slide-deck__navigation" aria-label="Slide navigation">
      <Button size="sm" variant="secondary" aria-label="Previous slide" disabled={Boolean(state?.busy) || current <= 1} onClick={() => course ? course.onAction("previous") : navigate("previous")} icon={<Icon icon={ArrowLeft01Icon} size={14} />}>Previous</Button>
      <span className="ui-slide-deck__position">{slides.progress && <output aria-label="Slide progress" aria-live="polite">{total ? `${current} / ${total}` : "— / —"}</output>}</span>
      <Button size="sm" variant="secondary" aria-label={controlled ? nextLabel === "Next" ? "Next slide" : nextLabel : "Next slide"} disabled={nextDisabled} onClick={() => course ? course.onAction(finishedLesson && lastLesson ? "exit" : "next") : navigate("next")} iconRight={<Icon icon={ArrowRight01Icon} size={14} />}>{nextLabel}</Button>
    </nav>
    {state?.error && <p role="alert" className="m-3 text-sm text-(--destructive)">{state.error}</p>}
  </div>;
}
const css = `
.ui-slide-deck { display: flex; flex-direction: column; height: auto; min-height: 0; overflow: hidden; }
.ui-slide-deck__viewport { position: relative; flex: none; width: 100%; aspect-ratio: 16 / 9; min-height: 0; overflow: auto; }
.ui-slide-deck__progress { position: absolute; inset: 0 0 auto; height: 2px; z-index: 1; pointer-events: none; }
.ui-slide-deck__progress > span { display: block; height: 100%; background: var(--brand); transform-origin: left; transition: transform var(--motion-moderate) var(--ease-moderate); }
@media (prefers-reduced-motion: reduce) { .ui-slide-deck__progress > span { transition: none; } }
.ui-slide-deck__viewport > iframe { display: block; }
.ui-slide-deck__navigation { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 8px; flex: none; padding: 6px 8px; border-top: 1px solid var(--fluid-hairline); background: var(--surface-3); }
.ui-slide-deck__navigation > button:first-child { justify-self: start; }
.ui-slide-deck__navigation > button:last-child { justify-self: end; }
.ui-slide-deck__position { min-width: 52px; text-align: center; color: var(--fluid-muted); font-size: var(--fs-caption); font-variant-numeric: tabular-nums; }
`;
