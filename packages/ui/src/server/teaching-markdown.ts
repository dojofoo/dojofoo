import { fromAsyncCodeToHtml } from "@shikijs/markdown-exit";
import { rendererRich, transformerTwoslash } from "@shikijs/twoslash";
import { katex } from "@mdit/plugin-katex";
import { toKeyedTokens } from "@shikijs/magic-move/core";
import { createMarkdownExit } from "markdown-exit";
import { fromHtml } from "hast-util-from-html";
import { bundledLanguages, codeToHtml, codeToTokens, getSingletonHighlighter, type BundledLanguage } from "shiki";
import { vercelCursorTheme } from "../lib/code-editor-theme.ts";
import type { TeachingBlock } from "../lib/teaching-document";
import { courseAssetUrl } from "../lib/course-asset-url.ts";

type AssetContext = { basePath: string | null; workspaceId: string };
const htmlNodes = (html: string) => fromHtml(html, { fragment: true }).children.filter((node) => node.type !== "doctype");

/** Compile authored content, not streaming chat. TypeScript stays on the server. */
export async function renderTeachingMarkdown(source: string): Promise<string> {
  return (await createTeachingParser()).renderAsync(source);
}

async function createTeachingParser(assets?: AssetContext) {
  // Raw HTML is never trusted: course authors can include code examples, not scripts.
  // A fresh parser also isolates renderer state between concurrent lesson previews.
  const markdown = createMarkdownExit({ html: false, linkify: true });
  const docs = createMarkdownExit({ html: false, linkify: true });
  // Twoslash's documentation callbacks are synchronous. Warm the shared Shiki
  // instance first, then highlight synchronously without recursive Twoslash transforms.
  const highlighter = await getSingletonHighlighter({
    themes: [vercelCursorTheme],
    langs: ["javascript", "typescript", "jsx", "tsx"],
  });
  docs.options.highlight = (code, language, _attributes, env) => highlighter.codeToHtml(code.trimEnd(), {
    theme: vercelCursorTheme,
    lang: highlighter.getLoadedLanguages().includes(language || env.language) ? language || env.language : "text",
  });
  const renderer = rendererRich({
    renderMarkdown(source) { return htmlNodes(docs.render(source, { language: this.options.lang })); },
    renderMarkdownInline: (source) => htmlNodes(docs.renderInline(source)),
    hast: { hoverToken: { properties: { tabIndex: 0 } } },
  });
  // Keep Twoslash's standard annotate/error/warn tags; add safe Markdown links
  // to their explanations rather than inventing a second annotation language.
  const lineCustomTag = renderer.lineCustomTag!;
  renderer.lineCustomTag = function (tag) {
    return lineCustomTag.call(this, tag).map((node) => node.type === "element"
      ? { ...node, children: htmlNodes(docs.renderInline(tag.text ?? "")) }
      : node);
  };
  if (assets) {
    for (const [rule, attribute] of [["link_open", "href"], ["image", "src"]] as const) {
      const original = markdown.renderer.rules[rule];
      markdown.renderer.rules[rule] = (tokens, index, options, env, self) => {
        const url = tokens[index].attrGet(attribute);
        if (url) tokens[index].attrSet(attribute, courseAssetUrl(url, assets.basePath, assets.workspaceId));
        return original ? original(tokens, index, options, env, self) : self.renderToken(tokens, index, options);
      };
    }
  }
  // Markdown Exit implements the markdown-it plugin API; this plugin's types
  // still name markdown-it. Never enable KaTeX's trusted HTML/URL extensions.
  katex(markdown as unknown as Parameters<typeof katex>[0], { trust: false, throwOnError: false });
  markdown.use(fromAsyncCodeToHtml((code, options) => codeToHtml(code, {
    ...options,
    lang: Object.hasOwn(bundledLanguages, options.lang) ? options.lang : "text",
  }), {
    theme: vercelCursorTheme,
    transformers: [transformerTwoslash({ explicitTrigger: true, renderer })],
  }));
  return markdown;
}

/** Slidev's nested `md magic-move` fences work unchanged in lesson previews. */
export async function compileTeachingDocument(source: string, assets?: AssetContext): Promise<TeachingBlock[]> {
  const markdown = await createTeachingParser(assets);
  const env = {};
  const tokens = markdown.parse(source, env);
  const blocks: TeachingBlock[] = [];
  let start = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.type !== "fence" || token.level !== 0) continue;
    const [language, ...flags] = token.info.trim().split(/\s+/u);
    const magic = language === "md" && flags.includes("magic-move");
    if (!magic && language !== "mermaid") continue;
    if (index > start) blocks.push({ type: "html", html: await markdown.renderer.renderAsync(tokens.slice(start, index), markdown.options, env) });
    if (magic) {
      const frames = markdown.parse(token.content, {}).filter((frame) => frame.type === "fence");
      if (!frames.length) throw new Error("A magic-move block needs at least one fenced code example.");
      const steps = await Promise.all(frames.map(async (frame) => {
        const lang = frame.info.trim().split(/\s+/u)[0];
        const code = frame.content.replace(/\n$/u, "");
        const result = await codeToTokens(code, { lang: Object.hasOwn(bundledLanguages, lang) ? lang as BundledLanguage : "text", theme: vercelCursorTheme });
        return { ...toKeyedTokens(code, result.tokens), bg: result.bg, fg: result.fg, themeName: result.themeName, lang };
      }));
      blocks.push({ type: "code-steps", steps });
    } else blocks.push({ type: "diagram", source: token.content });
    start = index + 1;
  }
  if (start < tokens.length) blocks.push({ type: "html", html: await markdown.renderer.renderAsync(tokens.slice(start), markdown.options, env) });
  return blocks;
}
