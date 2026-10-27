import { ThinkingPanel } from "./thinking-panel";
import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * Thinking State – the "working…" panel of an AI chat, in a single self-contained file.
 * A header with a live timer, then searches with their sources and the thinking steps
 * appear one after another; at the end a check, and the header turns into "Worked for …".
 * The styles are injected below, so no extra files are needed.
 */

export type ThinkingSource = {
  label: string;
  icon?: ReactNode;
  /** Opens in a new tab */
  href?: string;
  /** Tooltip on hover – defaults to the link */
  tooltip?: string;
};

export type ThinkingStep =
  | {
      kind: "search";
      label: string;
      activeLabel?: string;
      sources: ThinkingSource[];
      /** Hidden behind a "+N more" chip until it is clicked */
      moreSources?: ThinkingSource[];
    }
  | { kind: "step"; label: string };

export type ThinkingStateProps = {
  steps: ThinkingStep[];
  /** Label of the final row */
  doneLabel?: string;
  /** Pause between two steps, in ms */
  stepMs?: number;
  /** Start over after a pause once finished – nice for previews */
  loop?: boolean;
  onDone?: (seconds: number) => void;
  /** Who is working, e.g. "Kyoshi": the header becomes their dot and name, "worked for 1s", the chevron at the end */
  who?: string;
  className?: string;
};

const START_MS = 700;

const CHIP_MS = 160;

export function ThinkingState({
  steps,
  doneLabel = "Finished thinking",
  stepMs = 1300,
  loop = false,
  onDone,
  who,
  className,
}: ThinkingStateProps) {
  const [run, setRun] = useState(0);
  const [shown, setShown] = useState(0); // how many steps are visible
  const [done, setDone] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const started = useRef(0);
  // Once someone clicks inside, a looping preview stays put instead of starting over
  const touched = useRef(false);

  // Reveal the steps one by one; a search waits until all of its sources have popped in
  useEffect(() => {
    started.current = Date.now();
    setShown(0);
    setDone(false);
    setSeconds(0);
    setOpen(true);
    setExpanded(new Set());
    const timers: number[] = [];
    let at = START_MS;
    steps.forEach((step, i) => {
      timers.push(window.setTimeout(() => setShown(i + 1), at));
      at += stepMs + (step.kind === "search" ? (step.sources.length + 1) * CHIP_MS : 0);
    });
    timers.push(
      window.setTimeout(() => {
        const s = Math.max(1, Math.round((Date.now() - started.current) / 1000));
        setSeconds(s);
        setDone(true);
        onDone?.(s);
      }, at),
    );
    if (loop) timers.push(window.setTimeout(() => !touched.current && setRun((r) => r + 1), at + 4000));
    return () => timers.forEach(clearTimeout);
  }, [run, steps, stepMs, loop]); // eslint-disable-line react-hooks/exhaustive-deps

  // Live timer while thinking
  useEffect(() => {
    if (done) return;
    const t = window.setInterval(() => setSeconds(Math.floor((Date.now() - started.current) / 1000)), 250);
    return () => clearInterval(t);
  }, [done, run]);

  const active = done ? -1 : shown - 1;

  return (
    <ThinkingPanel key={run} className={className} who={who} done={done} open={open} onOpenChange={setOpen}
      title={done ? `${who ? "worked" : "Worked"} for ${format(seconds)}` : <>
        <span className="ui-think__shimmer" data-text={who ? "is thinking" : "Thinking"}>{who ? "is thinking" : "Thinking"}</span>
        <span className="ui-think__time">{format(seconds)}</span>
      </>}>
        <ol className="ui-think__list" aria-live="polite">
          {steps.slice(0, shown).map((step, i) => {
            const isActive = i === active;
            const label = step.kind === "search" && isActive ? (step.activeLabel ?? "Searching") : step.label;
            return (
              <li key={i} className="ui-think__item" data-kind={step.kind} data-active={isActive || undefined}>
                <span className="ui-think__node" aria-hidden="true">
                  {step.kind === "search" ? (
                    <svg viewBox="0 0 24 24" className="ui-think__globe">
                      <path d="M22 12A10 10 0 1 0 12 22" />
                      <path d="M20 5.7c-.93.07-2.13.43-2.96 1.5-1.5 1.94-3 2.1-4 1.46-1.5-.97-.24-2.54-2-3.4-1.15-.56-1.31-2.07-.67-3.26" />
                      <path d="M2 11c.76.66 1.83 1.27 3.09 1.27 2.6 0 3.12.5 3.12 2.48s0 1.99.52 3.48c.34.97.46 1.94-.22 2.77" />
                      <path d="m19.9 19.93 2.1 2.07m-.89-4.95a4.05 4.05 0 1 1-8.11 0 4.05 4.05 0 0 1 8.11 0Z" />
                    </svg>
                  ) : (
                    <span className="ui-think__dot" />
                  )}
                </span>
                <div className="ui-think__content">
                  <span
                    className={isActive ? "ui-think__label ui-think__shimmer" : "ui-think__label"}
                    data-text={label}
                  >
                    {label}
                  </span>
                  {step.kind === "search" && (
                    <div className="ui-think__sources">
                      {[...step.sources, ...(expanded.has(i) ? (step.moreSources ?? []) : [])].map((source, j) => (
                        <Source
                          key={source.label + j}
                          source={source}
                          // Extra sources pop in quickly after a click, the first ones follow the search
                          delay={j < step.sources.length ? 120 + j * CHIP_MS : (j - step.sources.length) * 70}
                        />
                      ))}
                      {step.moreSources?.length ? (
                        <button
                          type="button"
                          className="ui-think__source ui-think__more"
                          aria-expanded={expanded.has(i)}
                          style={{ animationDelay: `${120 + step.sources.length * CHIP_MS}ms` }}
                          onClick={() => {
                            touched.current = true;
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(i)) next.delete(i);
                              else next.add(i);
                              return next;
                            });
                          }}
                        >
                          {expanded.has(i) ? "Show less" : `+${step.moreSources.length} more`}
                        </button>
                      ) : null}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
          {done && (
            <li className="ui-think__item" data-kind="done">
              <span className="ui-think__node" aria-hidden="true">
                <svg viewBox="0 0 24 24" className="ui-think__check">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M8 12.5l2.5 2.5L16 9" />
                </svg>
              </span>
              <div className="ui-think__content">
                <span className="ui-think__label">{doneLabel}</span>
              </div>
            </li>
          )}
        </ol>
    </ThinkingPanel>
  );
}

/** A source chip: a link when it has one, with a tooltip on hover and focus */
function Source({ source, delay }: { source: ThinkingSource; delay: number }) {
  const tip = source.tooltip ?? source.href?.replace(/^https?:\/\//, "");
  const inner = (
    <>
      {source.icon && <span className="ui-think__favicon">{source.icon}</span>}
      <span className="ui-think__source-label">{source.label}</span>
      {tip && (
        <span className="ui-think__tip" aria-hidden="true">
          {tip}
        </span>
      )}
    </>
  );
  const props = {
    className: "ui-think__source",
    "data-count": !source.icon || undefined,
    style: { animationDelay: `${delay}ms` },
  };
  return source.href ? (
    <a {...props} href={source.href} target="_blank" rel="noreferrer">
      {inner}
    </a>
  ) : (
    <span {...props}>{inner}</span>
  );
}

/** 9s, 1m 05s */
const format = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);

/* ---------- Styles ---------- */
