import type { AuthoringDraft } from "@dojofoo/authoring/service";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { AISidebar, type SidebarResource } from "./agents/ai-sidebar";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "./motion/popover-morph";

type AuthoringFile = AuthoringDraft["rootFiles"][number];

export function AuthoringSidebar({
  activeFilePath,
  busy,
  courseExpanded,
  expandedLessonId,
  onAddLesson,
  onCourseExpandedChange,
  onLessonExpandedChange,
  onRenameCourse,
  onRenameLesson,
  onSelectLessonFile,
  onSelectRootFile,
  scope,
  selectedLessonId,
  workspace,
}: {
  activeFilePath: string;
  busy: boolean;
  courseExpanded: boolean;
  expandedLessonId: string | null;
  onAddLesson: () => void;
  onCourseExpandedChange: (expanded: boolean) => void;
  onLessonExpandedChange: (lessonId: string | null) => void;
  onRenameCourse: (title: string) => void;
  onRenameLesson: (lessonId: string, title: string) => void;
  onSelectLessonFile: (
    lesson: AuthoringDraft["lessons"][number],
    path: string,
  ) => void;
  onSelectRootFile: (path: string) => void;
  scope: "course" | "lesson";
  selectedLessonId: string | null;
  workspace: AuthoringDraft;
}) {
  const courseResourceId = "authoring:course";
  const lessonResourceIds = workspace.lessons.map((lesson) =>
    authoringLessonResourceId(lesson.id),
  );
  const activeId = scope === "course"
    ? authoringCourseFileResourceId(activeFilePath)
    : selectedLessonId
      ? authoringLessonFileResourceId(selectedLessonId, activeFilePath)
      : null;

  const selectResource = (id: string) => {
    const selection = authoringSidebarSelection(workspace, id);
    if (!selection) return;
    if (selection.scope === "course") {
      onSelectRootFile(selection.path);
      return;
    }
    const lesson = workspace.lessons.find(({ id: lessonId }) =>
      lessonId === selection.lessonId,
    );
    if (lesson) onSelectLessonFile(lesson, selection.path);
  };

  return (
    <>
      <SidebarHeading>Course</SidebarHeading>
      <div className="border-b border-dashed">
        <AISidebar
          activeId={scope === "course" ? activeId : null}
          ariaLabel="Course files"
          className="[&_[aria-level='1']]:min-h-10 [&_[aria-level='1']]:font-mono [&_[aria-level='1']]:font-medium [&_[aria-level='2']]:font-mono [&_[aria-level='2']]:text-xs"
          expandedIds={courseExpanded ? [courseResourceId] : []}
          items={authoringCourseSidebarResources(workspace)}
          onActiveChange={selectResource}
          onExpandedIdsChange={(ids) =>
            onCourseExpandedChange(ids.includes(courseResourceId))
          }
          onRename={(item, title) => {
            if (item.id === courseResourceId) onRenameCourse(title);
          }}
          renderIcon={(item) => item.id === courseResourceId ? (
            <span className="font-mono text-[10px] text-muted-foreground">
              01
            </span>
          ) : undefined}
          reorderable={false}
          rootPaddingLeft={16}
          rowClassName="min-h-8 rounded-none"
        />
      </div>

      <SidebarHeading
        action={{
          disabled: busy,
          label: "Add lesson",
          onSelect: onAddLesson,
        }}
        className="mt-8"
      >
        Lessons
      </SidebarHeading>
      <div className="border-b border-dashed">
        <AISidebar
          activeId={scope === "lesson" ? activeId : null}
          ariaLabel="Lesson files"
          className="[&_[aria-level='1']]:min-h-10 [&_[aria-level='1']]:font-mono [&_[aria-level='1']]:font-medium [&_[aria-level='2']]:font-mono [&_[aria-level='2']]:text-xs"
          expandedIds={expandedLessonId
            ? [authoringLessonResourceId(expandedLessonId)]
            : []}
          items={authoringLessonSidebarResources(workspace)}
          onActiveChange={selectResource}
          onExpandedIdsChange={(ids) => {
            const expanded = ids.filter((id) => lessonResourceIds.includes(id));
            const current = authoringLessonResourceId(expandedLessonId ?? "");
            const next = expanded.find((id) => id !== current) ?? expanded[0];
            const lesson = workspace.lessons.find(({ id }) =>
              authoringLessonResourceId(id) === next,
            );
            onLessonExpandedChange(lesson?.id ?? null);
          }}
          onRename={(item, title) => {
            const lesson = workspace.lessons.find(({ id }) =>
              authoringLessonResourceId(id) === item.id,
            );
            if (lesson) onRenameLesson(lesson.id, title);
          }}
          renderIcon={(item) => {
            const index = workspace.lessons.findIndex(({ id }) =>
              authoringLessonResourceId(id) === item.id,
            );
            return index < 0 ? undefined : (
              <span className="font-mono text-[10px] text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
            );
          }}
          reorderable={false}
          rootPaddingLeft={16}
          rowClassName="min-h-8 rounded-none"
        />
        {workspace.lessons.length === 0 ? (
          <div className="px-4 py-3 font-prose text-[13px] leading-5 text-muted-foreground">
            Shape the course with Kyoshi. Lessons will appear here as they are
            authored.
          </div>
        ) : null}
      </div>
    </>
  );
}

function SidebarHeading({
  action,
  children,
  className,
}: {
  action?: { disabled?: boolean; label: string; onSelect: () => void };
  children: string;
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className={cn(
        "group/sidebar-heading flex min-h-10 items-center border-b border-dashed pl-5 pr-3",
        className,
      )}
    >
      <h2 className="min-w-0 flex-1 font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {children}
      </h2>
      {action ? (
        <MorphPopover open={menuOpen} onOpenChange={setMenuOpen}>
          <MorphPopoverTrigger>
            <button
              aria-label={`${children} actions`}
              className="grid size-7 place-items-center rounded-lg text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-foreground/5 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/sidebar-heading:opacity-100 disabled:pointer-events-none disabled:opacity-40"
              disabled={action.disabled}
              type="button"
            >
              <MoreHorizontal aria-hidden="true" className="size-4" />
            </button>
          </MorphPopoverTrigger>
          <MorphPopoverContent
            align="end"
            className="w-40 p-1.5"
            radius={12}
            side="bottom"
            sideOffset={8}
          >
            <button
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              disabled={action.disabled}
              onClick={() => {
                setMenuOpen(false);
                action.onSelect();
              }}
              type="button"
            >
              <Plus aria-hidden="true" className="size-3.5 shrink-0" />
              {action.label}
            </button>
          </MorphPopoverContent>
        </MorphPopover>
      ) : null}
    </div>
  );
}

function authoringCourseSidebarResources(
  workspace: AuthoringDraft,
): SidebarResource[] {
  return [{
    id: "authoring:course",
    kind: "project",
    label: workspace.name || "Untitled dojo",
    children: authoringFileSidebarResources(
      workspace.rootFiles,
      authoringCourseFileResourceId,
    ),
  }];
}

function authoringLessonSidebarResources(
  workspace: AuthoringDraft,
): SidebarResource[] {
  return workspace.lessons.map((lesson) => ({
    id: authoringLessonResourceId(lesson.id),
    kind: "project",
    label: lesson.title,
    children: lesson.files.map((file) => ({
      id: authoringLessonFileResourceId(lesson.id, file.path),
      kind: "file" as const,
      label: file.label,
    })),
  }));
}

type AuthoringTreeNode = {
  children: AuthoringTreeNode[];
  name: string;
  path: string;
  type: "file" | "folder";
};

function authoringFileSidebarResources(
  files: AuthoringFile[],
  resourceId: (path: string) => string,
): SidebarResource[] {
  const convert = (node: AuthoringTreeNode): SidebarResource => ({
    id: resourceId(node.path),
    kind: node.type,
    label: node.name,
    children: node.children.length > 0
      ? node.children.map(convert)
      : undefined,
  });
  return authoringTree(files).map(convert);
}

function authoringTree(files: AuthoringFile[]): AuthoringTreeNode[] {
  const root: AuthoringTreeNode[] = [];
  for (const file of files) {
    const parts = file.path.split("/");
    let nodes = root;
    parts.forEach((name, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const type = index === parts.length - 1 ? "file" : "folder";
      let node = nodes.find((entry) => entry.path === path);
      if (!node) {
        node = { children: [], name, path, type };
        nodes.push(node);
      }
      nodes = node.children;
    });
  }
  return root;
}

function authoringLessonResourceId(lessonId: string): string {
  return `authoring:lesson:${encodeURIComponent(lessonId)}`;
}

function authoringCourseFileResourceId(path: string): string {
  return `authoring:course:file:${encodeURIComponent(path)}`;
}

function authoringLessonFileResourceId(
  lessonId: string,
  path: string,
): string {
  return `authoring:lesson:${encodeURIComponent(lessonId)}:file:${encodeURIComponent(path)}`;
}

export function authoringSidebarSelection(
  workspace: AuthoringDraft,
  resourceId: string,
): { scope: "course"; path: string } | {
  scope: "lesson";
  lessonId: string;
  path: string;
} | null {
  const rootFile = workspace.rootFiles.find(({ path }) =>
    authoringCourseFileResourceId(path) === resourceId,
  );
  if (rootFile) return { scope: "course", path: rootFile.path };

  for (const lesson of workspace.lessons) {
    const file = lesson.files.find(({ path }) =>
      authoringLessonFileResourceId(lesson.id, path) === resourceId,
    );
    if (file) {
      return { scope: "lesson", lessonId: lesson.id, path: file.path };
    }
  }
  return null;
}
