import type { ReactNode } from "react";
import { BeardedFileIcon } from "./bearded-file-icon";
import { Dropdown, Icon } from "./app-shell";
import { FileTree, type FileNode } from "./creance/file-tree/FileTree";
import { MoreHorizontalIcon } from "../lib/icons";

export type AuthoringSidebarFile = { path: string; label: string; courseFile?: boolean };
export type AuthoringSidebarChapter = { id: string; title: string; path: string; files?: AuthoringSidebarFile[];
  lessons: { id: string; title: string; files: AuthoringSidebarFile[]; status?: ReactNode }[] };
export type CourseAuthoringSidebarProps = {
  courseTitle: string;
  courseFiles: AuthoringSidebarFile[];
  chapters: AuthoringSidebarChapter[];
  selectedFile: string | null;
  showAllFiles: boolean;
  disabled?: boolean;
  card?: ReactNode;
  courseMenu?: ReactNode;
  onToggleFiles: () => void;
  onSelectFile: (path: string) => void;
  onAddChapter: () => void;
  onAddLesson: (chapterId: string) => void;
  onRenameChapter: (chapterId: string, title: string) => void;
  onRenameLesson: (lessonId: string, title: string) => void;
};

/** The authoring-only file tree. Learning continues to use the chapter/lesson navigation. */
export function CourseAuthoringSidebar({ courseFiles, chapters, selectedFile, showAllFiles, disabled, card, courseMenu,
  onToggleFiles, onSelectFile, onAddChapter, onAddLesson, onRenameChapter, onRenameLesson }: CourseAuthoringSidebarProps) {
  const fileNodes = (files: AuthoringSidebarFile[], base = ""): FileNode[] => {
    const nodes: FileNode[] = [];
    const ordered = files.filter(file => showAllFiles || file.courseFile !== false).toSorted((a, b) => {
      const priority = (file: AuthoringSidebarFile) => /^(README\.md|INTRO\.mdx?)$/.test(file.label) ? 0 : file.courseFile === false ? 2 : 1;
      return priority(a) - priority(b) || a.path.localeCompare(b.path);
    });
    for (const file of ordered) {
      const parts = (base && file.path.startsWith(`${base}/`) ? file.path.slice(base.length + 1) : file.path).split("/");
      let siblings = nodes;
      parts.forEach((name, index) => {
        if (index === parts.length - 1) siblings.push({ id: `file:${file.path}`, name: file.label,
          muted: file.courseFile === false, icon: <BeardedFileIcon path={file.path} /> });
        else {
          const id = `folder:${base}/${parts.slice(0, index + 1).join("/")}`;
          let folder = siblings.find(node => node.id === id);
          if (!folder) { folder = { id, name, children: [] }; siblings.push(folder); }
          siblings = folder.children!;
        }
      });
    }
    return nodes;
  };
  const nodes: FileNode[] = [...fileNodes(courseFiles), {
    id: "chapters", name: "Chapters",
    // Material Design Icons / Pictogrammers (Apache-2.0), supplied by the user.
    icon: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0 text-(--brand)"><path fill="currentColor" d="M8.82 17L13 19.28V22H6c-1.11 0-2-.89-2-2V4a2 2 0 0 1 2-2h1v7l2.5-1.5L12 9V2h6a2 2 0 0 1 2 2v8.54l-1.5-.82zM24 17l-5.5-3l-5.5 3l5.5 3zm-9 2.09v2L18.5 23l3.5-1.91v-2L18.5 21z" /></svg>,
    children: chapters.map((chapter, index) => ({ id: `chapter:${chapter.id}`, name: chapter.title, marker: String(index + 1).padStart(2, "0"), children: [
      ...fileNodes(chapter.files ?? [], chapter.path),
      ...chapter.lessons.map((lesson, index) => ({ id: `lesson:${lesson.id}`, name: lesson.title, marker: String(index + 1).padStart(2, "0"), adornment: lesson.status,
        children: fileNodes(lesson.files, lesson.files[0]?.path.split("/").slice(0, -1).join("/")) })),
    ] })),
  }];
  return <section aria-label="Course navigation">
    {card && <div className="lj-course mt-2! mb-2!">{card}</div>}
    <div className="ui-as-side__label mt-2 items-center! py-0! pr-0!"><span className="ui-as-side__label-text">Course</span>
      <span className="ml-auto">{courseMenu ?? <Dropdown align="end" title="Course files" items={[{
        label: showAllFiles ? "Show only course files" : "Show all files", checked: showAllFiles, onSelect: onToggleFiles,
      }]} trigger={({ open, toggle }) => <button type="button" className="ui-as-icon-btn" aria-label="Course actions" aria-expanded={open} onClick={toggle}><Icon icon={MoreHorizontalIcon} size={15} /></button>} />}</span>
    </div>
    <FileTree nodes={nodes} label="Course files and chapters" selected={selectedFile ? `file:${selectedFile}` : null}
      defaultExpanded={["chapters", ...chapters.map(chapter => `chapter:${chapter.id}`), ...(chapters[0]?.lessons[0] ? [`lesson:${chapters[0].lessons[0].id}`] : [])]}
      onSelect={node => { if (node.id.startsWith("file:")) onSelectFile(node.id.slice(5)); }}
      canRename={node => !disabled && (node.id.startsWith("chapter:") || node.id.startsWith("lesson:"))}
      onRename={(node, title) => node.id.startsWith("chapter:") ? onRenameChapter(node.id.slice(8), title) : onRenameLesson(node.id.slice(7), title)}
      renderActions={(node, actions) => {
        const container = node.id === "chapters", chapter = node.id.startsWith("chapter:"), lesson = node.id.startsWith("lesson:");
        if (!container && !chapter && !lesson) return null;
        return <Dropdown align="end" items={[
          ...(container || chapter ? [{ label: container ? "New chapter" : "New lesson", onSelect: () => container ? onAddChapter() : onAddLesson(node.id.slice(8)) }] : []),
          ...(chapter || lesson ? [{ label: "Rename", onSelect: actions.rename }] : []),
        ]} trigger={({ open, toggle }) => <button type="button" className="ui-as-icon-btn" disabled={disabled} aria-label={`${node.name} actions`} aria-expanded={open} onClick={toggle}><Icon icon={MoreHorizontalIcon} size={15} /></button>} />;
      }} />
  </section>;
}
