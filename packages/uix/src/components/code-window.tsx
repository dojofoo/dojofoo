import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { EditorFrame, EditorTabs } from "./editor";
import { editorAppearance } from "../lib/editor-appearance";
import { highlightCode } from "../lib/markdown";
import { editorLineHeight, useEditorScheme, useUiPreferences } from "../lib/ui-preferences";

/*
 * Code as the editor shows it, for reading: the editor's frame – square and flush, its tab strip, the open tab joined
 * to the code – and the code as Monaco sets it (Iosevka at the editor's size and line height, the scheme's colors on
 * the scheme's surface), only it doesn't edit and has no line numbers. A docs code block has a tab only when it's named (its
 * title); the API reference's request and responses are tabs of their own (components/api-reference).
 */

type Tokens = Awaited<ReturnType<typeof highlightCode>>;

/** Inside a window, a code block is its code alone: the window has the tabs and the copy button */
const InWindow = createContext(false);

export type CodeWindowTab = { id: string; label: ReactNode };

/**
 * The editor's frame around code: its tabs (a click opens one) with a copy button for the code that's open at the strip's
 * end, or, with no tabs, the code alone with the copy button in its top right corner
 */
export function CodeWindow({ tabs = [], active = "", onSelect = () => {}, label = "Code", className, children }: {
  tabs?: CodeWindowTab[];
  active?: string;
  onSelect?: (id: string) => void;
  /** The tab list's name, for assistive tech */
  label?: string;
  className?: string;
  /** The open tab's code: CodeLines, or anything that draws a CodeBlock */
  children: ReactNode;
}) {
  const scheme = useEditorScheme();
  const { editorSize } = useUiPreferences();
  const body = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = () => {
    const lines = body.current?.querySelectorAll(".ui-cw-code .line");
    const text = lines?.length ? Array.from(lines, (line) => line.textContent ?? "").join("\n") : body.current?.textContent ?? "";
    void navigator.clipboard?.writeText(text.trimEnd()).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };
  const copyButton = <button type="button" className="ui-cw__copy" data-copied={copied || undefined} aria-label={copied ? "Copied" : "Copy code"} onClick={copy} />;
  return (
    <InWindow.Provider value={true}>
      <style href="ui-code-window" precedence="default">{css}</style>
      <EditorFrame flush appearance={editorAppearance(scheme)} className={["ui-cw not-prose", className].filter(Boolean).join(" ")}
        // The copy button in the tab strip itself, after the tabs (which take the rest and scroll on their own), not in
        // the frame's actions, which a narrow editor moves to a row of their own
        tabs={tabs.length ? <>
          <EditorTabs mode="learning" scheme={scheme} label={label} active={active} onSelect={onSelect}
            tabs={tabs.map((tab) => ({ path: tab.id, label: tab.label }))} />
          {copyButton}
        </> : undefined}>
        <div ref={body} className="ui-cw__body" style={{ "--ui-cw-size": `${editorSize}px`, "--ui-cw-line": `${editorLineHeight(editorSize)}px` } as CSSProperties}>
          {children}
          {!tabs.length && copyButton}
        </div>
      </EditorFrame>
    </InWindow.Provider>
  );
}

/**
 * Code in the editor scheme's colors, line by line. Until its tokens are in it shows `fallback` – the
 * same lines highlighted ahead of time (the docs' Shiki, in the default scheme's light and dark colors) – or else the
 * code plain
 */
export function CodeLines({ code, lang = "text", fallback }: { code: string; lang?: string; fallback?: ReactNode }) {
  const scheme = useEditorScheme();
  const [tokens, setTokens] = useState<{ theme: string; result: Tokens }>();
  useEffect(() => {
    let current = true;
    highlightCode(code, lang, scheme.theme.name).then((result) => { if (current) setTokens({ theme: scheme.theme.name, result }); }, () => {});
    return () => { current = false; };
  }, [code, lang, scheme.theme.name]);
  const ready = tokens?.theme === scheme.theme.name ? tokens.result : undefined;
  return (
    <pre className="ui-cw-code scroll-fade-x" data-fallback={!ready && fallback ? "" : undefined}>
      <code>
        {ready ? ready.tokens.map((line, index) => (
          <span key={index} className="line">{line.map((token, at) => <span key={at} style={{ color: token.color }}>{token.content}</span>)}{index < ready.tokens.length - 1 ? "\n" : null}</span>
        )) : fallback ?? code.trimEnd().split("\n").map((line, index, all) => <span key={index} className="line">{line}{index < all.length - 1 ? "\n" : null}</span>)}
      </code>
    </pre>
  );
}

/** A code block: in a window of its own (a tab with its title, if it has one), or, inside one, its code alone */
export function CodeWindowBlock({ code, lang = "text", title, fallback }: { code: string; lang?: string; title?: ReactNode; fallback?: ReactNode }) {
  const lines = <CodeLines code={code} lang={lang} fallback={fallback} />;
  if (useContext(InWindow)) return lines;
  return <CodeWindow tabs={title ? [{ id: "code", label: title }] : undefined} active="code">{lines}</CodeWindow>;
}

const css = /* css */ `
/* A window among the page's text: its own room above and below, no taller than its code, its corners barely rounded
   (the frame clips the tab bar and the code to them) */
.ui-cw { margin: 20px 0; border-radius: 3px; corner-shape: round; }
.ui-cw .ui-ed__body { flex: none; }
.ui-cw__body { position: relative; min-width: 0; }
/* The code as Monaco sets it: Iosevka at the editor's size and line height, 10px above and below, 16px in from the
   left (about the room above the first line's letters – the 10px and the line height's half-leading – and where the
   tab labels start). A long line scrolls sideways with the app's scrollbar, its edges fading while there's more to see (fluid.css).
   Where the scrollbar is the app's own (::-webkit-scrollbar, 10px), its track is the 10px below the code, kept whether
   or not a line scrolls, so a block that scrolls is no taller than one that doesn't; elsewhere (an overlay scrollbar)
   it's padding */
.ui-cw-code { margin: 0; padding: 10px 0; overflow-x: auto; background: none; color: inherit; font-family: "Iosevka", var(--font-mono), ui-monospace, monospace; font-size: var(--ui-cw-size, 16.5px); line-height: var(--ui-cw-line, 26px); white-space: pre; --scroll-fade-size: 24px; }
@media (pointer: fine) { @supports selector(::-webkit-scrollbar) { .ui-cw-code { padding-bottom: 0; overflow-x: scroll; } } }
.ui-cw-code code { display: block; width: max-content; min-width: 100%; padding: 0 24px 0 16px; box-sizing: border-box; background: none; font: inherit; border: 0; }
/* Ahead of its tokens: the docs' own highlighting, in the colors for the island's mode */
.ui-ed__scheme.dark .ui-cw-code[data-fallback] span { color: var(--shiki-dark); }
.ui-ed__scheme.light .ui-cw-code[data-fallback] span { color: var(--shiki-light); }

/* Copy, at the strip's right end: the copy glyph, a check once copied */
.ui-cw__copy { all: unset; position: relative; flex: none; align-self: center; width: 28px; height: 28px; margin: 0 6px 0 4px; border-radius: calc(6px * var(--squircle-factor, 1)); color: var(--fluid-muted); cursor: pointer; transition: color var(--motion-fast) var(--ease-fast), background-color var(--motion-fast) var(--ease-fast);
  --ui-cw-copy: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='9' y='9' width='12' height='12' rx='2.5'/%3E%3Cpath d='M15 9V5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15H9'/%3E%3C/svg%3E"); }
.ui-cw__copy::before { content: ""; position: absolute; inset: 0; background: currentColor; -webkit-mask: var(--ui-cw-copy) center / 15px no-repeat; mask: var(--ui-cw-copy) center / 15px no-repeat; }
/* With no tabs: in the code's top right corner, level with the first line, on the code's surface (a long line scrolls under it), the first line
   kept clear of it */
.ui-cw__body > .ui-cw__copy { position: absolute; top: calc(10px + (var(--ui-cw-line, 26px) - 28px) / 2); right: 0; background: var(--ui-ed-surface); }
.ui-cw__body:has(> .ui-cw__copy) .ui-cw-code code { padding-right: 44px; }
@media (forced-colors: active) { .ui-cw__copy::before { background: ButtonText; } }
@media (hover: hover) { .ui-cw__copy:hover { background: var(--fluid-hover); color: var(--fluid-foreground); } }
.ui-cw__copy:focus-visible { outline: 1px solid var(--focus-ring); }
@media (hover: hover) { .ui-cw__body > .ui-cw__copy:hover { background: linear-gradient(var(--fluid-hover), var(--fluid-hover)) var(--ui-ed-surface); } }
.ui-cw__copy[data-copied] { color: var(--fluid-foreground); --ui-cw-copy: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E"); }
`;
