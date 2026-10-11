import { expect, it } from "vitest";
import { promptSection, promptSections, renderPrompt } from "./prompts";

it("fills every declared slot and rejects mismatches", () => {
  expect(renderPrompt("Hi {{name}}.", { name: "Kai" })).toBe("Hi Kai.");
  expect(() => renderPrompt("Hi {{name}}.")).toThrow("missing: name");
  expect(() => renderPrompt("Hi.", { name: "Kai" })).toThrow("unused: name");
});

it("does not re-render slot syntax inside supplied values", () => {
  expect(renderPrompt("{{a}} {{b}}", { a: "{{b}}", b: "x" })).toBe("{{b}} x");
});

it("splits Markdown into unique ## sections", () => {
  const sections = promptSections("# Title\nintro\n## one\nFirst.\n\n## two\nSecond.\n");
  expect(sections).toEqual({ one: "First.", two: "Second." });
  expect(() => promptSection(sections, "three")).toThrow("Missing prompt section: three");
  expect(() => promptSections("## one\na\n## one\nb")).toThrow("Duplicate");
});
