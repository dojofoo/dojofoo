import type { AuthoringWorkspace } from "@dojofoo/authoring/service";
import { describe, expect, it } from "vitest";
import {
  authoringFiles,
  authoringFileUrl,
  isSaveShortcut,
} from "./authoring";
import { authoringSidebarSelection, authoringCourseSidebarResources, authoringLessonSidebarResources } from "@/components/authoring-sidebar";

const workspace: AuthoringWorkspace = {
  root: "/tmp/course",
  style: "katas",
  name: "Course",
  description: "Description",
  manifestSource: "name: course\n",
  courseGuidance: "# Course\n",
  rootFiles: [
    { path: "dojo.yaml", label: "dojo.yaml", content: "name: course\n" },
    { path: "DOJO.md", label: "DOJO.md", content: "# Course\n" },
  ],
  language: "TypeScript",
  issues: [],
  courseChecks: [],
  sessionId: "session",
  messages: [],
  lessons: [{
    id: "001-first",
    title: "First",
    description: "Practice one thing.",
    senseiPath: "src/001-first/SENSEI.md",
    sensei: "# Sensei\n",
    files: [
      { path: "src/001-first/SENSEI.md", label: "SENSEI.md", content: "# Sensei\n" },
      { path: "src/001-first/solution.ts", label: "solution.ts", content: "" },
      { path: "src/001-first/solution.test.ts", label: "solution.test.ts", content: "" },
    ],
    hasSensei: true,
    evalPaths: [],
    checks: [],
  }],
};

describe("authoring workspace files", () => {
  it("filters essentials without losing full-tree files or duplicating lesson directories", () => {
    const draft = { ...workspace, rootFiles: [...workspace.rootFiles,
      { path: "package.json", label: "package.json", content: "{}" },
      { path: ".agents/skills/course/SKILL.md", label: "SKILL.md", content: "" },
    ], lessons: [{ ...workspace.lessons[0], templatePath: "src/001-first/exercise.py", testPath: "src/001-first/test_exercise.py", files: [...workspace.lessons[0].files,
      { path: "src/001-first/exercise.py", label: "exercise.py", content: "" },
      { path: "src/001-first/test_exercise.py", label: "test_exercise.py", content: "" },
      { path: "src/001-first/eval.yaml", label: "eval.yaml", content: "" },
    ] }] };
    expect(authoringCourseSidebarResources(draft)[0].children?.map((file) => file.label)).toEqual(["dojo.yaml", "DOJO.md"]);
    expect(authoringCourseSidebarResources(draft, false)[0].children?.map((file) => file.label)).toContain("package.json");
    const lessonFiles = authoringLessonSidebarResources(draft)[0].children!;
    expect(lessonFiles.map((file) => file.label)).toEqual(["SENSEI.md", "exercise.py", "test_exercise.py"]);
    expect(lessonFiles.every((file) => file.kind === "file")).toBe(true);
    expect(authoringLessonSidebarResources(draft, false)[0].children?.map((file) => file.label)).toContain("eval.yaml");
  });
  it("maps course and lesson UI tabs directly to source-of-truth files", () => {
    expect(authoringFiles(workspace, null).map(({ path }) => path)).toEqual([
      "dojo.yaml",
      "DOJO.md",
    ]);
    expect(authoringFiles(workspace, workspace.lessons[0]).map(({ path }) => path)).toEqual([
      "src/001-first/SENSEI.md",
      "src/001-first/solution.ts",
      "src/001-first/solution.test.ts",
    ]);
    expect(authoringFileUrl("src/001 first/KATA.md"))
      .toBe("/api/authoring/files/src/001%20first/KATA.md");
  });

  it("captures the platform save shortcut without capturing an unmodified S key", () => {
    expect(isSaveShortcut({ ctrlKey: false, key: "s", metaKey: true })).toBe(true);
    expect(isSaveShortcut({ ctrlKey: true, key: "S", metaKey: false })).toBe(true);
    expect(isSaveShortcut({ ctrlKey: false, key: "s", metaKey: false })).toBe(false);
  });

  it("resolves sidebar resource selections without coupling files to row labels", () => {
    expect(authoringSidebarSelection(
      workspace,
      "authoring:course:file:DOJO.md",
    )).toEqual({ scope: "course", path: "DOJO.md" });
    expect(authoringSidebarSelection(
      workspace,
      "authoring:lesson:001-first:file:src%2F001-first%2FSENSEI.md",
    )).toEqual({
      scope: "lesson",
      lessonId: "001-first",
      path: "src/001-first/SENSEI.md",
    });
  });
});
