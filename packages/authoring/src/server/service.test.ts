import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { scaffoldAuthoringWorkspace } from "../scaffold";
import { writeAuthoringFile } from "./files";
import { createAuthoringLesson, readAuthoringDraft } from "./service";
import { kataTestTemplate } from "@dojofoo/config";

describe("authoring service", () => {
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
