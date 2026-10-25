import { expect, it } from "vitest";
import { createHighlighter } from "shiki";
import { vercelCursorColors as c, vercelCursorTheme } from "./code-editor-theme";

it("uses the shared Vercel palette in real Shiki tokenization", async () => {
  const highlighter = await createHighlighter({ themes: [vercelCursorTheme], langs: ["typescript", "yaml", "python", "markdown", "json", "javascript"] });
  try {
    const tokens = highlighter.codeToTokens('export const greeting = "hello";', { lang: "typescript", theme: vercelCursorTheme.name });
    expect(tokens.bg).toBe(c.background);
    expect(tokens.tokens[0].find((token) => token.content.includes("export"))?.color?.toLowerCase()).toBe(c.keyword);
    expect(tokens.tokens[0].find((token) => token.content.includes("hello"))?.color?.toLowerCase()).toBe(c.string);
    const arrow = highlighter.codeToTokens('const greet = (name: string) => name;', { lang: "typescript", theme: vercelCursorTheme.name });
    expect(arrow.tokens[0].find((token) => token.content.includes("=>"))?.color?.toLowerCase()).toBe(c.keyword);
  } finally { highlighter.dispose(); }
});
