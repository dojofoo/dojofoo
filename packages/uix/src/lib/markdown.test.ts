import { expect, it } from "vitest";
import { editorSchemes } from "./code-editor-theme";
import { renderMarkdown } from "./markdown";

it("highlights Markdown code fences with the chosen editor scheme", async () => {
  const html = await renderMarkdown('**Expected**\n\n```json\n[3, 8]\n```', editorSchemes[0].theme.name);
  expect(html).toContain("<strong>Expected</strong>");
  expect(html).toContain('class="shiki');
  expect(html).toMatch(/<span style="color:/);
});

it("escapes raw HTML and rejects unsafe links in test output", async () => {
  const html = await renderMarkdown('<img src=x onerror="alert(1)">\n\n[unsafe](javascript:alert(1))', editorSchemes[0].theme.name);
  expect(html).not.toContain("<img");
  expect(html).not.toContain('href="javascript:');
  expect(html).toContain("&lt;img");
});

it("includes Markdown in Shiki's highlighted code languages", async () => {
  const html = await renderMarkdown('```markdown\n# Heading\n\n**important**\n```', editorSchemes[0].theme.name);
  expect(html).toContain('class="shiki');
  expect(html).toMatch(/<span style="color:/);
  expect(html).toContain("Heading");
});

it.each(["jsx", "tsx"])("keeps %s snippets highlighted in the shared code renderer", async language => {
  const html = await renderMarkdown(`\`\`\`${language}\nconst View = () => <button>Try it</button>;\n\`\`\``, editorSchemes[0].theme.name);
  expect(html).toMatch(/<span style="color:/);
});
