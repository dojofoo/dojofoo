import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readPrompt } from "../prompts";
import { checkEvaluationRequest, checkSensei, checkTests, preflightLessons, senseiWordBudget } from "./preflight";

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

describe("checkEvaluationRequest", () => {
  const validSensei = "# Lesson\n\n## Start\n\n- **Hook:** h\n- **Builds on:** b\n- **First move:** f\n\n## Teach\n\n## Stumbling points\n\n## Evidence\n\n## Review\n\n- **Boundary:** b\n- **Predict:** p\n";
  async function draft() {
    const root = await mkdtemp(join(tmpdir(), "dojo-eval-request-")); roots.push(root);
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "INTRO.md"), "# Chapter\n\nWhat this chapter covers.\n");
    await writeFile(join(root, "dojo.yaml"), "katas:\n  - name: first\n    template: src/first/solution.ts\n  - name: second\n    template: src/second/solution.ts\n");
    await writeFile(join(root, "README.md"), "# Course\n\nWhat the learner builds.\n");
    for (const lesson of ["first", "second"]) {
      await mkdir(join(root, "src", lesson), { recursive: true });
      await writeFile(join(root, "src", lesson, "INTRO.md"), `# ${lesson}\n\nWhat this lesson covers.\n`);
      await writeFile(join(root, "src", lesson, "SENSEI.md"), validSensei);
      await writeFile(join(root, "src", lesson, "solution.test.ts"), 'it("works", () => {});');
    }
    return root;
  }

  it("refuses more than two lessons or a repeated one as an invalid request", async () => {
    const root = await draft();
    for (const lessonIds of [[], ["first", "first"], ["first", "second", "third"]]) {
      await expect(checkEvaluationRequest(root, lessonIds)).rejects.toMatchObject({ name: "EvaluationRefused", code: "invalid_request" });
    }
    await expect(checkEvaluationRequest(root, ["first", "second"])).resolves.toBeUndefined();
  });

  it("cannot expand the scope to unknown lessons", async () => {
    const root = await draft();
    await expect(checkEvaluationRequest(root, ["elsewhere"])).rejects.toMatchObject({ code: "invalid_request", message: expect.stringContaining("not in this course") });
  });

  it("identifies malformed authored YAML before spending an evaluation attempt", async () => {
    const root = await draft();
    await writeFile(join(root, "dojo.yaml"), "name: Arrays: largest\nkatas:\n  - name: first\n");
    await expect(checkEvaluationRequest(root, ["first"])).rejects.toMatchObject({
      name: "MaterialFailure", message: expect.stringContaining("Invalid authored dojo.yaml"),
    });
    await writeFile(join(root, "dojo.yaml"), 'name: "Arrays: largest"\nkatas:\n  - name: first\n    template: src/first/solution.ts\n');
    await expect(checkEvaluationRequest(root, ["first"])).resolves.toBeUndefined();
  });

  it.each(["null", "name: Draft", "katas: [null]", "katas: [{}]"])("rejects an invalid authored manifest shape: %s", async source => {
    const root = await draft();
    await writeFile(join(root, "dojo.yaml"), source);
    await expect(checkEvaluationRequest(root, ["first"])).rejects.toMatchObject({ name: "MaterialFailure" });
  });

  it("preserves a missing workspace file as infrastructure, not bad teaching material", async () => {
    const root = await draft();
    await rm(join(root, "dojo.yaml"));
    await expect(checkEvaluationRequest(root, ["first"])).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects duplicate lesson IDs before spending an attempt", async () => {
    const root = await draft();
    await writeFile(join(root, "dojo.yaml"), "katas:\n  - name: first\n    template: src/first/solution.ts\n  - name: first\n    template: src/first/solution.ts\n");
    await expect(checkEvaluationRequest(root, ["first"])).rejects.toMatchObject({ name: "MaterialFailure", message: expect.stringContaining("Duplicate lesson ID: first") });
  });

  it("accepts an MDX-only lesson", async () => {
    const root = await draft();
    await rm(join(root, "src", "first", "SENSEI.md"));
    await writeFile(join(root, "src", "first", "SENSEI.mdx"), validSensei);
    await expect(checkEvaluationRequest(root, ["first"])).resolves.toBeUndefined();
  });

  it("rejects missing guidance before spending an attempt", async () => {
    const root = await draft();
    await rm(join(root, "src", "first", "SENSEI.md"));
    await expect(checkEvaluationRequest(root, ["first"])).rejects.toMatchObject({ name: "MaterialFailure" });
  });

  it("rejects unfinished lesson placeholders without imposing teaching headings", async () => {
    const root = await draft();
    await writeFile(join(root, "src", "first", "SENSEI.md"), "# Lesson\n\n## Start\n\n- **Hook:** {situation from the learner's world}\n");
    const failure = await checkEvaluationRequest(root, ["first"]).catch(error => error);
    expect(failure).toMatchObject({ name: "MaterialFailure" });
    expect(failure.message).toContain("no attempt was used");
    expect(failure.message).not.toContain("## Teach");
    expect(failure.message).toContain("placeholders");
  });

  it("allows free-form teaching notes through preflight without certifying their quality", async () => {
    const root = await draft();
    await writeFile(join(root, "src", "first", "SENSEI.md"), "A callback is a function passed to another function. Check whether the learner distinguishes passing a function from calling it before assuming this is understood.");
    await expect(checkEvaluationRequest(root, ["first"])).resolves.toBeUndefined();
  });
});
