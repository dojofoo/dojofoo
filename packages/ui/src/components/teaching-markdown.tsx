import { ShikiMagicMovePrecompiled } from "@shikijs/magic-move/react";
import { mermaid } from "@streamdown/mermaid";
import { useEffect, useMemo, useState } from "react";
import parse, { domToReact, Element, type DOMNode, type HTMLReactParserOptions } from "html-react-parser";
import { Streamdown } from "streamdown";
import type { TeachingBlock } from "../lib/teaching-document";
import { Tooltip, TooltipProvider } from "./ui/tooltip";
import "@shikijs/magic-move/style.css";
import "@shikijs/twoslash/style-rich.css";
import "katex/dist/katex.min.css";
import "./teaching-markdown.css";

export function TeachingMarkdown({ source, basePath = null, workspaceId = "" }: { source: string; basePath?: string | null; workspaceId?: string }) {
  const request = JSON.stringify({ source, basePath, workspaceId });
  const [result, setResult] = useState<{ request: string; blocks?: TeachingBlock[]; error?: string }>();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/teaching/preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: request, signal: controller.signal,
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to render lesson content.");
      if (!controller.signal.aborted) setResult({ request, blocks: data.blocks });
    }).catch((cause) => {
      if (!controller.signal.aborted) setResult({ request, error: String(cause.message || cause) });
    });
    return () => controller.abort();
  }, [request]);
  if (result?.request !== request) return <p role="status">Preparing preview…</p>;
  if (result.error) return <p role="alert">{result.error}</p>;
  return <TeachingDocument key={request} blocks={result.blocks ?? []} />;
}

export function TeachingDocument({ blocks }: { blocks: TeachingBlock[] }) {
  return <TooltipProvider><div className="teaching-markdown space-y-5">{blocks.map((block, index) => {
    if (block.type === "diagram") return <Streamdown key={index} plugins={{ mermaid }}>{`\`\`\`mermaid\n${block.source}\n\`\`\``}</Streamdown>;
    if (block.type === "code-steps") return <CodeSteps key={index} steps={block.steps} />;
    return <TeachingHtml key={index} html={block.html} />;
  })}</div></TooltipProvider>;
}

const popupOptions: HTMLReactParserOptions = {
  replace(node) {
    if (!(node instanceof Element) || !node.attribs.class?.split(" ").includes("twoslash-hover")) return;
    const popup = node.children.find((child) => child instanceof Element && child.attribs.class?.includes("twoslash-popup-container"));
    if (!(popup instanceof Element)) return;
    return <Tooltip className="teaching-markdown twoslash max-w-[min(36rem,80vw)] rounded-none border border-border bg-background p-3 text-foreground shadow-surface-4" content={domToReact(popup.children as DOMNode[])}>
      <span className="twoslash-hover" tabIndex={0}>{domToReact(node.children.filter((child) => child !== popup) as DOMNode[])}</span>
    </Tooltip>;
  },
};

function TeachingHtml({ html }: { html: string }) {
  // Parse only compiler output; authored HTML remains escaped by Markdown Exit.
  const content = useMemo(() => parse(html, popupOptions), [html]);
  return <div>{content}</div>;
}

function CodeSteps({ steps }: { steps: Extract<TeachingBlock, { type: "code-steps" }>['steps'] }) {
  const [step, setStep] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(true);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  const current = Math.min(step, steps.length - 1);
  if (!steps.length) return null;
  return <figure aria-label="Animated code example" className="min-w-0" style={{ background: steps[current].bg, color: steps[current].fg }}>
    <div className="overflow-x-auto p-4"><ShikiMagicMovePrecompiled steps={steps} step={current} animate={!reducedMotion} options={{ duration: 450 }} /></div>
    <figcaption className="flex items-center justify-between border-t border-border p-3 text-sm">
      <button type="button" disabled={current === 0} onClick={() => setStep(current - 1)}>Previous</button>
      <span aria-live="polite">Step {current + 1} of {steps.length}</span>
      <button type="button" disabled={current === steps.length - 1} onClick={() => setStep(current + 1)}>Next</button>
    </figcaption>
  </figure>;
}
