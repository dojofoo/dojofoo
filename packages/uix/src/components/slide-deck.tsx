import { useCallback, useEffect, useRef, useState } from "react";
import { useContentPreferences } from "~/lib/content-preferences";
import { useReducedMotion } from "~/hooks/use-reduced-motion";
import { Button } from "./button";
import { Icon } from "./app-shell";
import { ArrowLeft01Icon, ArrowRight01Icon } from "~/lib/icons";

/** Embed the built deck without remounting it when its display preferences change. */
export function SlideDeck({ src, title }: { src: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [position, setPosition] = useState({ current: 1, total: 0 });
  const { slides } = useContentPreferences();
  const reduced = useReducedMotion();
  const origin = typeof window === "undefined" ? "" : new URL(src, window.location.href).origin;
  const send = useCallback(() => frame.current?.contentWindow?.postMessage({ type: "dojo:slides-settings", preferences: { ...slides, reducedMotion: slides.reducedMotion || reduced } }, origin), [slides, reduced, origin]);
  useEffect(() => {
    send();
    const ready = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin) return;
      if (event.data?.type === "dojo:slides-ready") send();
      if (event.data?.type === "dojo:slides-position") {
        const { current, total } = event.data;
        if (Number.isInteger(current) && Number.isInteger(total) && current >= 1 && current <= total) setPosition({ current, total });
      }
    };
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, [send, origin]);
  useEffect(() => { setPosition({ current: 1, total: 0 }); }, [src]);
  const navigate = (direction: "previous" | "next") => frame.current?.contentWindow?.postMessage({ type: "dojo:slides-navigate", direction }, origin);
  return <div className="ui-slide-deck" data-fit={slides.fit}>
    <style href="ui-slide-deck" precedence="default">{css}</style>
    <div className="ui-slide-deck__viewport">
    {slides.progress && position.total > 0 && <div className="ui-slide-deck__progress" role="progressbar" aria-label="Slide completion" aria-valuemin={0} aria-valuemax={position.total} aria-valuenow={position.current} aria-valuetext={`Slide ${position.current} of ${position.total}`}>
      <span style={{ transform: `scaleX(${position.current / position.total})` }} />
    </div>}
    <iframe ref={frame} src={src} title={title} onLoad={send} className="h-full min-h-0 w-full border-0"
      allow="fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    </div>
    <nav className="ui-slide-deck__navigation" aria-label="Slide navigation">
      <Button size="sm" variant="secondary" aria-label="Previous slide" disabled={position.current <= 1} onClick={() => navigate("previous")} icon={<Icon icon={ArrowLeft01Icon} size={14} />}>Previous</Button>
      <span className="ui-slide-deck__position">{slides.progress && <output aria-label="Slide progress" aria-live="polite">{position.total ? `${position.current} / ${position.total}` : "— / —"}</output>}</span>
      <Button size="sm" variant="secondary" aria-label="Next slide" disabled={!position.total || position.current >= position.total} onClick={() => navigate("next")} iconRight={<Icon icon={ArrowRight01Icon} size={14} />}>Next</Button>
    </nav>
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
