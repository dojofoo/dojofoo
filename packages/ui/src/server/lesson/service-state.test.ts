import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readDojoRc } from "@dojofoo/config";
import * as preparation from "@dojofoo/config/project-preparation";
import { execFile } from "node:child_process";
import { checkLesson, dojoLessonContext, dojoLessonFragment, readLesson, readLessonFile, writeLessonFile, writeSolution } from "./service";
import { writeAgent } from "@dojofoo/config/runtime";

// The real CLI unless a test scripts its answer
vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFile: vi.fn(actual.execFile) };
});

const roots: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function freshCourse(): string {
  const root = mkdtempSync(join(tmpdir(), "dojofoo-fresh-course-"));
  roots.push(root);
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({
    currentDojo: "starter",
    currentKata: null,
    editor: "code",
    progress: {},
  }));
  const lesson = resolve(root, ".dojos", "starter", "katas", "001-first");
  mkdirSync(lesson, { recursive: true });
  writeFileSync(resolve(root, ".dojos", "starter", "dojo.yaml"), [
    "name: '@test/starter'",
    "version: 1.0.0",
    "description: A fresh course.",
    "test: echo ok",
    "katas:",
    "  - name: 001-first",
    "    template: katas/001-first/solution.ts",
    "  - name: 002-second",
    "    template: katas/002-second/solution.ts",
  ].join("\n"));
  writeFileSync(resolve(root, ".dojos", "starter", "DOJO.md"), "Teach carefully.");
  writeFileSync(resolve(lesson, "SENSEI.md"), "# First lesson\n\nBegin here.");
  writeFileSync(resolve(lesson, "solution.ts"), "export const answer = 0;\n");
  const second = resolve(root, ".dojos", "starter", "katas", "002-second");
  mkdirSync(second, { recursive: true });
  writeFileSync(resolve(second, "SENSEI.md"), "# Second lesson\n\nContinue here.");
  writeFileSync(resolve(second, "solution.ts"), "export const second = 0;\n");
  writeAgent(root, "opencode");
  return root;
}

describe("fresh lesson state", () => {
  it("carries authored chapter identities into learner navigation without opening an agent session", async () => {
    const root = freshCourse();
    const manifest = resolve(root, ".dojos", "starter", "dojo.yaml");
    writeFileSync(manifest, "name: '@test/starter'\nversion: 1.0.0\ndescription: Chapter course\ntest: echo ok\nchapters:\n  - id: foundations\n    title: Foundations\n    path: katas/001-first\n    lessons:\n      - id: 001-first\n        template: katas/001-first/solution.ts\n  - id: advanced\n    title: Advanced\n    path: katas/002-second\n    lessons:\n      - id: 002-second\n        template: katas/002-second/solution.ts\n");
    const lesson = await readLesson(root, "starter", "001-first");
    expect(lesson?.course?.chapters?.map(chapter => chapter.title)).toEqual(["Foundations", "Advanced"]);
    expect(lesson?.lessons.map(lesson => lesson.chapter?.id)).toEqual(["foundations", "advanced"]);
  });

  it("loads course README and chapter/lesson INTRO prose separately from Sensei guidance", async () => {
    const root = freshCourse();
    const course = resolve(root, ".dojos", "starter");
    writeFileSync(resolve(course, "README.md"), "# Course overview\n\nLearn to make decisions.");
    mkdirSync(resolve(course, "src"));
    writeFileSync(resolve(course, "src/INTRO.md"), "# Default\n\nMeet the first chapter.");
    writeFileSync(resolve(course, "katas/001-first/INTRO.mdx"), "# First lesson\n\nThis is the learner-facing goal.");
    const lesson = await readLesson(root, "starter", "001-first");
    expect(lesson?.course?.intro?.content).toContain("Course overview");
    expect(lesson?.chapter?.intro?.content).toContain("Meet the first chapter");
    expect(lesson?.intro).toMatchObject({ path: "katas/001-first/INTRO.mdx", format: "mdx" });
    expect(lesson?.briefing).toContain("learner-facing goal");
    expect(lesson?.briefing).not.toContain("Begin here");
  });

  it("exposes installed course details for the learner card without starting a session", async () => {
    const root = freshCourse();
    const lesson = await readLesson(root, "starter", "001-first");
    expect(lesson?.course).toMatchObject({ name: "@test/starter", version: "1.0.0", description: "A fresh course.", lessons: 2 });
    expect(lesson?.harness).toBe("opencode");
  });

  it("awaits the normal workspace setup before checking a fresh trial", async () => {
    const root = freshCourse();
    const setup = vi.spyOn(preparation, "prepareWorkspace").mockRejectedValue(new Error("Course setup failed"));
    await expect(checkLesson(root, "starter", "001-first")).rejects.toThrow("Course setup failed");
    expect(setup).toHaveBeenCalledExactlyOnceWith(root);
  });

  it("loads the course named by a route without changing the CLI selection or starting an agent", async () => {
    const root = freshCourse();
    const selection = JSON.stringify({ currentDojo: "another-course", currentKata: "another-lesson", editor: "code", progress: {} });
    writeFileSync(resolve(root, ".dojorc"), selection);
    await expect(readLesson(root, "starter", "001-first")).resolves.toMatchObject({ dojo: "starter", kata: "001-first" });
    expect(readFileSync(resolve(root, ".dojorc"), "utf8")).toBe(selection);
  });

  it("supplies completed lesson context without claiming unseen implementation details", async () => {
    const root = freshCourse();
    const initial = await readLesson(root, "starter", "001-first");
    expect(dojoLessonContext(initial!).course).toEqual({ id: "starter", completedLessons: [] });
    const rc = readDojoRc(root);
    rc.progress = { starter: { completed: ["001-first"], lastActive: "001-first" } };
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify(rc));
    const next = await readLesson(root, "starter", "002-second");
    expect(dojoLessonContext(next!).course).toEqual({
      id: "starter",
      completedLessons: [{ id: "001-first", title: initial!.title, summary: initial!.lessons[0].summary }],
    });
  });

  it("presents the first lesson without requiring mutable current-kata state", async () => {
    const lesson = await readLesson(freshCourse(), "starter", "001-first");

    expect(lesson).toMatchObject({
      kata: "001-first",
      state: "not-started",
      isCurrent: true,
      code: "export const answer = 0;\n",
      starterCode: "export const answer = 0;\n",
    });
  });

  it("gives the sensei authoritative learner code without requiring file inspection", async () => {
    const lesson = await readLesson(freshCourse(), "starter", "001-first");

    expect(dojoLessonContext(lesson!).learner.file).toEqual({
      path: "katas/001-first/solution.ts",
      language: "typescript",
      content: "export const answer = 0;\n",
    });
  });

  it("persists the active lesson when its file is first saved", async () => {
    const root = freshCourse();

    await writeLessonFile(root, "starter", "001-first", "solution", "export const answer = 1;\n");

    expect(readDojoRc(root)).toMatchObject({
      currentKata: "001-first",
      progress: { starter: { completed: [], lastActive: "001-first" } },
    });
    expect(readFileSync(resolve(root, "katas", "001-first", "solution.ts"), "utf8"))
      .toBe("export const answer = 1;\n");
  });

  it("allows only authored fragments from the active lesson", async () => {
    const root = freshCourse();
    const lessonPath = resolve(root, ".dojos", "starter", "katas", "001-first", "SENSEI.md");
    writeFileSync(lessonPath, '# First lesson\n\n<Present id="example">Visible material</Present>');
    const lesson = await readLesson(root, "starter", "001-first");
    expect(lesson).not.toBeNull();

    expect(dojoLessonFragment(lesson!, "example")).toEqual({ fragmentId: "example" });
    expect(() => dojoLessonFragment(lesson!, "invented")).toThrow("Lesson fragment not found");
  });

  describe("a course that is not current", () => {
    const notCurrent = () => {
      const root = freshCourse();
      writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "another-course", currentKata: "another-lesson", editor: "code", progress: {} }));
      return root;
    };

    it("a lesson of a course that is not current is read, written and checked without changing currentDojo", async () => {
      const root = notCurrent();
      await expect(readLesson(root, "starter", "001-first")).resolves.toMatchObject({ dojo: "starter", kata: "001-first" });
      await writeLessonFile(root, "starter", "001-first", "solution", "export const answer = 42;\n");
      expect(readFileSync(resolve(root, "katas/001-first/solution.ts"), "utf8")).toBe("export const answer = 42;\n");
      vi.spyOn(preparation, "prepareWorkspace").mockResolvedValue(undefined as never);
      vi.mocked(execFile).mockImplementationOnce(((_command: string, _args: string[], _options: unknown, done: (error: null, stdout: string) => void) => { done(null, JSON.stringify({ total: 1, passed: 1, failed: 0, tests: [{ name: "answers", status: "passed" }], error: null })); return {}; }) as never);
      const { lesson, observation } = await checkLesson(root, "starter", "001-first");
      expect(vi.mocked(execFile).mock.calls.at(-1)?.[1]).toEqual(expect.arrayContaining(["kata", "001-first", "--check", "--course", "starter", "--reporter=json"]));
      expect(observation.report.complete).toBe(true);
      expect(lesson.result?.complete).toBe(true);
      expect(readDojoRc(root)).toMatchObject({ currentDojo: "another-course", currentKata: "another-lesson" });
    });

    it("writing a non-current course's solution sets its lastActive but not currentKata", async () => {
      const root = notCurrent();
      await writeSolution(root, "starter", "002-second", "export const second = 2;\n");
      expect(readDojoRc(root)).toMatchObject({ currentDojo: "another-course", currentKata: "another-lesson", progress: { starter: { lastActive: "002-second" } } });
      expect(readFileSync(resolve(root, "katas/002-second/solution.ts"), "utf8")).toBe("export const second = 2;\n");
    });

    it("readLesson and readLessonFile never read web.json threads", async () => {
      const root = freshCourse();
      mkdirSync(resolve(root, ".dojo"), { recursive: true });
      writeFileSync(resolve(root, ".dojo/web.json"), JSON.stringify({ version: 4, threads: { "starter/001-first": { sessionId: "missing-thread", harness: "opencode", contractHash: "", aliases: [] } }, results: {}, checkpoints: {} }));
      await expect(readLesson(root, "starter", "001-first")).resolves.toMatchObject({ kata: "001-first", harness: "opencode" });
      await expect(readLessonFile(root, "starter", "001-first", "solution")).resolves.toMatchObject({ attributes: { content: "export const answer = 0;\n" } });
    });
  });
});
