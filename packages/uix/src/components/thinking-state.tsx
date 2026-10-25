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

const chevron = (
  <span className="ui-think__chevron" aria-hidden="true">
    <svg viewBox="0 0 24 24">
      <path d="M18 9s-4.419 6-6 6c-1.581 0-6-6-6-6" />
    </svg>
  </span>
);
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
    <div className={["ui-think", className].filter(Boolean).join(" ")} data-done={done || undefined} key={run}>
      {/* React 19 hoists this into <head> once, no matter how many panels render */}
      <style href="ui-thinking-state" precedence="default">
        {css}
      </style>

      <button type="button" className="ui-think__head" data-who={who ? "" : undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {who ? <span className="ui-think__avatar" aria-hidden="true" /> : chevron}
        <span className="ui-think__title" key={done ? "done" : "busy"}>
          {who && <b className="ui-think__who">{who}</b>}
          {done ? (
            `${who ? "worked" : "Worked"} for ${format(seconds)}`
          ) : (
            <>
              <span className="ui-think__shimmer" data-text={who ? "is thinking" : "Thinking"}>
                {who ? "is thinking" : "Thinking"}
              </span>
              <span className="ui-think__time">{format(seconds)}</span>
            </>
          )}
        </span>
        {who && chevron}
      </button>

      <div className="ui-think__body" data-open={open}>
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
      </div>
    </div>
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

const css = /* css */ `
/* Colors and motion as variables – override them on .ui-think (see Theming in the docs) */
.ui-think {
  --ui-tk-ink: #171717;
  --ui-tk-text: #525252;
  --ui-tk-muted: #8a8a8a;
  --ui-tk-line: #e5e5e5;
  --ui-tk-chip: #f0f0f0;
  --ui-tk-done: #2f6bff;
  --ui-tk-shine: rgba(255, 255, 255, 0.82);
  --ui-tk-dot: #b5b5b5;
  --ui-tk-chip-hover: #e6e6e6;
  --ui-tk-tip-text: #fff;
  --ui-tk-focus: rgba(23, 23, 23, 0.22);
  --ui-tk-ease: cubic-bezier(0.22, 1, 0.36, 1);

  width: 100%;
  max-width: 440px;
  font-family: var(--ui-font, "Inter Variable", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  font-size: 14px;
  line-height: 1.45;
  color: var(--ui-tk-text);
  -webkit-font-smoothing: antialiased;
}
.ui-think *,
.ui-think *::before,
.ui-think *::after {
  box-sizing: border-box;
}
.ui-think svg {
  display: block;
  width: 100%;
  height: 100%;
}

/* Header: chevron + "Thinking 4s" / "Worked for 18s" */
.ui-think__head {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 0 -4px;
  padding: 4px 8px 4px 4px;
  border: 0;
  border-radius: calc(8px * var(--squircle-factor, 1));
  background: none;
  font: inherit;
  font-size: 15px;
  color: var(--ui-tk-muted);
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;
}
.ui-think__head:hover {
  background: var(--ui-tk-chip);
  color: var(--ui-tk-text);
}
.ui-think__head:focus-visible {
  outline: 2px solid var(--ui-tk-focus);
  outline-offset: 2px;
}
.ui-think__chevron {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
  transform: rotate(-90deg);
  transition: transform 260ms var(--ui-tk-ease);
}
.ui-think__head[aria-expanded="true"] .ui-think__chevron {
  transform: none;
}
.ui-think__title {
  display: inline-flex;
  gap: 8px;
  animation: ui-think-in 420ms var(--ui-tk-ease) both;
}
.ui-think__time {
  font-variant-numeric: tabular-nums;
}
/* With who: their dot – the size of the chevron, in the theme's brand color – then the name in the sentence */
.ui-think__head[data-who] .ui-think__title { gap: 0.3em; }
.ui-think__avatar { flex: none; width: 18px; height: 18px; border-radius: 50%; corner-shape: round; background: var(--brand, var(--ui-tk-done)); }
.ui-think__who { font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ui-tk-ink); }

/* Body collapses smoothly */
.ui-think__body {
  display: grid;
  grid-template-rows: 1fr;
  transition: grid-template-rows 360ms var(--ui-tk-ease), opacity 260ms ease;
}
.ui-think__body[data-open="false"] {
  grid-template-rows: 0fr;
  opacity: 0;
}
.ui-think__body[data-open="false"] .ui-think__list {
  overflow: hidden;
}
.ui-think__list {
  min-height: 0;
  /* clips only while collapsed, so tooltips can reach out when open */
  overflow: visible;
  margin: 0;
  padding: 10px 0 0;
  list-style: none;
}

/* Timeline: icon column with a line growing down to the next node */
.ui-think__item {
  position: relative;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 12px;
  padding-bottom: 12px;
  animation: ui-think-in 520ms var(--ui-tk-ease) both;
}
.ui-think__item:not(:last-child)::before {
  content: "";
  position: absolute;
  left: 9.5px;
  top: 24px;
  bottom: 2px;
  width: 1px;
  background: var(--ui-tk-line);
  transform-origin: top;
  animation: ui-think-line 520ms var(--ui-tk-ease) both;
}
.ui-think__node {
  display: grid;
  place-items: center;
  width: 20px;
  height: 21px;
}
.ui-think__globe {
  width: 18px !important;
  height: 18px !important;
  fill: none;
  stroke: var(--ui-tk-muted);
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.ui-think__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%; corner-shape: round;
  background: var(--ui-tk-dot);
  transition: background-color 300ms ease, transform 300ms ease;
}
.ui-think__item[data-active] .ui-think__dot {
  background: var(--ui-tk-ink);
  animation: ui-think-pulse 1.2s ease-in-out infinite;
}
.ui-think__check {
  width: 18px !important;
  height: 18px !important;
  animation: ui-think-pop 460ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
.ui-think__check circle {
  fill: var(--ui-tk-done);
}
.ui-think__check path {
  fill: none;
  stroke: #fff;
  stroke-width: 2.2;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 14;
  stroke-dashoffset: 14;
  animation: ui-think-draw 360ms var(--ui-tk-ease) 180ms forwards;
}

.ui-think__content {
  min-width: 0;
  padding-top: 0.5px;
}
.ui-think__label {
  display: inline-block;
  color: var(--ui-tk-muted);
  transition: color 300ms ease;
}
.ui-think__item[data-active] .ui-think__label,
.ui-think__item[data-kind="done"] .ui-think__label {
  color: var(--ui-tk-text);
}

/* Sources: chips pop in one after another */
.ui-think__sources {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}
.ui-think__source {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 28px;
  padding: 0 10px 0 6px;
  border-radius: calc(8px * var(--squircle-factor, 1));
  background: var(--ui-tk-chip);
  font-size: 13px;
  color: var(--ui-tk-ink);
  animation: ui-think-chip 420ms var(--ui-tk-ease) both;
}
a.ui-think__source,
.ui-think__more {
  position: relative;
  border: 0;
  font: inherit;
  font-size: 13px;
  text-decoration: none;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;
}
a.ui-think__source:hover {
  background: var(--ui-tk-chip-hover);
}
.ui-think__more {
  padding: 0 10px;
  background: none;
  color: var(--ui-tk-muted);
}
.ui-think__more:hover {
  background: var(--ui-tk-chip);
  color: var(--ui-tk-ink);
}
a.ui-think__source:focus-visible,
.ui-think__more:focus-visible {
  outline: 2px solid var(--ui-tk-focus);
  outline-offset: 2px;
}

/* Tooltip above the chip */
.ui-think__tip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  z-index: 2;
  padding: 4px 8px;
  border-radius: calc(6px * var(--squircle-factor, 1));
  background: var(--ui-tk-ink);
  color: var(--ui-tk-tip-text);
  font-size: 12px;
  line-height: 1.3;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transform: translate(-50%, 4px);
  transition: opacity 140ms ease, transform 200ms var(--ui-tk-ease);
}
.ui-think__source:hover .ui-think__tip,
.ui-think__source:focus-visible .ui-think__tip {
  opacity: 1;
  transform: translate(-50%, 0);
  transition-delay: 250ms;
}

.ui-think__source[data-count] {
  padding: 0 10px;
  background: none;
  color: var(--ui-tk-muted);
}
.ui-think__source-label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ui-think__favicon {
  display: grid;
  place-items: center;
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: calc(5px * var(--squircle-factor, 1));
  overflow: hidden;
}

/* Shimmer over the active label, like the loading states elsewhere */
.ui-think__shimmer {
  position: relative;
}
.ui-think__shimmer::after {
  content: attr(data-text);
  content: attr(data-text) / "";
  position: absolute;
  inset: 0;
  white-space: nowrap;
  color: transparent;
  background: linear-gradient(90deg, transparent 38%, var(--ui-tk-shine) 50%, transparent 62%) 100% 0 / 300% 100%
    no-repeat;
  -webkit-background-clip: text;
  background-clip: text;
  animation: ui-think-sweep 1.6s linear infinite;
  pointer-events: none;
}

@keyframes ui-think-in {
  from { opacity: 0; transform: translateY(6px); filter: blur(3px); }
  to { opacity: 1; transform: none; filter: none; }
}
@keyframes ui-think-line {
  from { transform: scaleY(0); }
  to { transform: scaleY(1); }
}
@keyframes ui-think-chip {
  from { opacity: 0; transform: translateY(4px) scale(0.92); }
  to { opacity: 1; transform: none; }
}
@keyframes ui-think-pulse {
  50% { transform: scale(0.7); opacity: 0.5; }
}
@keyframes ui-think-pop {
  0% { transform: scale(0.5); }
  60% { transform: scale(1.12); }
  100% { transform: scale(1); }
}
@keyframes ui-think-draw {
  to { stroke-dashoffset: 0; }
}
@keyframes ui-think-sweep {
  from { background-position: 100% 0; }
  to { background-position: 0% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .ui-think *,
  .ui-think *::before,
  .ui-think *::after {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
  .ui-think__shimmer::after {
    display: none;
  }
  .ui-think__check path {
    stroke-dashoffset: 0;
  }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-think {
  --ui-tk-ink: #ededed;
  --ui-tk-text: #c4c4c4;
  --ui-tk-muted: #8f8f8f;
  --ui-tk-line: rgba(255, 255, 255, 0.1);
  --ui-tk-chip: #2a2a2d;
  --ui-tk-chip-hover: #313135;
  --ui-tk-shine: rgba(255, 255, 255, 0.95);
  --ui-tk-dot: #5c5c61;
  --ui-tk-tip-text: #121213;
  --ui-tk-focus: rgba(255, 255, 255, 0.3);
}
`;
