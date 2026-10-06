import { expect, it } from "vitest";
import { hoverContents } from "./monaco-documentation";

it.each(["javascript", "typescript"])("inherits %s for unlabelled documentation fences only", (language) => {
  const parts = hoverContents({ from: 0, to: 1, signature: "function demo(): void", documentation: "```\nconst value = 1;\n```\n\n```text\nplain\n```\n\n```python\nprint(1)\n```", tags: [
    { name: "example", text: "~~~\ndemo();\n~~~" },
  ] }, language);
  expect(parts[1].value).toContain(`\`\`\`${language}\nconst value`);
  expect(parts[1].value).toContain(`~~~${language}\ndemo();\n~~~`);
  expect(parts[1].value).toContain("```text\nplain\n```");
  expect(parts[1].value).toContain("```python\nprint(1)\n```");
});

it("formats examples and parameter names, placing references last without enabling commands", () => {
  const parts = hoverContents({ from: 0, to: 1, signature: "function greet(name: string): string", documentation: "Say **hello**.", tags: [
    { name: "see", text: "https://example.com/reference" },
    { name: "param", text: "name - Learner name." },
    { name: "example", text: 'greet("Ada")' },
  ] });
  expect(parts[2].value).toBe("**@param** `name` Learner name.");
  expect(parts[1].value).toContain('```typescript\ngreet("Ada")\n```');
  expect(parts.at(-1)?.value).toContain("[https://example.com/reference](<https://example.com/reference>)");
  expect(parts.every((part) => !part.isTrusted && !part.supportHtml)).toBe(true);
});
