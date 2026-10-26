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
            <stop offset="0%" stopColor="var(--brand, #ef234c)" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#fb923c" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0.3" />
          </linearGradient>
          <linearGradient id={`${id}-blob-v`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="var(--brand, #ef234c)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#fb923c" stopOpacity="0.3" />
          </linearGradient>
          <filter id={`${id}-blur`} x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="12" />
          </filter>
          <linearGradient id={`${id}-stroke`} x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="40%" stopColor="#fb923c" />
            <stop offset="75%" stopColor="var(--brand, #ef234c)" />
            <stop offset="100%" stopColor="var(--brand, #ef234c)" />
          </linearGradient>
        </defs>

        {/* Each window: glow → frame → content; the next window covers any overflow */}
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
              {/* Outer gray frame, reaching well past the edges */}
              <rect className="ui-to-frame" width="380" height="300" rx="6" fill="#F4F5F7" stroke="#E4E7EC" strokeWidth="0.7" />
              <circle className="ui-to-dot" cx="14" cy="14" r="3" fill="#CCCCCC" />
              <circle className="ui-to-dot" cx="24" cy="14" r="3" fill="#CCCCCC" />
              <circle className="ui-to-dot" cx="34" cy="14" r="3" fill="#CCCCCC" />
              <rect className="ui-to-page" x="4" y="24" width="372" height="272" rx="5" fill="#FFFFFF" stroke="#E4E7EC" strokeWidth="0.7" />
              {titles && <text className="ui-to-title" x="46" y="16.6">{titles[n - 1]}</text>}
              {onActiveChange && <rect className="ui-to-hit" width={n === 3 ? 140 : 95} height="24" rx="4" fill="transparent"
                role="button" tabIndex={0} aria-label={`${titles?.[n - 1] ?? `Window ${n}`} Mode`} aria-pressed={active === n}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onActiveChange(n); } }} />}
            </g>
            <g className={`ui-to-content ui-to-content-${n}`} transform={`translate(${x} ${y})`}>
              <rect className="ui-to-bar" x="12" y="36" width="30" height="30" rx="4" fill="#EFF1F4" />
              <rect className="ui-to-bar" x="52" y="38" width="100" height="6" rx="2" fill="#EFF1F4" />
              <rect className="ui-to-bar" x="52" y="46" width="100" height="6" rx="2" fill="#EFF1F4" />
              <rect className="ui-to-bar" x="52" y="54" width="35" height="6" rx="2" fill="#EFF1F4" />
              <rect className="ui-to-bar" x="12" y="72" width="140" height="6" rx="2" fill="#EFF1F4" />
              <rect className="ui-to-bar" x="12" y="80" width="140" height="6" rx="2" fill="#EFF1F4" />
              <rect className="ui-to-bar" x="12" y="88" width="55" height="6" rx="2" fill="#EFF1F4" />
            </g>
          </g>
        ))}

        {/* Active-window decoration (colored dots + outline), shown on one window at a time */}
        {windows.map(({ n, x, y }) => (
          <g key={n} className={`ui-to-front ui-to-front-${n}`}>
            <circle cx={x + 14} cy={y + 14} r="3" fill="var(--brand, #ef234c)" />
            <circle cx={x + 24} cy={y + 14} r="3" fill="#fb923c" />
            <circle cx={x + 34} cy={y + 14} r="3" fill="#2dd4bf" />
            <path
              d={`M ${x} 240 L ${x} ${y + 6} A 6 6 0 0 1 ${x + 6} ${y} L ${n === 3 ? 360 : x + 95} ${y}`}
              fill="none"
              stroke={`url(#${id}-stroke)`}
              strokeWidth="0.8"
            />
          </g>
        ))}
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
.ui-to-hit:focus-visible { outline: 2px solid var(--brand); outline-offset: -3px; }

/* Placeholder blocks shimmer softly */
.ui-to-bar { animation: ui-to-shimmer 2.4s ease-in-out infinite; }
@keyframes ui-to-shimmer {
  0%, 100% { fill: #EFF1F4; }
  50% { fill: #DDE1E5; }
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
.ui-to-title { font: 600 8px/1 var(--font-sans, system-ui, sans-serif); fill: #8A8F98; pointer-events: none; }
.ui-to-art[data-active="1"] .ui-to-tab-1 .ui-to-title,
.ui-to-art[data-active="2"] .ui-to-tab-2 .ui-to-title,
.ui-to-art[data-active="3"] .ui-to-tab-3 .ui-to-title { fill: #3A3F47; }
:where(.dark, [data-theme="dark"]) .ui-to-title { fill: #6E727A; }
:where(.dark, [data-theme="dark"]) .ui-to-art[data-active] .ui-to-tab:is(.ui-to-tab-1, .ui-to-tab-2, .ui-to-tab-3) .ui-to-title { fill: #6E727A; }
:where(.dark, [data-theme="dark"]) .ui-to-art[data-active="1"] .ui-to-tab-1 .ui-to-title,
:where(.dark, [data-theme="dark"]) .ui-to-art[data-active="2"] .ui-to-tab-2 .ui-to-title,
:where(.dark, [data-theme="dark"]) .ui-to-art[data-active="3"] .ui-to-tab-3 .ui-to-title { fill: #D4D6DA; }

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
  .ui-to-blobs, .ui-to-front, .ui-to-content { transition: none; }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-to-frame { fill: #1b1b1d; stroke: rgba(255, 255, 255, 0.1); }
:where(.dark, [data-theme="dark"]) .ui-to-dot { fill: #3a3a3f; }
:where(.dark, [data-theme="dark"]) .ui-to-page { fill: #232326; stroke: rgba(255, 255, 255, 0.08); }
:where(.dark, [data-theme="dark"]) .ui-to-bar { fill: #2e2e32; }
@media (prefers-reduced-motion: no-preference) {
  :where(.dark, [data-theme="dark"]) .ui-to-bar { animation-name: ui-to-shimmer-dark; }
}
@keyframes ui-to-shimmer-dark {
  0%, 100% { fill: #2e2e32; }
  50% { fill: #3a3a3f; }
}
`;
