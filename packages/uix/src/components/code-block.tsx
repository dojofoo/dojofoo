import { useEffect, useState } from "react";
import { highlightCode } from "../lib/markdown";
import { useEditorScheme, usePageMode } from "../lib/ui-preferences";

/*
 * A box of code, as the docs show it: Shiki in the editor scheme's colors, on the box surface (fluid.css' --box-*) when
 * the scheme is for the page's mode, a copy button at its top right. The docs' Markdown dresses its code blocks with the
 * same classes (DocsSite's Prose); the API reference renders its requests and responses with this.
 */

type Tokens = Awaited<ReturnType<typeof highlightCode>>;

export function CodeBlock({ code, lang = "text" }: { code: string; lang?: string }) {
  const scheme = useEditorScheme();
  const boxed = scheme.type === usePageMode();
  const [tokens, setTokens] = useState<Tokens>();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let current = true;
    highlightCode(code, lang, scheme.theme.name).then((result) => { if (current) setTokens(result); }, () => {});
    return () => { current = false; };
  }, [code, lang, scheme.theme.name]);
  const copy = () => {
    void navigator.clipboard?.writeText(code.trimEnd()).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <>
      <style href="ui-code" precedence="default">{codeCss}</style>
      {/* Plain until its tokens are in, the same size */}
      <pre className="ui-code" data-boxed={boxed || undefined} style={tokens && { backgroundColor: tokens.bg, color: tokens.fg }}>
        <code>
          {tokens ? tokens.tokens.map((line, index) => (
            <span key={index} className="line">{line.map((token, at) => <span key={at} style={{ color: token.color }}>{token.content}</span>)}{"\n"}</span>
          )) : code.trimEnd()}
        </code>
        <button type="button" className="ui-code__copy" data-copied={copied || undefined} aria-label={copied ? "Copied" : "Copy code"} onClick={copy} />
      </pre>
    </>
  );
}

export const codeCss = /* css */ `
/* A code block: a box, as the landing page's command – one line of it as tall – its code flush with its padding */
pre.ui-code { position: relative; margin: 16px 0; padding: 10px 48px 10px 14px; overflow-x: auto; overflow-wrap: normal; border-radius: var(--box-radius); box-shadow: var(--box-shadow); font-family: var(--font-mono); font-size: 13px; line-height: 20px; white-space: pre; }
pre.ui-code code { display: block; padding: 0; background: none; font: inherit; }
/* On the box's surface rather than its scheme's, when the scheme is for the page's mode */
:is(.ui-code[data-boxed], [data-boxed] .ui-code) { background-color: var(--box-surface) !important; }

/* Its copy button, top right: the copy glyph, a check once copied – masked on a layer of its own, so the button's
   focus ring isn't masked away with it */
.ui-code__copy { position: absolute; top: 6px; right: 6px; width: 28px; height: 28px; border-radius: calc(4px * var(--squircle-factor, 1)); color: var(--muted); cursor: pointer;
  transition: color var(--motion-fast) var(--ease-standard);
  --ui-code-copy: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='9' y='9' width='12' height='12' rx='2.5'/%3E%3Cpath d='M15 9V5.5A2.5 2.5 0 0 0 12.5 3h-7A2.5 2.5 0 0 0 3 5.5v7A2.5 2.5 0 0 0 5.5 15H9'/%3E%3C/svg%3E"); }
.ui-code__copy::before { position: absolute; inset: 0; background: currentColor; -webkit-mask: var(--ui-code-copy) center / 15px no-repeat; mask: var(--ui-code-copy) center / 15px no-repeat; content: ""; }
@media (forced-colors: active) { .ui-code__copy::before { background: ButtonText; } }
@media (hover: hover) { .ui-code__copy:hover { color: var(--ink); } }
.ui-code__copy[data-copied] { color: var(--ink); --ui-code-copy: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M5 12.5l4.5 4.5L19 7.5'/%3E%3C/svg%3E"); }
`;
