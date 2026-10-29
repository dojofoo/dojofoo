import { createHighlighterCore } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import javascript from "shiki/langs/javascript.mjs";
import typescript from "shiki/langs/typescript.mjs";
import jsx from "shiki/langs/jsx.mjs";
import tsx from "shiki/langs/tsx.mjs";
import json from "shiki/langs/json.mjs";
import markdown from "shiki/langs/markdown.mjs";
import yaml from "shiki/langs/yaml.mjs";
import python from "shiki/langs/python.mjs";
import shellscript from "shiki/langs/shellscript.mjs";
import toml from "shiki/langs/toml.mjs";
import mdx from "shiki/langs/mdx.mjs";
import { createMarkdownExit } from "markdown-exit";
import { editorSchemes } from "./code-editor-theme";

let highlighter: ReturnType<typeof createHighlighterCore> | undefined;
const rendered = new Map<string, string>();
const cacheKey = (source: string, theme: string) => `${theme}\0${source}`;
export const getRenderedMarkdown = (source: string, theme: string) => rendered.get(cacheKey(source, theme));

/** One Shiki for the app's code: the editor schemes' themes, the languages its docs and lessons show (sh, bash and
    shell are shellscript's names) */
function getHighlighter() {
  highlighter ??= createHighlighterCore({
    themes: editorSchemes.flatMap(scheme => [scheme.theme, ...(scheme.light ? [scheme.light.theme] : [])]),
    langs: [...javascript, ...typescript, ...jsx, ...tsx, ...json, ...markdown, ...yaml, ...python, ...shellscript, ...toml, ...mdx],
    engine: createJavaScriptRegexEngine(),
  }).catch(error => { highlighter = undefined; throw error; });
  return highlighter;
}

/** A piece of code's tokens in a theme – plain text for a language it doesn't know */
export async function highlightCode(code: string, language: string, theme: string) {
  const shiki = await getHighlighter();
  return shiki.codeToTokens(code.trimEnd(), { lang: shiki.getLoadedLanguages().includes(language) ? language : "text", theme });
}

/** Test-runner text is untrusted Markdown; only Shiki emits HTML for code fences. */
export async function renderMarkdown(source: string, theme: string) {
  const cached = getRenderedMarkdown(source, theme);
  if (cached !== undefined) return cached;
  const shiki = await getHighlighter();
  const html = createMarkdownExit({
    html: false,
    linkify: true,
    highlight: (code, language) => shiki.codeToHtml(code.trimEnd(), {
      lang: shiki.getLoadedLanguages().includes(language) ? language : "text", theme,
    }),
  }).render(source);
  rendered.set(cacheKey(source, theme), html);
  if (rendered.size > 32) rendered.delete(rendered.keys().next().value!);
  return html;
}
