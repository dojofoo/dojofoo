import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AuthoringDraft } from "@dojofoo/authoring/service";
import { useState } from "react";
import { AuthoringSidebar } from "./authoring-sidebar";

const files = (paths: string[]) =>
  paths.map((path) => ({ path, label: path.split("/").at(-1)!, content: "" }));
const workspace: AuthoringDraft = {
  root: "/tmp/sidebar-fixture",
  name: "Example course",
  style: "katas",
  language: "TypeScript",
  description: "",
  manifestSource: "",
  courseGuidance: "",
  issues: [],
  courseChecks: [],
  rootFiles: files([
    "dojo.yaml",
    "DOJO.md",
    "package.json",
    ".agents/skills/course/SKILL.md",
  ]),
  lessons: [
    {
      id: "001-first",
      title: "First lesson",
      description: "",
      sensei: "",
      hasSensei: true,
      senseiPath: "src/001-first/SENSEI.md",
      templatePath: "src/001-first/kata.ts",
      testPath: "src/001-first/kata.test.ts",
      evalPaths: [],
      checks: [],
      files: files([
        "src/001-first/SENSEI.md",
        "src/001-first/kata.ts",
        "src/001-first/kata.test.ts",
        "src/001-first/eval.yaml",
      ]),
    },
  ],
};
export default {
  title: "Components/Authoring Sidebar",
  component: AuthoringSidebar,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AuthoringSidebar>;
export const FileFilter: StoryObj = { render: () => <Fixture /> };
function Fixture() {
  const [draft, setDraft] = useState(workspace);
  const [courseExpanded, setCourseExpanded] = useState(true);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(
    "001-first",
  );
  const [active, setActive] = useState("dojo.yaml");
  const scope = active.startsWith("src/") ? "lesson" : "course";
  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside className="w-72">
        <AuthoringSidebar
          workspace={draft}
          activeFilePath={active}
          busy={false}
          scope={scope}
          selectedLessonId="001-first"
          courseExpanded={courseExpanded}
          expandedLessonId={expandedLessonId}
          onCourseExpandedChange={setCourseExpanded}
          onLessonExpandedChange={setExpandedLessonId}
          onSelectRootFile={setActive}
          onSelectLessonFile={(_, path) => setActive(path)}
          onAddLesson={() => {}}
          onRenameCourse={(name) =>
            setDraft((current) => ({ ...current, name }))
          }
          onRenameLesson={(id, title) =>
            setDraft((current) => ({
              ...current,
              lessons: current.lessons.map((lesson) =>
                lesson.id === id ? { ...lesson, title } : lesson,
              ),
            }))
          }
        />
      </aside>
      <output aria-label="Selected file">{active}</output>
    </div>
  );
}
