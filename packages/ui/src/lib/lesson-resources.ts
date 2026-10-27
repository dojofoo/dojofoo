import { createMarkdownExit, type Token } from "markdown-exit";
import type { LessonResource } from "@dojofoo/uix/components/lesson-brief";
import { courseAssetUrl } from "./course-asset-url";

const markdown = createMarkdownExit({ html: false });

/** Authored links only; the source directory comes from the lesson service. */
export function lessonResources(source: string, basePath: string | null, workspaceId: string): LessonResource[] {
  const resources = new Map<string, LessonResource>();
  function visit(tokens: Token[]) {
    for (const [index, token] of tokens.entries()) {
      if (token.children) visit(token.children);
      if (token.type !== "link_open") continue;
      const source = token.attrGet("href");
      if (!source || /^(?:#|mailto:|data:)/i.test(source)) continue;
      const href = courseAssetUrl(source, basePath, workspaceId);
      if (href === "#" || resources.has(href)) continue;
      const end = tokens.findIndex((candidate, next) => next > index && candidate.type === "link_close");
      const title = tokens.slice(index + 1, end).map(part => part.content).join("").trim() || source;
      resources.set(href, { title, href });
    }
  }
  visit(markdown.parse(source));
  return [...resources.values()];
}
