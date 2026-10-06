import type * as Monaco from "modern-monaco/editor-core";
import { createMarkdownExit } from "markdown-exit";
import type { getTypeScriptHover } from "../server/lesson/typescript-language-service";

/** Monaco renders Markdown safely; course comments never gain command/HTML permissions. */
export function hoverContents(info: NonNullable<ReturnType<typeof getTypeScriptHover>>, language = "typescript") {
  const examples = info.tags.filter((tag) => tag.name === "example").map((tag) =>
    `**Example**\n\n${createMarkdownExit().parse(tag.text, {}).some((token) => token.type === "fence") ? tag.text : codeBlock(tag.text, language)}`);
  const tags = info.tags.filter((tag) => tag.name !== "see" && tag.name !== "example").map((tag) => {
    if (tag.name === "param" || tag.name === "typeParam" || tag.name === "template") {
      const [, name, description = ""] = tag.text.match(/^(\S+)\s*(?:[-–—]\s*)?([\s\S]*)$/) ?? [];
      return `**@${tag.name}** ${name ? `\`${name.replaceAll("`", "")}\`` : ""} ${description}`;
    }
    return `**@${tag.name}** ${tag.text}`;
  });
  const references = info.tags.filter((tag) => tag.name === "see").map((tag) => {
    // Plain @see URLs also become links; Markdown/JSDoc links are retained.
    const url = tag.text.match(/^https?:\/\/\S+$/)?.[0];
    return url ? `[${url}](<${url}>)` : tag.text;
  });
  return [
    { value: codeBlock(info.signature) },
    { value: [info.documentation, ...examples].filter(Boolean).join("\n\n") },
    ...tags.map((value) => ({ value })),
    ...(references.length ? [{ value: `**References**\n\n${references.join("\n\n")}` }] : []),
  ].filter((part) => part.value).map((part) => ({ value: inheritFenceLanguage(part.value, language), isTrusted: false, supportHtml: false }));
}

/** Use parser source locations so closing fences and explicitly labelled blocks stay untouched. */
function inheritFenceLanguage(source: string, language: string) {
  const lines = source.split("\n");
  for (const token of createMarkdownExit().parse(source, {})) {
    if (token.type === "fence" && !token.info.trim() && token.map) {
      lines[token.map[0]] = lines[token.map[0]].trimEnd() + language;
    }
  }
  return lines.join("\n");
}

function codeBlock(source: string, language = "typescript") {
  const fence = "`".repeat(Math.max(3, ...Array.from(source.matchAll(/`+/g), (match) => match[0].length + 1)));
  return `${fence}${language}\n${source}\n${fence}`;
}

export function attachDocumentation(monaco: typeof Monaco, model: Monaco.editor.ITextModel, filePath: string, url: string) {
  let disposed = false;
  const activatedLanguages = new Set([model.getLanguageId()]);
  const pending = new Set<AbortController>();
  const provider = monaco.languages.registerHoverProvider(model.getLanguageId(), {
    async provideHover(candidate, position, token) {
      if (candidate !== model || disposed) return null;
      const controller = new AbortController();
      pending.add(controller);
      const cancellation = token.onCancellationRequested(() => controller.abort());
      const version = model.getVersionId();
      try {
        const response = await fetch(url, {
          method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal,
          body: JSON.stringify({ code: model.getValue(), filePath, position: model.getOffsetAt(position) }),
        });
        if (!response.ok) throw new Error(`Documentation: ${response.status}`);
        const info: ReturnType<typeof getTypeScriptHover> = await response.json();
        if (!info || disposed || token.isCancellationRequested || model.getVersionId() !== version) return null;
        const start = model.getPositionAt(info.from), end = model.getPositionAt(info.to);
        const contents = hoverContents(info, model.getLanguageId());
        for (const part of contents) {
          for (const block of createMarkdownExit().parse(part.value, {})) {
            if (block.type !== "fence") continue;
            const label = block.info.trim();
            const language = monaco.languages.getLanguages().find((item) => item.id === label || item.aliases?.includes(label));
            if (language && !activatedLanguages.has(language.id)) {
              // modern-monaco activates tokenizers on model creation, not Markdown
              // rendering. Give embedded examples a short-lived model as well.
              const example = monaco.editor.createModel(block.content, language.id);
              example.dispose();
              activatedLanguages.add(language.id);
            }
          }
        }
        return { range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column), contents };
      } catch (error) {
        if (!controller.signal.aborted) console.warn("Documentation unavailable", error);
        return null;
      } finally { pending.delete(controller); cancellation.dispose(); }
    },
  });
  return () => { disposed = true; provider.dispose(); for (const controller of pending) controller.abort(); pending.clear(); };
}
