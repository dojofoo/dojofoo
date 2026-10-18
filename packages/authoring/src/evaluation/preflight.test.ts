import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readPrompt } from "../prompts";
import { checkSensei, checkTests, preflightLessons, senseiWordBudget } from "./preflight";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

it("does not require a prescribed teaching sequence or specific headings", () => {
  expect(checkSensei("# Callback values\n\nA callback is a function passed to another function. The learner may confuse passing it with calling it. A returned value and a discarded expression differ.\n\nAn explanation of that distinction on a fresh example gives evidence beyond a passing test.")).toEqual([]);
});
it("rejects empty guidance without pretending to grade pedagogy", () => {
  expect(checkSensei(" \n ")).toEqual(["Add lesson-specific teaching material to SENSEI."]);
});
it("flags the unfilled template itself", () => {
  expect(checkSensei(readPrompt("skills/kata-lessons/SENSEI.tmpl")).join("\n")).toContain("placeholders");
});
it("accepts compact teaching notes without scripted questions or a hint sequence", () => {
  const notes = `# Running totals

## Start
- **Hook:** A receipt grows as items are added.
- **Builds on:** Variables, addition and loops.
- **First move:** One item before a whole basket.

## Teach
An update replaces the previous value. On a receipt, adding 3 to a total of 4 leaves 7. A different basket lets the learner apply this idea.

## Stumbling points
Resetting inside the loop loses earlier items. Two differently priced items reveal this; contrast initialization with updating.

## Evidence
The learner can explain where earlier items are remembered and predict another basket.

## Review
- **Boundary:** Empty baskets and the meaning of zero.
- **Predict:** A basket with a returned item.
`;
  expect(checkSensei(notes)).toEqual([]);
});
it("ignores braces in code and MDX expressions", () => {
  const filled = readPrompt("skills/kata-lessons/SENSEI.tmpl").replace(/\{[^{}\n]*\}/gu, "x");
  expect(checkSensei(`${filled}\n\`if (a) { b }\``)).toEqual([]);
  expect(checkSensei(`${filled}\n{props.some value}`, { mdx: true })).toEqual([]);
});
it("keeps a lesson to one screen", () => {
  const filled = readPrompt("skills/kata-lessons/SENSEI.tmpl").replace(/\{[^{}\n]*\}/gu, "x");
  expect(checkSensei(`${filled}\n${"word ".repeat(senseiWordBudget)}`).join("\n")).toContain("budget");
});
it("requires checks and guidance for every lesson in the course", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojo-preflight-")); roots.push(root);
  await writeFile(join(root, "dojo.yaml"), "katas:\n  - name: first\n    template: src/first/kata.ts\n");
  await mkdir(join(root, "src", "first"), { recursive: true });
  const [result] = await preflightLessons(root);
  expect(result).toMatchObject({ lessonId: "first", pass: false });
  expect(result!.findings.join("\n")).toMatch(/test\.ts[\s\S]*SENSEI\.md/u);
});
it("requires real checks, not the new-lesson todos", () => {
  expect(checkTests('it.todo("returns the largest")')).toHaveLength(1);
  expect(checkTests("")).toHaveLength(1);
  expect(checkTests('it("returns the largest", () => {})')).toEqual([]);
  expect(checkTests('it.each([[1]])("keeps %i", () => {})')).toEqual([]);
});
