"use client";

import { useId } from "react";

/*
 * Tab Overload – a small card illustration, in a single self-contained file.
 * Three overlapping browser windows; the front one is active with colored dots, an outline and a glow.
 * Hover a window behind it and the highlight moves over to that one.
 * The artwork is drawn on a 360 × 240 viewBox and fades out towards the right and bottom edge.
 *
 * dojofoo: each window may carry a title in its bar (`titles`), and the active window may be set from outside
 * (`active`, 1–3, left to right) – clicking a window then reports it (`onActiveChange`) instead of lighting it itself.
 * Inside, each window is the dojofoo app loading: the page, its sidebar list, the main content box and cards, at the
 * app's proportions and in the theme's surfaces, with squircle corners like the app's (`corner-shape: squircle`).
 */

export type TabOverloadProps = {
  className?: string;
  /** Accessible description of the scene */
  label?: string;
  /** A title in each window's bar, left to right */
  titles?: readonly [string, string, string];
  /** The window that's lit, left to right; unset: the front one, and the hovered one */
  active?: 1 | 2 | 3;
  /** A window was selected by click or keyboard. */
  onActiveChange?: (window: 1 | 2 | 3) => void;
};

/** Offsets of the three windows (top-left corner of each frame) */
const windows = [
  { n: 1, x: 30, y: 68 },
  { n: 2, x: 125, y: 56 },
  { n: 3, x: 220, y: 44 },
] as const;

/** The CSS squircle's radius factor (styles/corners.css): a squircle corner reaches this much further than a round one */
const SQUIRCLE = 1.8409;

/**
 * A rectangle with squircle corners, as a path: each corner one cubic through the superellipse's (n = 4) 45° point.
 * `r` is the radius the app writes (`calc(r * var(--squircle-factor))`), so the corners match its boxes.
 */
function squircle(x: number, y: number, w: number, h: number, r: number) {
  const e = Math.min(r * SQUIRCLE, w / 2, h / 2);
  const k = e * 0.091;
  const right = x + w, bottom = y + h;
  return `M ${x} ${y + e} C ${x} ${y + k} ${x + k} ${y} ${x + e} ${y} L ${right - e} ${y} C ${right - k} ${y} ${right} ${y + k} ${right} ${y + e}`
    + ` L ${right} ${bottom - e} C ${right} ${bottom - k} ${right - k} ${bottom} ${right - e} ${bottom} L ${x + e} ${bottom}`
    + ` C ${x + k} ${bottom} ${x} ${bottom - k} ${x} ${bottom - e} Z`;
}

type Box = readonly [x: number, y: number, w: number, h: number];

/** A window's app: its surfaces (always shown) and its skeleton (dimmed behind the active window), in window units */
type Scene = { lit: Box; cards: Box[]; bars: Box[] };

/** The sidebar's head (logo, search, collapse) and the main box, the same in every mode */
const head: Box[] = [[9, 31, 18, 4.5], [50, 31.25, 4, 4], [57, 31.25, 4, 4]];

/** A sidebar row: its icon (or lesson marker) and its label */
const row = (y: number, width: number, indent = 0): Box[] => [[10 + indent, y + 2.5, 4, 4], [17 + indent, y + 3, width, 3]];

/** Lines of text, left-aligned at `x` */
const lines = (x: number, y: number, widths: number[], step = 6): Box[] => widths.map((w, i) => [x, y + i * step, w, 3]);

const scenes: Record<1 | 2 | 3, Scene> = {
  // Interview: the challenge's sections in the sidebar; the brief above its code
  1: {
    lit: [6, 49, 56, 9],
    cards: [[76, 70, 200, 72]],
    bars: [
      ...head, [9, 44, 16, 2.5], ...row(49, 24), ...row(58, 30), ...row(67, 20), [9, 82, 20, 2.5], ...row(87, 28), ...row(96, 18),
      [76, 38, 16, 2.5], [76, 44, 62, 5], ...lines(76, 54, [120, 92]),
      ...lines(83, 77, [36, 58, 50, 30, 44, 24, 40, 34], 7.5).map(([x, y, w, h], i) => [x + [0, 6, 6, 12, 12, 6, 0, 0][i], y, w, h] as Box),
    ],
  },
  // Course: the course card above its lessons; the lesson and its materials as cards
  2: {
    lit: [6, 87, 56, 9],
    cards: [[6, 41, 56, 33], [76, 76, 96, 44], [178, 76, 96, 44]],
    bars: [
      ...head, [10, 45.5, 12, 2.5], [10, 56, 34, 4], [10, 66.5, 22, 2.5],
      ...row(78, 26), ...row(87, 34), ...row(96, 22), ...row(105, 30), ...row(114, 18),
      [76, 38, 20, 2.5], [76, 44, 74, 5], ...lines(76, 54, [128, 104, 60]),
      [82, 82, 18, 2.5], ...lines(82, 92, [70, 52]), [82, 110, 26, 2.5],
      [184, 82, 18, 2.5], ...lines(184, 92, [64, 46]), [184, 110, 26, 2.5],
    ],
  },
  // Authoring: the course's files; a file open in the editor, its preview card below
  3: {
    lit: [6, 58, 56, 9],
    cards: [[76, 48, 220, 74], [76, 128, 108, 46]],
    bars: [
      ...head, [9, 44, 14, 2.5], ...row(49, 22), ...row(58, 30, 5), ...row(67, 24, 5), ...row(76, 20, 5), ...row(85, 26), ...row(94, 18),
      [76, 36, 26, 5], [106, 36, 22, 5],
      ...lines(83, 55, [44, 70, 58, 36, 64, 48, 30, 52], 8).map(([x, y, w, h], i) => [x + [0, 6, 12, 12, 6, 12, 6, 0][i], y, w, h] as Box),
      [82, 134, 22, 2.5], ...lines(82, 144, [84, 66]), [82, 162, 30, 2.5],
    ],
  },
};

export function TabOverload({
  className,
  label = "Three overlapping browser windows full of placeholder content",
  titles,
  active,
  onActiveChange,
}: TabOverloadProps) {
  const id = "ui-to" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

  return (
    <div className={["ui-to", className].filter(Boolean).join(" ")} role={onActiveChange ? "group" : "img"} aria-label={label}>
      {/* React 19 hoists this into <head> once, no matter how many instances render */}
      <style href="ui-tab-overload" precedence="default">
        {css}
      </style>
      <svg className="ui-to-art" viewBox="-40 0 400 240" preserveAspectRatio="none" aria-hidden={onActiveChange ? undefined : true} data-active={active}>
        <defs>
          <linearGradient id={`${id}-blob-h`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" className="ui-to-hue-1" stopOpacity="0.3" />
            <stop offset="50%" className="ui-to-hue-2" stopOpacity="0.3" />
            <stop offset="100%" className="ui-to-hue-3" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id={`${id}-blob-v`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" className="ui-to-hue-1" stopOpacity="0.3" />
            <stop offset="100%" className="ui-to-hue-2" stopOpacity="0.3" />
          </linearGradient>
          <filter id={`${id}-blur`} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
          <linearGradient id={`${id}-stroke`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" className="ui-to-hue-3" />
            <stop offset="40%" className="ui-to-hue-2" />
            <stop offset="75%" className="ui-to-hue-1" />
            <stop offset="100%" className="ui-to-hue-1" />
          </linearGradient>
        </defs>

        {/* Each window: glow → frame and surfaces → skeleton; the next window covers any overflow */}
        {windows.map(({ n, x, y }) => (
          <g key={n}>
            <g className={`ui-to-blobs ui-to-blobs-${n}`}>
              <ellipse
                cx={x + 70}
                cy={y + 8}
                rx="90"
                ry="14"
                fill={`url(#${id}-blob-h)`}
                filter={`url(#${id}-blur)`}
              />
              <ellipse
                cx={x + 8}
                cy={y + 96}
                rx="14"
                ry="90"
                fill={`url(#${id}-blob-v)`}
                filter={`url(#${id}-blur)`}
              />
            </g>
            <g className={`ui-to-tab ui-to-tab-${n}`} transform={`translate(${x} ${y})`} onClick={() => onActiveChange?.(n)}>
              {/* The window, reaching well past the edges; inside it the app's page, sidebar and main box */}
              <path className="ui-to-frame" d={squircle(0, 0, 380, 300, 6)} />
              <circle className="ui-to-dot" cx="14" cy="14" r="3" />
              <circle className="ui-to-dot" cx="24" cy="14" r="3" />
              <circle className="ui-to-dot" cx="34" cy="14" r="3" />
              <path className="ui-to-page" d={squircle(3, 24, 374, 273, 5)} />
              <path className="ui-to-panel" d={squircle(66, 26, 309, 269, 4)} />
              <path className="ui-to-lit" d={squircle(...scenes[n].lit, 2.5)} />
              {scenes[n].cards.map((card, i) => <path key={i} className="ui-to-card" d={squircle(...card, 3)} />)}
              {titles && <text className="ui-to-title" x="46" y="16.6">{titles[n - 1]}</text>}
              {onActiveChange && <rect className="ui-to-hit" width={n === 3 ? 140 : 95} height="24" rx="4" fill="transparent"
                role="button" tabIndex={0} aria-label={`${titles?.[n - 1] ?? `Window ${n}`} Mode`} aria-pressed={active === n}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActiveChange(n); } }} />}
            </g>
            <g className={`ui-to-content ui-to-content-${n}`} transform={`translate(${x} ${y})`}>
              {scenes[n].bars.map(([bx, by, w, h], i) => <rect key={i} className="ui-to-bar" x={bx} y={by} width={w} height={h} rx={Math.min(h / 2, 1.5)} />)}
            </g>
          </g>
        ))}

        {/* Active-window decoration (colored dots + outline), shown on one window at a time */}
        {windows.map(({ n, x, y }) => {
          const e = 6 * SQUIRCLE, k = e * 0.091;
          return (
            <g key={n} className={`ui-to-front ui-to-front-${n}`}>
              <circle className="ui-to-hue-1" cx={x + 14} cy={y + 14} r="3" />
              <circle className="ui-to-hue-2" cx={x + 24} cy={y + 14} r="3" />
              <circle className="ui-to-hue-3" cx={x + 34} cy={y + 14} r="3" />
              <path
                d={`M ${x} 240 L ${x} ${y + e} C ${x} ${y + k} ${x + k} ${y} ${x + e} ${y} L ${n === 3 ? 360 : x + 95} ${y}`}
                fill="none"
                stroke={`url(#${id}-stroke)`}
                strokeWidth="0.8"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
.ui-to {
  position: relative;
  width: 100%;
  aspect-ratio: 3 / 2;
  overflow: visible;
  /* The theme's colors: dojofoo red, then the course cards' orange and teal */
  --to-hue-1: var(--brand, #ef234c);
  --to-hue-2: oklch(0.74 0.16 55);
  --to-hue-3: oklch(0.74 0.13 175);
  /* Skeleton blocks: the app's loading tint (WorkspaceSkeleton), and the step it shimmers to */
  --to-skeleton: color-mix(in oklch, var(--fluid-foreground, #111113) 8%, transparent);
  --to-skeleton-hi: color-mix(in oklch, var(--fluid-foreground, #111113) 14%, transparent);
  /* Fade out towards the right and bottom edge */
  -webkit-mask-image:
    linear-gradient(to right, #000 70%, transparent 100%),
    linear-gradient(to bottom, #000 70%, transparent 100%);
  -webkit-mask-composite: source-in;
  mask-image:
    linear-gradient(to right, #000 70%, transparent 100%),
    linear-gradient(to bottom, #000 70%, transparent 100%);
  mask-composite: intersect;
  /* Let the blurred halo extend left while keeping the right and bottom fades. */
  mask-size: 112% 100%;
  mask-position: right top;
  mask-repeat: no-repeat;
  mask-clip: no-clip;
}
.ui-to-art {
  position: absolute;
  inset: 0;
  display: block;
  /* Extend only the SVG's left viewport; keep the windows at their original size and position. */
  left: calc(-100% * 40 / 360);
  width: calc(100% * 400 / 360);
  height: 100%;
  overflow: hidden;
}
.ui-to-tab:has(.ui-to-hit) { cursor: pointer; }
/* A pointer click selects the window without a ring; the keyboard still shows where focus is */
.ui-to-hit:focus { outline: none; }
.ui-to-hit:focus-visible { outline: 2px solid var(--brand); outline-offset: -3px; }

.ui-to-hue-1 { fill: var(--to-hue-1); stop-color: var(--to-hue-1); }
.ui-to-hue-2 { fill: var(--to-hue-2); stop-color: var(--to-hue-2); }
.ui-to-hue-3 { fill: var(--to-hue-3); stop-color: var(--to-hue-3); }

/* The app's surfaces: the window around it, its page, the main box (panel) and cards, with hairlines */
.ui-to-frame { fill: var(--surface-2, #f4f5f7); stroke: var(--fluid-hairline, #e4e7ec); stroke-width: 0.7; }
.ui-to-page { fill: var(--surface-1, #eef0f3); }
.ui-to-panel { fill: var(--surface-2, #fbfbfc); stroke: var(--fluid-hairline, #e4e7ec); stroke-width: 0.6; }
.ui-to-card { fill: var(--surface-3, #ffffff); stroke: var(--fluid-hairline, #e4e7ec); stroke-width: 0.6; }
.ui-to-lit { fill: var(--fluid-active, rgba(0, 0, 0, 0.05)); }
.ui-to-dot { fill: var(--to-skeleton-hi); }

/* Placeholder blocks shimmer softly */
.ui-to-bar { fill: var(--to-skeleton); animation: ui-to-shimmer 2.4s ease-in-out infinite; }
@keyframes ui-to-shimmer {
  0%, 100% { fill: var(--to-skeleton); }
  50% { fill: var(--to-skeleton-hi); }
}

/* The highlight follows the hovered window; the front window is active by default */
.ui-to-blobs,
.ui-to-front {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.ui-to-content {
  opacity: 0.2;
  pointer-events: none;
  transition: opacity 0.3s ease;
}
.ui-to-art:not([data-active]) :is(.ui-to-blobs-3, .ui-to-front-3, .ui-to-content-3) { opacity: 1; }

/* Set from outside: the active window lit, the others behind */
.ui-to-art[data-active="1"] :is(.ui-to-blobs-1, .ui-to-front-1, .ui-to-content-1),
.ui-to-art[data-active="2"] :is(.ui-to-blobs-2, .ui-to-front-2, .ui-to-content-2),
.ui-to-art[data-active="3"] :is(.ui-to-blobs-3, .ui-to-front-3, .ui-to-content-3) { opacity: 1; }
.ui-to-title { font: 600 8px/1 var(--font-sans, system-ui, sans-serif); fill: var(--fluid-muted, #8a8f98); pointer-events: none; transition: fill 0.3s ease; }
.ui-to-art[data-active="1"] .ui-to-tab-1 .ui-to-title,
.ui-to-art[data-active="2"] .ui-to-tab-2 .ui-to-title,
.ui-to-art[data-active="3"] .ui-to-tab-3 .ui-to-title { fill: var(--fluid-foreground, #3a3f47); }

.ui-to-art:not([data-active]):has(.ui-to-tab-1:hover) .ui-to-blobs-1,
.ui-to-art:not([data-active]):has(.ui-to-tab-1:hover) .ui-to-front-1,
.ui-to-art:not([data-active]):has(.ui-to-tab-1:hover) .ui-to-content-1,
.ui-to-art:not([data-active]):has(.ui-to-tab-2:hover) .ui-to-blobs-2,
.ui-to-art:not([data-active]):has(.ui-to-tab-2:hover) .ui-to-front-2,
.ui-to-art:not([data-active]):has(.ui-to-tab-2:hover) .ui-to-content-2 { opacity: 1; }

.ui-to-art:not([data-active]):has(.ui-to-tab-1:hover, .ui-to-tab-2:hover) .ui-to-blobs-3,
.ui-to-art:not([data-active]):has(.ui-to-tab-1:hover, .ui-to-tab-2:hover) .ui-to-front-3 { opacity: 0; }
.ui-to-art:not([data-active]):has(.ui-to-tab-1:hover, .ui-to-tab-2:hover) .ui-to-content-3 { opacity: 0.2; }

@media (prefers-reduced-motion: reduce) {
  .ui-to-bar { animation: none; }
  .ui-to-blobs, .ui-to-front, .ui-to-content, .ui-to-title { transition: none; }
}
`;
