import { useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Waves } from "../components/waves";

/*
 * A word drawn as a course card's face: the card's gradient in the course's color, its hues slowly fading round the
 * wheel, with the card's waves rolling over it (ColorCard's "waves"), cut to the word's letters. The face is clipped by an SVG <clipPath> holding the same
 * word in the same font, set on the real text's baseline; the real text stays under it, transparent, so the word reads,
 * selects and wraps as text.
 *
 *   <ShaderText color={courseColor(course.art)}>learning</ShaderText>
 */
export function ShaderText({ children, color, seed = 0 }: { children: string; /** The card's color, any CSS color */ color: string; seed?: number }) {
  const clip = `ui-st-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const marker = useRef<HTMLElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const [baseline, setBaseline] = useState<number | null>(null);
  // The baseline, from a zero-size marker sitting on it – again when the size changes (the title's font is fluid)
  useLayoutEffect(() => {
    const measure = () => {
      if (marker.current && word.current) setBaseline(marker.current.getBoundingClientRect().top - word.current.getBoundingClientRect().top);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (word.current) observer.observe(word.current);
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, []);
  return (
    <span ref={word} className="ui-st" style={{ "--card-color": color } as CSSProperties}>
      <style href="ui-shader-text" precedence="default">{css}</style>
      <span className="ui-st__ink">{children}<i ref={marker} aria-hidden="true" /></span>
      {baseline !== null && (
        <span className="ui-st__face" aria-hidden="true" style={{ clipPath: `url(#${clip})` }}>
          <Waves className="ui-st__lines" speed={0.6} seed={seed} />
        </span>
      )}
      <svg className="ui-st__clip" aria-hidden="true" focusable="false">
        <clipPath id={clip} clipPathUnits="userSpaceOnUse"><text x=".15em" y={baseline ?? 0} dy=".15em">{children}</text></clipPath>
      </svg>
    </span>
  );
}

const css = /* css */ `
.ui-st { position: relative; display: inline-block; }
/* The real word: it sets the size and carries selection and screen readers; the face shows through it */
.ui-st__ink { color: transparent; }
.ui-st__ink > i { display: inline-block; width: 0; height: 0; vertical-align: baseline; }
/* The card's face (color-card.tsx), clipped to the letters, its hues turning: a full turn a minute, fading through the
   wheel and back to the course's color */
@property --ui-st-turn { syntax: "<number>"; inherits: true; initial-value: 0; }
@keyframes ui-st-turn { to { --ui-st-turn: 360; } }
.ui-st__face { position: absolute; inset: -.15em; overflow: hidden; pointer-events: none; animation: ui-st-turn 60s linear infinite;
  background:
    radial-gradient(120% 90% at 0% 0%, oklch(from var(--card-color) calc(l + 0.16) c calc(h + var(--ui-st-turn)) / 0.85), transparent 60%),
    linear-gradient(140deg, oklch(from var(--card-color) l c calc(h + var(--ui-st-turn))), oklch(from var(--card-color) calc(l - 0.28) calc(c * 0.6) calc(h + 40 + var(--ui-st-turn)))); }
@media (prefers-reduced-motion: reduce) { .ui-st__face { animation: none; } }
.ui-st__lines { position: absolute; inset: 0; mix-blend-mode: screen; opacity: 0.5; }
/* The clip's text in the word's own font */
.ui-st__clip { position: absolute; width: 0; height: 0; overflow: hidden; }
.ui-st__clip text { font: inherit; letter-spacing: inherit; font-variation-settings: inherit; font-feature-settings: inherit; }
`;
