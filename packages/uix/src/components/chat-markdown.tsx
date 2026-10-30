"use client";

import { isValidElement, useMemo, type ReactNode } from "react";
import { Streamdown, type Components } from "streamdown";
import { CodeBlock } from "./code-block";
import { CODE_HIGHLIGHT_PATTERN, codeHighlight, type CodeHighlight } from "../lib/code-highlight";

/*
 * ChatMarkdown – a chat message's Markdown, as it streams in (Streamdown: a half-sent list or fence renders as what it
 * will be, not as stray symbols). GitHub's Markdown – headings, lists in lists, task lists, quotes, tables, links,
 * rules, emphasis and strikethrough – in the chat's own type, fenced code in a CodeBlock (Shiki, the editor's
 * scheme), and the sensei's `[highlight:L3-5]` as a chip that highlights those lines in the learner's editor.
 *
 *   <ChatMarkdown text={part.content} streaming onHighlight={(lines) => editor.highlight(lines)} />
 */

const HIGHLIGHT = "dojo-highlight";

/** Each `[highlight:L3-5]` as a tag Streamdown lets through, for the chip */
function withHighlights(text: string) {
  return text.replace(new RegExp(CODE_HIGHLIGHT_PATTERN.source, "giu"), (marker) => {
    const lines = codeHighlight(marker);
    return lines ? `<${HIGHLIGHT} from="${lines.from}" to="${lines.to}"></${HIGHLIGHT}>` : marker;
  });
}

const languages: Record<string, string> = { js: "javascript", ts: "typescript", py: "python", sh: "bash", shell: "bash", zsh: "bash", yml: "yaml", md: "markdown" };

export function ChatMarkdown({ text, streaming = false, onHighlight, className }: {
  text: string;
  /** Still arriving: unfinished Markdown is completed as it renders */
  streaming?: boolean;
  onHighlight?: (lines: CodeHighlight) => void;
  className?: string;
}) {
  const components = useMemo(() => ({
    // A fence: its code, highlighted; react-markdown hands the code element to its <pre>
    pre: ({ children }: { children?: ReactNode }) => {
      const code = isValidElement<{ className?: string; children?: ReactNode }>(children) ? children : undefined;
      const lang = /language-(\S+)/.exec(code?.props.className ?? "")?.[1]?.toLowerCase() ?? "text";
      return <CodeBlock code={String(code?.props.children ?? "")} lang={languages[lang] ?? lang} />;
    },
    code: ({ className: language, children }: { className?: string; children?: ReactNode }) => <code className={language}>{children}</code>,
    a: ({ href, children }: { href?: string; children?: ReactNode }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    [HIGHLIGHT]: ({ from, to }: { from?: string; to?: string }) => {
      const lines = { from: Number(from), to: Number(to) };
      return (
        <button type="button" className="ui-chat-md__lines" onClick={() => onHighlight?.(lines)}
          aria-label={lines.from === lines.to ? `Highlight line ${lines.from}` : `Highlight lines ${lines.from} to ${lines.to}`}>
          L{lines.from}{lines.to !== lines.from && <>–{lines.to}</>}
        </button>
      );
    },
  }) as Components, [onHighlight]);
  return (
    <>
      <style href="ui-chat-md" precedence="default">{css}</style>
      {/* Streamdown's own Tailwind classes – its className's too – go under a prefix no stylesheet has: the chat's type
          is all ours, set on the box round it */}
      <div className={["ui-chat-md", className].filter(Boolean).join(" ")}>
        <Streamdown prefix="sd" mode={streaming ? "streaming" : "static"} parseIncompleteMarkdown={streaming} controls={false}
          linkSafety={{ enabled: false }} allowedTags={{ [HIGHLIGHT]: ["from", "to"] }} components={components}>
          {withHighlights(text)}
        </Streamdown>
      </div>
    </>
  );
}

const css = /* css */ `
.ui-chat-md { min-width: 0; max-width: 100%; color: var(--ink); font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
/* Margins reset without weight, so the spacing between blocks (and in lists and quotes) below decides */
.ui-chat-md :where(p, ul, ol, blockquote, table, figure, pre, hr, h1, h2, h3, h4, h5, h6) { margin: 0; }
.ui-chat-md > div > * + * { margin-top: 0.75em; }
.ui-chat-md :is(h1, h2, h3, h4, h5, h6) { margin: 1.25em 0 0; color: var(--ink); font-weight: 620; line-height: 1.3; letter-spacing: -0.01em; text-wrap: balance; }
.ui-chat-md > div > :is(h1, h2, h3, h4, h5, h6):first-child { margin-top: 0; }
.ui-chat-md h1 { font-size: 1.25em; }
.ui-chat-md h2 { font-size: 1.125em; }
.ui-chat-md h3 { font-size: 1em; }
.ui-chat-md :is(h4, h5, h6) { font-size: 0.875em; color: var(--muted); letter-spacing: 0.01em; }
.ui-chat-md :is(h1, h2, h3, h4, h5, h6) + * { margin-top: 0.5em; }
.ui-chat-md :is(ul, ol) { padding-inline-start: 1.5em; }
.ui-chat-md ul { list-style: disc; }
.ui-chat-md ol { list-style: decimal; }
.ui-chat-md :is(ul, ol) :is(ul, ol) { margin-top: 0.25em; }
.ui-chat-md ul ul { list-style: circle; }
.ui-chat-md li + li { margin-top: 0.25em; }
.ui-chat-md li::marker { color: var(--muted); font-variant-numeric: tabular-nums; }
.ui-chat-md li > p + p { margin-top: 0.5em; }
/* Task lists: the box is the marker */
.ui-chat-md li:has(> input[type="checkbox"]) { list-style: none; margin-inline-start: -1.5em; }
.ui-chat-md li > input[type="checkbox"] { width: 14px; height: 14px; margin: 0 0.5em 0 0; vertical-align: -2px; accent-color: var(--brand); }
.ui-chat-md blockquote { padding: 0 0 0 0.9em; border-left: 2px solid var(--line); color: var(--muted); }
.ui-chat-md blockquote > * + * { margin-top: 0.5em; }
.ui-chat-md a { color: var(--ink); text-decoration: underline; text-decoration-color: color-mix(in oklab, var(--ink) 35%, transparent); text-underline-offset: 3px; }
.ui-chat-md a:hover { text-decoration-color: currentColor; }
.ui-chat-md :is(strong, [data-streamdown="strong"]) { font-weight: 620; }
.ui-chat-md del { color: var(--muted); }
.ui-chat-md > div > hr { margin-block: 1.25em; }
.ui-chat-md hr { height: 1px; border: 0; background: var(--line); }
.ui-chat-md :not(pre) > code { padding: 0.125rem 0.3rem; border-radius: calc(5px * var(--squircle-factor, 1)); background: var(--fluid-hover); color: var(--fluid-foreground, var(--ink)); font-family: var(--font-mono); font-size: 0.875em; line-height: 1.35; }
.ui-chat-md img { max-width: 100%; height: auto; border-radius: calc(8px * var(--squircle-factor, 1)); }
.ui-chat-md [data-streamdown="table-wrapper"] { max-width: 100%; overflow-x: auto; }
.ui-chat-md table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; }
.ui-chat-md :is(th, td) { padding: 6px 12px 6px 0; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.ui-chat-md th { color: var(--muted); font-weight: 600; }
.ui-chat-md tr:last-child td { border-bottom: 0; }
.ui-chat-md__lines { display: inline-flex; align-items: center; padding: 0.0625rem 0.35rem; border: 0; border-radius: calc(5px * var(--squircle-factor, 1)); background: color-mix(in oklab, var(--brand) 14%, transparent); color: var(--brand); font: 600 0.8125em/1.35 var(--font-mono); vertical-align: 0.05em; cursor: pointer; }
.ui-chat-md__lines:hover { background: color-mix(in oklab, var(--brand) 22%, transparent); }
.ui-chat-md__lines:focus-visible { outline: 2px solid var(--brand); outline-offset: 1px; }
`;
