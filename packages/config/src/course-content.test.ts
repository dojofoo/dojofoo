import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { courseContent, ensureCourseContent, readIntroduction } from "./course-content";

it("creates a course README and chapter/lesson INTRO files without replacing authored MDX", () => {
  const root = mkdtempSync(resolve(tmpdir(), "dojo-intros-"));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  const manifest = { name: "One course", chapters: [{ id: "first", title: "Foundations", path: "src/first", lessons: [{ id: "one", title: "First lesson", template: "src/first/one/kata.ts" }] }] };
  expect(courseContent(root, manifest).issues).toHaveLength(3);
  writeFileSync(resolve(root, "README.mdx"), "This is not the course entrypoint.");
  ensureCourseContent(root, manifest);
  expect(readFileSync(resolve(root, "README.md"), "utf8")).toContain("# One course");
  expect(readFileSync(resolve(root, "README.md"), "utf8")).toContain("## Course outline");
  expect(readFileSync(resolve(root, "src/first/one/INTRO.md"), "utf8")).toContain("## Your goal");
  expect(readIntroduction(root)).toMatchObject({ path: "README.md", format: "markdown" });
  expect(readFileSync(resolve(root, "src/first/INTRO.md"), "utf8")).toContain("# Foundations");
  expect(readFileSync(resolve(root, "src/first/one/INTRO.md"), "utf8")).toContain("# First lesson");
  const mdx = "# Authored lesson\n\n<RegexWorkbench input=\"hello\" />";
  rmSync(resolve(root, "src/first/one/INTRO.md"));
  writeFileSync(resolve(root, "src/first/one/INTRO.mdx"), mdx);
  ensureCourseContent(root, manifest);
  expect(courseContent(root, manifest).lessons[0].intro).toMatchObject({ format: "mdx", content: mdx, path: "src/first/one/INTRO.mdx" });
  expect(courseContent(root, manifest).issues).toEqual([]);
  expect(() => readIntroduction(root, resolve(root, "../outside"))).toThrow("inside the course");
});
