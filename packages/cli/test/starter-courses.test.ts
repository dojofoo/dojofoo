import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { add } from "../src/commands/add";
import { dojoDir, readCourseManifest } from "@dojofoo/config";
import { advanceInteractiveLesson, answerInteractiveQuestion, getInteractiveLesson } from "../../ui/src/server/interactive/service";
import { compileTeachingDocument } from "../../ui/src/server/teaching-markdown";

const sources = resolve(import.meta.dirname, "../../../courses");
const temporary: string[] = [];
afterEach(() => { for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true }); });

function digest(directory: string): string {
  const hash = createHash("sha256");
  const walk = (path: string) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      hash.update(entry.name);
      if (entry.isDirectory()) walk(resolve(path, entry.name));
      else hash.update(readFileSync(resolve(path, entry.name)));
    }
  };
  walk(directory);
  return hash.digest("hex");
}

for (const [id, title] of [
  ["create-your-own-dojo", "Create your own dojo"],
  ["how-to-run-a-dojo", "How to run a dojo"],
] as const) it(`${title} installs as an independent editable draft and preserves interactive progress`, async () => {
  const source = resolve(sources, id);
  expect(existsSync(resolve(source, "dojo.yaml"))).toBe(true);
  const original = digest(source);
  const root = mkdtempSync(resolve(tmpdir(), "dojo-starter-content-"));
  temporary.push(root);
  await add(root, [source, "--master"]);
  const installed = dojoDir(root, id!);
  expect(installed).not.toBe(source);
  expect(readCourseManifest(root, id!)).toMatchObject({ name: id, mode: "interactive", marketplace: false });
  expect(readFileSync(resolve(installed, "DOJO.md"), "utf8")).toContain("Draft");
  const first = getInteractiveLesson(root, id!);
  expect(first.lessonTitle).toBe(title);
  expect(first.totalSteps).toBeGreaterThanOrEqual(6);
  const stepIds = new Set<string>();
  let step = first;
  let questions = 0;
  while (!step.complete) {
    const current = step.current!;
    expect(stepIds.has(current.id)).toBe(false);
    stepIds.add(current.id);
    if (current.type === "present") {
      expect(current.content.trim().length).toBeGreaterThan(80);
      const blocks = await compileTeachingDocument(current.content);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.every(block => block.type === "html")).toBe(true);
      for (const match of current.content.matchAll(/https:\/\/dojo\.foo\/(docs|authoring)([^\s)#]*)/gu)) {
        const path = `${match[1]}${match[2] || "/index"}`;
        expect(existsSync(resolve(sources, "../apps/web/content", `${path}.mdx`)), path).toBe(true);
      }
    }
    else {
      questions += 1;
      expect(current.prompt.trim().length).toBeGreaterThan(20);
      expect(() => advanceInteractiveLesson(root, id!)).toThrow("Answer the question before continuing");
      expect(answerInteractiveQuestion(root, "deliberately incorrect", id!).response?.correct).toBe(false);
      expect(answerInteractiveQuestion(root, current.answers[0]!, id!).response?.correct).toBe(true);
    }
    step = advanceInteractiveLesson(root, id!);
    expect(getInteractiveLesson(root, id!).step).toBe(step.step);
  }
  expect(questions).toBeGreaterThan(0);
  const reopened = resolve(root, "../", `${root.split("/").at(-1)}-reopened`);
  temporary.push(reopened);
  cpSync(root, reopened, { recursive: true });
  expect(getInteractiveLesson(reopened, id!)).toMatchObject({ complete: true, step: first.totalSteps });
  writeFileSync(resolve(installed, "learner-notes.md"), "My own changes\n");
  await expect(add(root, [source, "--master"])).rejects.toThrow("already installed");
  expect(readFileSync(resolve(installed, "learner-notes.md"), "utf8")).toBe("My own changes\n");
  expect(digest(source)).toBe(original);
});
