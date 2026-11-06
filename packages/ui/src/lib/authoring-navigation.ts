import { courseChapters } from "@dojofoo/config/chapters";
import type { AuthoringDraft } from "@dojofoo/agents/service";
import type { ShellEntry, ShellSection } from "@dojofoo/uix/components/app-shell";
import { PlusSignIcon, EvalsIcon } from "@dojofoo/uix/icons";
import { authoringCourseSidebarResources, authoringLessonSidebarResources } from "@/components/authoring-sidebar";
import type { SidebarResource } from "@/components/agents/ai-sidebar";

/** Keep the existing source-file identities and filtering in the Pages sidebar. */
export function authoringNavigation(workspace: AuthoringDraft, onlyCourseFiles = true): ShellSection[] {
  const row = (resource: SidebarResource): ShellEntry => ({
    id: resource.id, label: resource.label,
    ...(resource.children ? { children: resource.children.map(row) } : {}),
  });
  const lessonRows = authoringLessonSidebarResources(workspace, onlyCourseFiles).map((resource, index) => ({ ...row(resource), marker: String(index + 1).padStart(2, "0") }));
  const lessonRow = (id: string) => lessonRows.find(entry => entry.id === `authoring:lesson:${encodeURIComponent(id)}`)!;
  return [
    { id: "authoring-views", items: [{ id: "authoring:evals", label: "Evals", icon: EvalsIcon, note: "Evaluation workspace preview" }] },
    { id: "authoring-course", heading: "Course", layout: "files", items: authoringCourseSidebarResources(workspace, onlyCourseFiles).map(row) },
    { id: "authoring-chapters", heading: "Chapters", layout: "files", items: [...courseChapters(workspace).map((chapter, index) => ({
      id: `authoring:chapter:${encodeURIComponent(chapter.id)}`, label: chapter.title, marker: String(index + 1).padStart(2, "0"),
      children: [...workspace.lessons.filter(lesson => (lesson.chapter?.id ?? "default") === chapter.id).map((lesson, index) => ({ ...lessonRow(lesson.id), marker: String(index + 1).padStart(2, "0") })),
        { id: `authoring:add-lesson:${encodeURIComponent(chapter.id)}`, label: "New lesson", icon: PlusSignIcon }],
    })), { id: "authoring:new-chapter", label: "New chapter", icon: PlusSignIcon }] },
  ];
}
