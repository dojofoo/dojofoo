import type { AuthoringDraft } from "@dojofoo/authoring/service";
import type { ShellEntry, ShellSection } from "@dojofoo/uix/components/app-shell";
import { PlusSignIcon } from "@dojofoo/uix/icons";
import { authoringCourseSidebarResources, authoringLessonSidebarResources } from "@/components/authoring-sidebar";
import type { SidebarResource } from "@/components/agents/ai-sidebar";

/** Keep the existing source-file identities and filtering in the Pages sidebar. */
export function authoringNavigation(workspace: AuthoringDraft, onlyCourseFiles = true): ShellSection[] {
  const row = (resource: SidebarResource): ShellEntry => ({
    id: resource.id, label: resource.label,
    ...(resource.children ? { children: resource.children.map(row) } : {}),
  });
  return [
    { id: "authoring-courses", heading: "Courses", layout: "files", items: authoringCourseSidebarResources(workspace, onlyCourseFiles)
      .map(resource => ({ ...row(resource), marker: "01" })) },
    { id: "authoring-lessons", heading: "Lessons", layout: "files", items: [
      ...authoringLessonSidebarResources(workspace, onlyCourseFiles).map((resource, index) => ({ ...row(resource), marker: String(index + 1).padStart(2, "0") })),
      { id: "authoring:add-lesson", label: "New lesson", icon: PlusSignIcon },
    ], empty: workspace.lessons.length ? undefined : "Shape the course with Kyoshi. Lessons appear here as they are authored." },
  ];
}
