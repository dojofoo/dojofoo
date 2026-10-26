"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/*
 * Gradient Text – a text effect, in a single self-contained file.
 * The letters are a mask over a liquid gradient: a few soft color blobs drift over a two-color base,
 * so the word keeps flowing while the glyphs stay crisp. On first view the color can sweep across
 * the word from left to right before it settles into the flow. Font, size and weight come from the parent.
 */

export type GradientTextProps = {
  children: ReactNode;
  /** Gradient start, end and up to two blob colors: [start, end, blob, blob] */
  colors?: string[];
  /** Seconds per flow cycle */
  speed?: number;
  /** Sweep the color in from left to right when the text scrolls into view */
  sweep?: boolean;
  /** Element to render */
  as?: "span" | "h1" | "h2" | "p";
  className?: string;
};

export function GradientText({ children, colors, speed = 8, sweep = true, as: Tag = "span", className }: GradientTextProps) {
  const ref = useRef<HTMLElement>(null);
  // "idle" – plain text, waiting to be seen; "in" – the color sweeps (or simply is) in
  const [state, setState] = useState<"idle" | "in">(sweep ? "idle" : "in");

  useEffect(() => {
    if (!sweep) return setState("in");
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return setState("in");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState("in");
          io.disconnect();
        }
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [sweep]);

  const style = { "--ui-gt-speed": `${speed}s` } as Record<string, string>;
  if (colors?.length) {
    const [a, b = a, c = a, d = b] = colors;
    Object.assign(style, { "--ui-gt-c1": a, "--ui-gt-c2": b, "--ui-gt-c3": c, "--ui-gt-c4": d });
  }

  return (
    <Tag
      ref={ref as never}
      className={["ui-gt", className].filter(Boolean).join(" ")}
      data-state={state}
      data-sweep={sweep ? "" : undefined}
      style={style as CSSProperties}
    >
      {/* React 19 hoists this into <head> once, no matter how many instances render */}
      <style href="ui-gradient-text" precedence="default">
        {css}
      </style>
      {/* The real text: sets the size, carries selection and screen readers, shows until the color arrives */}
      <span className="ui-gt__base">{children}</span>
      {/* The same text again, filled with the flowing gradient */}
      <span className="ui-gt__fill" aria-hidden="true">
        {children}
      </span>
    </Tag>
  );
}

const css = /* css */ `
.ui-gt {
  --ui-gt-c1: #dd0674;
  --ui-gt-c2: #5e3ee0;
  --ui-gt-c3: #ff5fae;
  --ui-gt-c4: #7c5cff;
  --ui-gt-sweep: 1100ms;
  position: relative;
  display: inline-block;
  margin: 0;
  font: inherit;
  letter-spacing: inherit;
}
.ui-gt__base {
  color: inherit;
  transition: color 240ms ease;
}
.ui-gt__fill {
  position: absolute;
  inset: 0;
  pointer-events: none;
  user-select: none;
  color: transparent;
  -webkit-text-fill-color: transparent;
  background-image:
    radial-gradient(closest-side, var(--ui-gt-c3), transparent),
    radial-gradient(closest-side, var(--ui-gt-c4), transparent),
    radial-gradient(closest-side, var(--ui-gt-c1), transparent),
    linear-gradient(100deg, var(--ui-gt-c1) 10%, var(--ui-gt-c2) 90%);
  background-size: 70% 170%, 80% 190%, 60% 160%, 100% 100%;
  background-repeat: no-repeat;
  background-position: -20% 30%, 120% 70%, 50% -40%, 0 0;
  -webkit-background-clip: text;
  background-clip: text;
  /* A little room around the box, so overhanging glyphs are not cut by the sweep */
  clip-path: inset(-0.25em -0.25em -0.25em -0.25em);
  animation: ui-gt-flow var(--ui-gt-speed) ease-in-out infinite;
}

/* Sweep: the fill is hidden until the text is seen, then wipes in from the left */
.ui-gt[data-sweep][data-state="idle"] .ui-gt__fill {
  clip-path: inset(-0.25em 100% -0.25em -0.25em);
}
.ui-gt[data-sweep] .ui-gt__fill {
  transition: clip-path var(--ui-gt-sweep) cubic-bezier(0.65, 0, 0.25, 1);
}
.ui-gt[data-state="in"] .ui-gt__base {
  color: transparent;
}
.ui-gt[data-sweep][data-state="in"] .ui-gt__base {
  transition-delay: calc(var(--ui-gt-sweep) - 200ms);
}

/* The blobs drift on their own paths; the base gradient stays put */
@keyframes ui-gt-flow {
  0%, 100% { background-position: -20% 30%, 120% 70%, 50% -40%, 0 0; }
  25% { background-position: 40% 110%, 60% -10%, 110% 60%, 0 0; }
  50% { background-position: 120% 40%, -20% 40%, 40% 140%, 0 0; }
  75% { background-position: 60% -30%, 30% 120%, -10% 30%, 0 0; }
}

/* Reduced motion: the finished gradient, standing still */
@media (prefers-reduced-motion: reduce) {
  .ui-gt .ui-gt__fill,
  .ui-gt[data-sweep][data-state="idle"] .ui-gt__fill {
    animation: none;
    transition: none;
    clip-path: inset(-0.25em -0.25em -0.25em -0.25em);
  }
  .ui-gt .ui-gt__base,
  .ui-gt[data-sweep] .ui-gt__base {
    color: transparent;
    transition: none;
  }
}

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html> */
:where(.dark, [data-theme="dark"]) .ui-gt {
  --ui-gt-c1: #f472b6;
  --ui-gt-c2: #a78bfa;
  --ui-gt-c3: #f9a8d4;
  --ui-gt-c4: #c4b5fd;
}
`;
