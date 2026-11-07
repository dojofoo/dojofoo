import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import panelCss from "../components/arc/resizable-panels/resizable-panels.module.css?inline";
import { Topography } from "../components/topography";

/** The prerendered learner illustration only enhances its card's shader; the mock application stays HTML. */
export function LearningIllustration({ html, seed }: { html: string; seed: number }) {
  const root = useRef<HTMLDivElement>(null);
  const [surface, setSurface] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const canvas = root.current?.querySelector<HTMLCanvasElement>(".lj-course canvas.ui-card__lines");
    if (!canvas) return;
    const host = document.createElement("div");
    host.className = canvas.className;
    canvas.replaceWith(host);
    setSurface(host);
    const shell = root.current?.querySelector<HTMLElement>(".ui-as-app");
    // The static composition keeps the shell's existing narrow CSS without hydrating its controls.
    const observer = new ResizeObserver(([entry]) => shell?.toggleAttribute("data-narrow", entry.contentRect.width <= 900));
    if (shell) observer.observe(shell);
    return () => { observer.disconnect(); host.replaceWith(canvas); };
  }, [html]);
  return <>
    <style href="ui-learning-panels" precedence="default">{panelCss}</style>
    <div ref={root} className="h-full" dangerouslySetInnerHTML={{ __html: html }} />
    {surface && createPortal(<Topography color="#ffffff" interactive={false} speed={0.6} density={0.9} seed={seed} />, surface)}
  </>;
}
