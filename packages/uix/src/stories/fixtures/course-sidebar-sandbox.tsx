import { CourseAuthoringSidebar } from "../../components/course-authoring-sidebar";
import { useMemo, useState, type ReactNode } from "react";
import { AuthoringCourseCard } from "../../components/authoring-course-card";
import { BrandLogo } from "../../components/brand-logo";
import { type ShellSection } from "../../components/app-shell";
import { EvalsPanel } from "../../components/evals";
import { Editor, EditorTabs } from "../../containers/editor";
import { AgentChatWorkspace } from "../../containers/learning-workspace";
import { useAuthoringFiles } from "../../hooks/use-authoring-files";
import { EvalsIcon } from "../../lib/icons";
import { CourseComposer } from "../../pages/course-composer";

type SandboxFile = { path: string; label: string; content: string; courseFile?: boolean };
type SandboxChapter = { id: string; title: string; path: string; files: SandboxFile[]; lessons: { id: string; title: string; files: SandboxFile[] }[] };

/** Candidate tree components receive the same fixtures and interactions inside the real shell. */
export type CourseSidebarTreeContext = {
  courseTitle: string;
  chapters: SandboxChapter[];
  courseFiles: SandboxFile[];
  selectedFile: string | null;
  showAllFiles: boolean;
  selectFile: (path: string) => void;
  addChapter: () => void;
  addLesson: (chapterId: string) => void;
  toggleFiles: () => void;
  renameNode: (nodeId: string, title: string) => void;
};

export type CourseSidebarSandboxProps = {
  courseTitle: string;
  chapterCount: number;
  lessonsPerChapter: number;
  sidebarWidth: string;
  showCard: boolean;
  /** Mount an installed tree component here; the surrounding sidebar remains shared UIX. */
  renderTree?: (context: CourseSidebarTreeContext) => ReactNode;
};

function lesson(chapterId: string, index: number) {
  const id = `${chapterId}-lesson-${index + 1}`;
  const title = ["First steps", "Working with files", "Check your work"][index] ?? `Lesson ${index + 1}`;
  return { id, title, files: [
    { path: `src/${id}/INTRO.md`, label: "INTRO.md", content: `# ${title}\n\nExplore one useful idea.\n`, courseFile: true },
    { path: `src/${id}/SENSEI.md`, label: "SENSEI.md", content: `# ${title}\n\nGuide the learner through one useful idea.\n` },
    { path: `src/${id}/kata.ts`, label: "kata.ts", content: "export function answer() {\n  return 0;\n}\n" },
    { path: `src/${id}/kata.test.ts`, label: "kata.test.ts", content: "import { it } from 'vitest';\n\nit.todo('the first useful behavior');\n" },
  ] };
}

/** The sandbox and official authoring route share this sidebar implementation. */
export function CourseTreeExperiment({ context }: { context: CourseSidebarTreeContext }) {
  return <CourseAuthoringSidebar courseTitle={context.courseTitle} courseFiles={context.courseFiles} chapters={context.chapters}
    selectedFile={context.selectedFile} showAllFiles={context.showAllFiles} onToggleFiles={context.toggleFiles}
    onSelectFile={context.selectFile} onAddChapter={context.addChapter} onAddLesson={context.addLesson}
    onRenameChapter={(id, title) => context.renameNode(`chapter:${id}`, title)} onRenameLesson={(id, title) => context.renameNode(`lesson:${id}`, title)} />;
}

export function CourseSidebarSandbox({ courseTitle, chapterCount, lessonsPerChapter, sidebarWidth, showCard, renderTree }: CourseSidebarSandboxProps) {
  const [chapters, setChapters] = useState<SandboxChapter[]>(() => Array.from({ length: chapterCount }, (_, index) => {
    const id = index === 0 ? "default" : `chapter-${index + 1}`;
    return { id, title: index === 0 ? "Default" : `Chapter ${index + 1}`, path: `src/${id}`, files: [{ path: `src/${id}/INTRO.md`, label: "INTRO.md", content: "# Chapter introduction\n", courseFile: true }], lessons: Array.from({ length: lessonsPerChapter }, (_, index) => lesson(id, index)) };
  }));
  const [showAllFiles, setShowAllFiles] = useState(false);
  const [color, setColor] = useState<string>();
  const [evalsOpen, setEvalsOpen] = useState(false);
  const rootFiles = useMemo(() => [
    { path: "README.md", label: "README.md", content: `# ${courseTitle}\n\nLearn to run a dojo.\n`, courseFile: true },
    { path: "dojo.yaml", label: "dojo.yaml", content: `name: ${courseTitle}\nversion: 1.0.0\ndescription: A course to shape together.\n` },
    { path: "DOJO.md", label: "DOJO.md", content: `# ${courseTitle}\n\nTeach one idea at a time.\n` },
    { path: "package.json", label: "package.json", courseFile: false, content: '{\n  "scripts": { "test": "vitest" }\n}\n' },
  ], [courseTitle]);
  const files = useMemo(() => [...rootFiles, ...chapters.flatMap(chapter => [...chapter.files, ...chapter.lessons.flatMap(lesson => lesson.files)])], [rootFiles, chapters]);
  const editor = useAuthoringFiles(files);
  const selectFile = (path: string) => { setEvalsOpen(false); editor.open(path); };
  const addChapter = () => {
    const id = `chapter-${chapters.length + 1}`;
    setChapters(current => [...current, { id, title: "New chapter", path: `src/${id}`, files: [{ path: `src/${id}/INTRO.md`, label: "INTRO.md", content: "# New chapter\n", courseFile: true }], lessons: [] }]);
  };
  const addLesson = (chapterId: string) => {
    const chapter = chapters.find(chapter => chapter.id === chapterId)!;
    const next = { ...lesson(chapterId, chapter.lessons.length), title: "New lesson" };
    setChapters(current => current.map(chapter => chapter.id === chapterId ? { ...chapter, lessons: [...chapter.lessons, next] } : chapter));
    selectFile(next.files[0].path);
  };
  const renameNode = (nodeId: string, title: string) => setChapters(current => current.map(chapter => ({
    ...chapter, title: nodeId === `chapter:${chapter.id}` ? title : chapter.title,
    lessons: chapter.lessons.map(lesson => ({ ...lesson, title: nodeId === `lesson:${lesson.id}` ? title : lesson.title })),
  })));
  const context: CourseSidebarTreeContext = { courseTitle, chapters, courseFiles: rootFiles, selectedFile: editor.tabs.active, showAllFiles, selectFile, addChapter, addLesson, toggleFiles: () => setShowAllFiles(value => !value), renameNode };

  // Extension point: pass renderTree={context => <InstalledTree ... />} to replace this region only.
  const tree: ShellSection[] = [{ id: "candidate-tree", items: [], before: renderTree ? renderTree(context) : <CourseTreeExperiment context={context} /> }];
  if (showCard) tree[0].before = <>
    <div className="lj-course mt-2! mb-2!"><AuthoringCourseCard course={{ title: courseTitle, version: "1.0.0", language: "TypeScript", chapters: chapters.length,
      lessons: chapters.reduce((count, chapter) => count + chapter.lessons.length, 0), art: { hue: 280, color, glyph: "" } }} onColorChange={setColor} /></div>
    {tree[0].before}
  </>;
  const file = editor.activeFile;

  return <div className="h-dvh overflow-hidden"><AgentChatWorkspace
    workspace={courseTitle} sidebarWidth={sidebarWidth} user={{ name: "Anonymous" }} showNews={false} showOnboarding={false}
    brand={<BrandLogo className="aspect-[2567/1211] h-6 w-auto" />}
    navigation={[{ id: "views", items: [{ id: "evals", label: "Evals", icon: EvalsIcon }] }, ...tree]}
    active={evalsOpen ? "evals" : `file:${editor.tabs.active}`} navigationTransition={false}
    onNavigate={id => {
      if (id === "evals") setEvalsOpen(true);
      else if (id === "add-chapter") addChapter();
      else if (id.startsWith("add-lesson:")) addLesson(id.slice(11));
      else if (id.startsWith("file:")) selectFile(id.slice(5));
    }}
    crumbs={[{ label: courseTitle }]} contentKind="code" askAssistant={false} evals={<EvalsPanel />} evalsOpen={evalsOpen} onEvalsOpenChange={setEvalsOpen}
    editor={<Editor flush tabs={<EditorTabs mode="authoring" tabs={editor.tabs.paths.map(path => ({ path, label: files.find(file => file.path === path)?.label ?? path, dirty: editor.dirty(files.find(file => file.path === path)!) }))}
      active={editor.tabs.active} label="Course files" onSelect={selectFile} onClose={editor.close} onMove={editor.move} />}>
      {file && <pre aria-label="File content" className="m-0 h-full overflow-auto p-4 font-mono text-[13px] leading-6"><code>{file.content}</code></pre>}
    </Editor>}
    header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Kyoshi</b></span>}
    composer={<CourseComposer authoring placeholder="Shape your course with Kyoshi…" onSend={() => {}} />} />
  </div>;
}
