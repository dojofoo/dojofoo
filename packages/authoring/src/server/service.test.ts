import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { scaffoldAuthoringWorkspace } from "../scaffold";
import { writeAuthoringFile } from "./files";
import { createAuthoringLesson, createAuthoringChapter, renameAuthoringChapter, readAuthoringDraft, updateAuthoringAppearance, renameAuthoringLesson } from "./service";
import { readLessonMaterial } from "../evaluation/material";
import { kataTestTemplate } from "@dojofoo/config";

describe("authoring service", () => {
  it("starts in Default and splits chapters without moving or renaming existing lessons", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-chapter-split-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    scaffoldAuthoringWorkspace({ root, name: "One course", style: "katas" });
    const before = readAuthoringDraft(root);
    expect(before.chapters).toMatchObject([{ id: "default", title: "Default", path: "src", intro: { path: "src/INTRO.md" } }]);
    expect(before.lessons.every(lesson => lesson.chapter?.id === "default")).toBe(true);
    const chapterId = createAuthoringChapter(root);
    renameAuthoringChapter(root, "default", "Foundations");
    const lessonId = createAuthoringLesson(root, "Advanced lesson", chapterId);
    const after = readAuthoringDraft(root);
    expect(after.chapters?.map(chapter => chapter.title)).toEqual(["Foundations", "New chapter"]);
    for (const original of before.lessons) expect(after.lessons.find(lesson => lesson.id === original.id)).toMatchObject({ id: original.id, templatePath: original.templatePath, chapter: { id: "default", title: "Foundations" } });
    expect(after.lessons.find(lesson => lesson.id === lessonId)?.chapter?.id).toBe(chapterId);
    expect(after.intro?.path).toBe("README.md");
    expect(after.chapters?.find(chapter => chapter.id === chapterId)?.intro?.path).toBe(`src/${chapterId}/INTRO.md`);
    expect(after.lessons.find(lesson => lesson.id === lessonId)?.intro?.path).toBe(`src/${chapterId}/${lessonId}/INTRO.md`);
    expect(after.rootFiles.find(file => file.label === "package.json")?.courseFile).toBe(false);
    const material = await readLessonMaterial(root, [lessonId]);
    expect(Object.keys(material)).toContain(after.lessons.find(lesson => lesson.id === lessonId)!.senseiPath);
    for (const original of before.lessons) expect(Object.keys(material)).not.toContain(original.senseiPath);
    expect(createAuthoringChapter(root)).not.toBe(chapterId);
    expect(after.issues).not.toContain("Use chapters or katas, not both");
  });

  it("persists card appearance with course metadata and preserves authored comments", () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-card-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    scaffoldAuthoringWorkspace({ root, name: "Card course", style: "katas" });
    const original = readFileSync(resolve(root, "dojo.yaml"), "utf8");
    writeAuthoringFile(root, "dojo.yaml", original + "\n# Keep the author note\nauthor: Course author\nrepository: example/course\nappearance:\n  hue: 120\n  shader: waves\n");
    updateAuthoringAppearance(root, { hue: 280, color: "#12345680" });
    expect(readAuthoringDraft(root)).toMatchObject({ author: "Course author", repository: "example/course", appearance: { hue: 280, color: "#12345680", shader: "waves" } });
    expect(readFileSync(resolve(root, "dojo.yaml"), "utf8")).toContain("# Keep the author note");
    const saved = readFileSync(resolve(root, "dojo.yaml"), "utf8");
    for (const appearance of [{ color: "invalid" }, { hue: -1 }, { hue: 361 }, { shader: "unknown" }, { background: "red" }]) {
      expect(() => updateAuthoringAppearance(root, appearance)).toThrow();
      expect(readFileSync(resolve(root, "dojo.yaml"), "utf8")).toBe(saved);
    }
  });

  it("keeps chapters and lesson identities when authoring and renaming inside a chapter", () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-chapter-author-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    scaffoldAuthoringWorkspace({ root, name: "Chapter course", style: "katas" });
    writeAuthoringFile(root, "dojo.yaml", "name: Chapter course\nversion: 1.0.0\ndescription: One course\ntest: echo ok\nchapters:\n  - id: foundations\n    title: Foundations\n    path: src/foundations\n    lessons: []\n");
    const id = createAuthoringLesson(root, "First lesson", "foundations");
    renameAuthoringLesson(root, id, "Renamed lesson");
    expect(readAuthoringDraft(root)).toMatchObject({ chapters: [{ id: "foundations", title: "Foundations" }], lessons: [{ id, title: "Renamed lesson", chapter: { id: "foundations" }, templatePath: `src/foundations/${id}/kata.ts` }] });
    expect(readFileSync(resolve(root, "dojo.yaml"), "utf8")).not.toContain("katas:");
    expect(() => createAuthoringLesson(root, "Wrong chapter", "missing")).toThrow("existing chapter");
  });

  it("keeps both lessons when creation requests arrive together", async () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-concurrent-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    scaffoldAuthoringWorkspace({ root, name: "Concurrent lessons", style: "katas" });
    await Promise.all([createAuthoringLesson(root, "First lesson"), createAuthoringLesson(root, "Second lesson")]);
    expect(readAuthoringDraft(root).lessons.map(lesson => lesson.title)).toEqual(["First lesson", "Second lesson"]);
  });
  it.each([
    ["src/first/kata.ts", "src/first/kata.test.ts"],
    ["src/first/solution.ts", "src/first/solution.test.ts"],
    ["src/first/kata.browser.ts", "src/first/kata.test.browser.ts"],
    ["src/first/kata", "src/first/kata.test"],
  ])("shares production test naming for %s", (template, expected) => {
    expect(kataTestTemplate(template)).toBe(expected);
  });
  it("creates kata files that the production resolver recognizes without treating a test path as a command", () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-kata-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    scaffoldAuthoringWorkspace({ root, name: "Kata naming", style: "katas" });
    const id = createAuthoringLesson(root, "First lesson");
    const lesson = readAuthoringDraft(root).lessons[0];
    expect(lesson.templatePath).toBe(`src/${id}/kata.ts`);
    expect(lesson.testPath).toBe(`src/${id}/kata.test.ts`);
    expect(readFileSync(resolve(root, "dojo.yaml"), "utf8")).not.toContain(`test: src/${id}`);
  });
  it("starts every new lesson with its basic evals in place", () => {
    const root = mkdtempSync(resolve(tmpdir(), "dojofoo-authoring-evals-"));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));
    scaffoldAuthoringWorkspace({ root, name: "Evals", style: "katas" });
    const id = createAuthoringLesson(root, "First lesson");
    const lesson = readAuthoringDraft(root).lessons[0]!;
    expect(lesson.sensei).toMatch(/^# First lesson\n/u);
    expect(readFileSync(resolve(root, `src/${id}/kata.test.ts`), "utf8")).toContain("it.todo(");
    const findings = Object.fromEntries(lesson.checks.map(check => [check.id, check.findings?.join(" ")]));
    expect(findings.sensei).toContain("placeholders");
    expect(findings.scaffold).toContain("todo");
    writeAuthoringFile(root, `src/${id}/kata.test.ts`, 'it("returns the largest", () => {});');
    expect(readAuthoringDraft(root).lessons[0]!.checks.find(check => check.id === "scaffold")?.ready).toBe(true);
  });
});
