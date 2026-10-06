import { describe, expect, it } from "vitest";
import { compileTeachingDocument, renderTeachingMarkdown } from "./teaching-markdown";

describe("authored teaching Markdown", () => {
  it("highlights fenced JSDoc examples without recursively enabling Twoslash", async () => {
    const source = [
      "````ts twoslash",
      "/**",
      " * Read a value. [Reference](https://example.com/docs)",
      " * ```",
      " * const inherited: number = 2;",
      " * ```",
      " * ```text",
      " * const deliberatelyPlain = 3;",
      " * ```",
      " * ```js twoslash",
      " * const example = 'hello';",
      " * ```",
      " * ```ts",
      " * const count: number = 1;",
      " * ```",
      " * ```unknown-language",
      " * <script>unsafe()</script>",
      " * ```",
      " */",
      "function readValue() { return 1; }",
      "readValue();",
      "````",
    ].join("\n");
    const html = await renderTeachingMarkdown(source);
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toMatch(/<span style="color:#[\da-f]+">const<\/span>.*example/i);
    expect(html).toMatch(/<span style="color:#[\da-f]+">const<\/span>.*count/i);
    expect(html).toMatch(/<span style="color:#[\da-f]+">const<\/span>.*inherited/i);
    expect(html).toContain('<span>const deliberatelyPlain = 3;</span>');
    expect(html).toContain("&#x3C;script>unsafe()");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("twoslash-error-line");
  });

  it("renders sourced learning notes and keyboard-focusable type hovers", async () => {
    const html = await renderTeachingMarkdown('```ts twoslash\nconst word = "hello";\nword.toUpperCase();\n//   ^^^^^^^^^^^\n// @annotate: A new string. [MDN](https://developer.mozilla.org/).\n```');
    expect(html).toContain('class="twoslash-tag-line twoslash-tag-annotate-line"');
    expect(html).toContain('href="https://developer.mozilla.org/"');
    expect(html).toContain('class="twoslash-highlighted"');
    expect(html).toContain('class="twoslash-hover" tabindex="0"');
    expect(html).not.toContain("twoslash-error-line");
  });

  it("escapes unsafe annotation HTML and URLs", async () => {
    const html = await renderTeachingMarkdown('```ts twoslash\nconst value = 1;\n// @annotate: <img src=x onerror=alert(1)> [bad](javascript:alert(1))\n```');
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
  });

  it("keeps relative assets scoped to the course while retaining public references", async () => {
    const blocks = await compileTeachingDocument('![Diagram](../diagram.svg)\n\n[MDN](https://developer.mozilla.org/)\n\n[Notes](notes.pdf)', { workspaceId: "ws", basePath: "lessons/one" });
    const html = blocks.filter((block) => block.type === "html").map((block) => block.html).join("");
    expect(html).toContain("workspace=ws&amp;path=lessons%2Fdiagram.svg");
    expect(html).toContain('href="https://developer.mozilla.org/"');
    expect(html).toContain("lessons%2Fone%2Fnotes.pdf");
  });
  it("preserves formulas without permitting KaTeX HTML extensions", async () => {
    const html = await renderTeachingMarkdown('Area: $r^2$.\n\n$$a^2 + b^2 = c^2$$');
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-display"');
  });

  it("compiles Slidev-style Magic Move frames and preserves surrounding content", async () => {
    const blocks = await compileTeachingDocument('# Before\n\n````md magic-move\n```ts\nconst value = 1;\n```\n```ts\nconst value = 2;\n```\n````\n\nAfter');
    expect(blocks.map((block) => block.type)).toEqual(["html", "code-steps", "html"]);
    const block = blocks[1];
    if (block.type !== "code-steps") throw new Error("Missing animation");
    expect(block.steps.map((step) => step.code)).toEqual(["const value = 1;", "const value = 2;"]);
    expect(block.steps.every((step) => step.bg === "#1a1a1a")).toBe(true);
    expect(block.steps[0].tokens.some((token) => token.key && token.content.includes("const"))).toBe(true);
  });

  it("keeps Mermaid as a diagram instead of flattening it to highlighted code", async () => {
    const blocks = await compileTeachingDocument('```mermaid\ngraph LR\n A --> B\n```');
    expect(blocks).toEqual([{ type: "diagram", source: "graph LR\n A --> B\n" }]);
  });
  it("renders Markdown and code using the editor's exact theme", async () => {
    const html = await renderTeachingMarkdown('# Lesson\n\n- Read\n- Try\n\n```ts\nexport const greeting = "hello";\n```');
    expect(html).toContain("<h1>Lesson</h1>");
    expect(html).toContain("<li>Try</li>");
    expect(html).toContain("background-color:#1a1a1a");
    expect(html.toLowerCase()).toContain("#ff4d8d");
  });

  it("escapes authored HTML and refuses executable link schemes", async () => {
    const html = await renderTeachingMarkdown('<script>alert(1)</script>\n\n[bad](javascript:alert(1))');
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps unknown languages readable and Twoslash opt-in", async () => {
    const html = await renderTeachingMarkdown('```fictional\n<example>\n```\n\n```ts\nconst invalid: number = "text";\n```');
    expect(html).toContain("&#x3C;example>");
    expect(html).not.toContain("<example>");
    expect(html).not.toContain("twoslash-hover");
  });

  it("generates actual TypeScript hover information for opted-in examples", async () => {
    const html = await renderTeachingMarkdown('```ts twoslash\nconst greeting = "hello";\ngreeting.toUpperCase();\n```');
    expect(html).toContain("twoslash-hover");
    expect(html).toContain("toUpperCase");
    expect(html).toContain("string");
  });
});
