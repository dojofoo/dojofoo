import type { AuthoringEvalReport } from "@dojofoo/authoring/server";
import type { AuthoringDraft, AuthoringWorkspace } from "@dojofoo/authoring/service";
import { authoringMessageText, isAuthoringBootstrapMessage } from "@dojofoo/authoring/types";
import { createFileRoute } from "@tanstack/react-router";
import { fetchServerSentEvents, useChat, type UIMessage } from "@tanstack/ai-react";
import { ArrowRight, Check, Circle, ExternalLink, Pencil, Play, Plus, RefreshCw } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AuthoringFilePreview } from "@/components/authoring-file-preview";
import { AuthoringSidebar } from "@/components/authoring-sidebar";
import { AuthoringChat } from "@/components/authoring-chat";
import { EveAuthoringChat } from "@/components/eve-authoring-chat";
import { CourseContent } from "@/components/course-content";
import { Button } from "@dojofoo/ui/button";
import { CourseLessonLayout, CourseLessonNavigation } from "@dojofoo/ui/course-lesson-layout";
import { ScrollArea } from "@dojofoo/ui/scroll-area";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { FileTree, FileTreeFile, FileTreeFolder } from "@dojofoo/uix/components/motion/file-tree";

const CodeEditor = lazy(() => import("@/components/code-editor"));

type ReportResponse = { report: AuthoringEvalReport | null; root: string };
type AuthoringFile = { content: string; label: string; path: string };
const USE_AI_AUTHORING_SIDEBAR = true;

export const Route = createFileRoute("/authoring")({
  component: AuthoringPage,
  validateSearch: (search: Record<string, unknown>): { workspace?: string; session?: string } => ({
    ...(typeof search.workspace === "string" ? { workspace: search.workspace } : {}),
    ...(typeof search.session === "string" ? { session: search.session } : {}),
  }),
});

function AuthoringPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [backend, setBackend] = useState<"acp" | "eve">();
  const [workspace, setWorkspace] = useState<AuthoringDraft | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [courseExpanded, setCourseExpanded] = useState(true);
  const [scope, setScope] = useState<"course" | "lesson">("course");
  const [activeFilePath, setActiveFilePath] = useState("dojo.yaml");
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<"editor" | "preview">("editor");
  const [newLessonId, setNewLessonId] = useState<string | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("Loading your dojo…");
  const [error, setError] = useState<string | null>(null);
  const outgoing = useRef<Record<string, unknown>>({});
  const chatConnection = useMemo(() => fetchServerSentEvents(
    authoringApi("/api/authoring/messages"),
    () => ({ body: outgoing.current })
  ), []);
  const {
    messages: chatMessages,
    sendMessage: sendChatMessage,
    setMessages: setChatMessages,
    status: chatStatus,
  } = useChat({ connection: chatConnection, persistence: false, threadId: "kyoshi" });

  useEffect(() => { void bootstrap(); }, []);

  const selectedLesson = workspace?.lessons.find(({ id }) => id === selectedLessonId) ?? null;
  const files = workspace
    ? authoringFiles(workspace, scope === "lesson" ? selectedLesson : null)
    : [];
  const activeFile = files.find(({ path }) => path === activeFilePath) ?? files[0] ?? null;
  const dirty = Boolean(activeFile) && draft !== activeFile.content;
  const previewable = Boolean(activeFile && isAuthoringPreviewable(activeFile.path));
  const evalReady = workspace
    ? [...workspace.courseChecks, ...workspace.lessons.flatMap(({ checks }) => checks)].every(({ ready }) => ready)
    : false;

  useEffect(() => {
    if (!activeFile) return;
    setActiveFilePath(activeFile.path);
    setDraft(activeFile.content);
  }, [activeFile?.content, activeFile?.path]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!isSaveShortcut(event)) return;
      event.preventDefault();
      if (activeFile && dirty && !busy) void saveActiveFile(activeFile.path, draft);
    };
    window.addEventListener("keydown", handleSaveShortcut);
    return () => window.removeEventListener("keydown", handleSaveShortcut);
  }, [activeFile?.path, busy, dirty, draft]);

  function selectWorkspace(next: AuthoringDraft) {
    setWorkspace(next);
    setSelectedLessonId((current) => next.lessons.some(({ id }) => id === current)
      ? current
      : next.lessons[0]?.id ?? null);
    setExpandedLessonId((current) => next.lessons.some(({ id }) => id === current)
      ? current
      : next.lessons[0]?.id ?? null);
  }

  function selectLessonFile(lesson: AuthoringWorkspace["lessons"][number], path: string) {
    const file = lesson.files.find((entry) => entry.path === path);
    if (!file) return;
    setSelectedLessonId(lesson.id);
    setExpandedLessonId(lesson.id);
    setScope("lesson");
    setActiveFilePath(file.path);
    setDraft(file.content);
  }

  function selectRootFile(path: string) {
    const file = workspace?.rootFiles.find((entry) => entry.path === path);
    if (!file) return;
    setScope("course");
    setActiveFilePath(file.path);
    setDraft(file.content);
  }

  function hydrateChat(next: AuthoringWorkspace) {
    setChatMessages(next.messages
      .filter((entry) => (entry.kind === undefined || entry.kind === "message") && !isAuthoringBootstrapMessage(entry))
      .map((entry, index): UIMessage => ({
        id: `${entry.startedAt ?? 0}:${index}`,
        role: entry.role,
        parts: [{ type: "text", content: authoringMessageText(entry) }],
      })));
  }

  async function bootstrap() {
    try {
      const selected = await request<{ backend: "acp" | "eve" }>(authoringApi("/api/authoring/backend"));
      if (selected.backend === "eve") {
        selectWorkspace(await request<AuthoringDraft>(authoringApi("/api/authoring/draft")));
        setBackend("eve");
        return;
      }
      if (selected.backend !== "acp") throw new Error("Unsupported authoring backend");
      setBackend("acp");
      const initial = await request<AuthoringWorkspace>("/api/authoring/workspace");
      selectWorkspace(initial);
      hydrateChat(initial);
      setBusy("Kyoshi is preparing the course…");
      await request<AuthoringWorkspace>("/api/authoring/session", { method: "POST" });
      await drainStream("/api/authoring/introduction", { method: "POST" });
      const ready = await request<AuthoringWorkspace>("/api/authoring/workspace");
      selectWorkspace(ready);
      hydrateChat(ready);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy("");
    }
  }

  async function perform(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try { await action(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(""); }
  }

  async function refreshWorkspace() {
    await perform("Refreshing course files…", async () => {
      selectWorkspace(await request<AuthoringDraft>("/api/authoring/draft"));
    });
  }

  async function sendMessage(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setMessage("");
    outgoing.current = { message: trimmed };
    setBusy("Kyoshi is responding…");
    try { await sendChatMessage(trimmed); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(""); }
  }

  async function answerTool(answers: Record<string, AskUserAnswer>) {
    await perform("Continuing authoring…", async () => {
      await request("/api/authoring/answers", {
        body: JSON.stringify({ answers: Object.fromEntries(Object.values(answers).map((answer) => [
          answer.questionId,
          answer.otherText ? [...answer.selectedIds, answer.otherText] : answer.selectedIds,
        ])) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    });
  }

  async function addLesson() {
    await perform("Adding a lesson…", async () => {
      const created = await request<{
        lessonId: string;
        workspace: AuthoringDraft;
      }>("/api/authoring/lessons", {
        body: JSON.stringify({ title: "Untitled lesson" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      selectWorkspace(created.workspace);
      setSelectedLessonId(created.lessonId);
      setExpandedLessonId(created.lessonId);
      setNewLessonId(created.lessonId);
      setScope("lesson");
      const lesson = created.workspace.lessons.find(({ id }) => id === created.lessonId);
      const firstFile = lesson?.files[0];
      setActiveFilePath(firstFile?.path ?? lesson?.senseiPath ?? "dojo.yaml");
      setDraft(firstFile?.content ?? lesson?.sensei ?? "");
    });
  }

  async function renameLesson(lessonId: string, title: string) {
    await perform("Renaming lesson…", async () => {
      selectWorkspace(await request<AuthoringDraft>(
        `/api/authoring/lessons/${encodeURIComponent(lessonId)}`,
        {
          body: JSON.stringify({ title }),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        }
      ));
      setNewLessonId(null);
    });
  }

  async function renameCourse(title: string) {
    await perform("Renaming course…", async () => {
      selectWorkspace(await request<AuthoringDraft>("/api/authoring/course", {
        body: JSON.stringify({ title }),
        headers: { "content-type": "application/json" },
        method: "PATCH",
      }));
    });
  }

  async function saveActiveFile(path: string, content: string) {
    await perform("Saving file…", async () => {
      selectWorkspace(await request<AuthoringDraft>(authoringFileUrl(path), {
        body: JSON.stringify({ content }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }));
    });
  }

  async function trialLesson(lessonId: string) {
    await perform("Preparing a learner trial…", async () => {
      const trial = await request<{ courseId: string; lessonId: string; workspaceId: string }>(
        `/api/authoring/lessons/${encodeURIComponent(lessonId)}/trials`,
        { method: "POST" }
      );
      window.open(`/course/${trial.workspaceId}/${trial.courseId}/lesson/${trial.lessonId}`, "_blank", "noopener");
    });
  }

  async function runEvals(harness: "cassette" | "opencode") {
    await perform(`Running ${harness} evaluations…`, async () => {
      await request<ReportResponse>("/api/authoring/evals", {
        body: JSON.stringify({ harness }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      setView("preview");
    });
  }

  if (!workspace) return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Kyoshi</h1>
      <p className="mt-4 font-prose text-muted-foreground">{error ?? busy}</p>
    </main>
  );

  return (
    <CourseLessonLayout
      navigation={(
        <CourseLessonNavigation courseTitle={null} sectionTitle={null}>
          {USE_AI_AUTHORING_SIDEBAR ? (
            <AuthoringSidebar
              activeFilePath={activeFilePath}
              busy={Boolean(busy)}
              courseExpanded={courseExpanded}
              expandedLessonId={expandedLessonId}
              onAddLesson={() => void addLesson()}
              onCourseExpandedChange={setCourseExpanded}
              onLessonExpandedChange={setExpandedLessonId}
              onRenameCourse={(title) => void renameCourse(title)}
              onRenameLesson={(lessonId, title) => void renameLesson(lessonId, title)}
              onSelectLessonFile={selectLessonFile}
              onSelectRootFile={selectRootFile}
              scope={scope}
              selectedLessonId={selectedLessonId}
              workspace={workspace}
            />
          ) : (
          <LegacySidebar>
          <h2 className="border-b border-dashed px-5 py-3 font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Course</h2>
          <div className="border-b border-dashed">
            <EditableCourse
              expanded={courseExpanded}
              onRename={(title) => void renameCourse(title)}
              onSelect={() => selectRootFile(workspace.rootFiles[0]?.path ?? "dojo.yaml")}
              onToggle={() => setCourseExpanded((expanded) => !expanded)}
              title={workspace.name || "Untitled dojo"}
            />
            {courseExpanded ? (
              <FileTree
                ariaLabel="Course files"
                className="border-t border-dashed px-2 py-1.5"
                classNames={{ item: "h-8 rounded-none text-xs", label: "font-mono" }}
                defaultExpandedIds={[]}
                onValueChange={selectRootFile}
                value={scope === "course" ? activeFilePath : null}
              >
                {renderAuthoringTree(authoringTree(workspace.rootFiles))}
              </FileTree>
            ) : null}
          </div>
          <h2 className="border-b border-dashed px-5 py-3 font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Lessons</h2>
          {workspace.lessons.map((lesson) => (
            <div className="border-b border-dashed" key={lesson.id}>
              <EditableChapter
                active={scope === "lesson" && selectedLessonId === lesson.id}
                autoFocus={newLessonId === lesson.id}
                expanded={expandedLessonId === lesson.id}
                lesson={lesson}
                onRename={(title) => void renameLesson(lesson.id, title)}
                onSelect={() => selectLessonFile(lesson, lesson.senseiPath)}
                onToggle={() => setExpandedLessonId((current) => current === lesson.id ? null : lesson.id)}
              />
              {expandedLessonId === lesson.id ? (
                <FileTree
                  ariaLabel={`${lesson.title} files`}
                  className="border-t border-dashed px-2 py-1.5"
                  classNames={{ item: "h-8 rounded-none text-xs", label: "font-mono" }}
                  onValueChange={(path) => selectLessonFile(lesson, path)}
                  value={selectedLessonId === lesson.id ? activeFilePath : null}
                >
                  {lesson.files.map((file) => <FileTreeFile key={file.path} name={file.label} value={file.path} />)}
                </FileTree>
              ) : null}
            </div>
          ))}
          {workspace.lessons.length === 0 ? (
            <div className="border-b border-dashed p-4 font-prose text-[13px] leading-5 text-muted-foreground">
              Shape the course with Kyoshi. Lessons will appear here as they are authored.
            </div>
          ) : null}
          <button
            className="flex w-full items-center gap-2 border-b border-dashed px-4 py-3 text-left text-[13px] font-medium text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            disabled={Boolean(busy)}
            onClick={() => void addLesson()}
            type="button"
          >
            <Plus className="size-4" strokeWidth={1.75} /> Add lesson
          </button>
          </LegacySidebar>
          )}
        </CourseLessonNavigation>
      )}
      lesson={(
        <div className="flex min-h-0 flex-col bg-surface-1" data-testid="authoring-lesson-pane">
            <button
              aria-expanded={descriptionOpen}
              className="flex shrink-0 items-center gap-2 border-b border-dashed bg-background px-5 py-3 font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground"
              onClick={() => setDescriptionOpen((open) => !open)}
              type="button"
            >
              <ArrowRight className={`size-3.5 transition-transform ${descriptionOpen ? "rotate-90" : ""}`} />
              {scope === "course" ? "Course description" : "Lesson description"}
            </button>
            {descriptionOpen ? (
              <div className="max-h-[42%] shrink-0 overflow-auto border-b border-dashed bg-background px-6 py-5">
                <h2 className="text-2xl font-semibold tracking-tight">{scope === "course" ? workspace.name : selectedLesson?.title}</h2>
                <CourseContent basePath={null} workspaceId="">
                  {(scope === "course" ? workspace.description : selectedLesson?.description)
                    || "Describe the observable learner outcome in the corresponding manifest field."}
                </CourseContent>
                <ReadinessPanel lesson={selectedLesson} scope={scope} workspace={workspace} />
                {workspace.issues.length > 0 ? (
                  <div className="mt-5 border border-amber-500/35 bg-amber-500/5 p-4">
                    <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-amber-300">Draft issues</p>
                    <ul className="mt-3 list-disc space-y-1 pl-5 font-prose text-sm text-muted-foreground">
                      {workspace.issues.map((issue) => <li key={issue}>{issue}</li>)}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
            <div
              className="flex h-10 shrink-0 items-stretch bg-background"
              style={{ backgroundImage: "linear-gradient(to bottom, transparent calc(100% - 1px), #242424 1px)" }}
            >
              <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto" role="tablist" aria-label="Authoring workspace">
                {files.map((file) => (
                  <WorkspaceTabButton
                    active={activeFile?.path === file.path}
                    key={file.path}
                    surface={view === "preview" && previewable ? "preview" : "editor"}
                    onClick={() => {
                      setActiveFilePath(file.path);
                      setDraft(file.content);
                    }}
                  >
                    {file.label}
                    {activeFile?.path === file.path && dirty ? <Circle className="size-2 fill-[#14cbb7] text-[#14cbb7]" /> : null}
                  </WorkspaceTabButton>
                ))}
              </div>
              {busy ? <span className="ml-auto self-center px-3 text-xs text-[#878787]">{busy}</span> : null}
              {previewable ? (
                <div className={`${busy ? "" : "ml-auto"} flex items-center px-2`}>
                  <ViewToggle
                    label={view === "preview" ? "Switch to editor" : "Switch to preview"}
                    onClick={() => setView(view === "preview" ? "editor" : "preview")}
                  >
                    {view === "preview" ? <PreviewFileIcon /> : <EditorFileIcon />}
                  </ViewToggle>
                </div>
              ) : null}
            </div>
            <section className="flex min-h-0 flex-1 flex-col bg-[#0a0a0a] text-[#ededed] shadow-surface-3" data-testid="authoring-workspace">
              <div className="min-h-0 flex-1 overflow-auto">
                {view === "preview" && previewable
                  ? activeFile && <AuthoringFilePreview key={activeFile.path} path={activeFile.path} source={draft} workspace={workspace} />
                  : activeFile
                    ? <Suspense fallback={<div className="p-6 text-sm text-[#878787]">Loading editor…</div>}>
                        <CodeEditor
                          code={draft}
                          coverage={false}
                          filePath={activeFile.path}
                          language={authoringEditorLanguage(activeFile.path)}
                          lessonApiBase=""
                          onChange={setDraft}
                          readOnly={false}
                        />
                      </Suspense>
                    : null}
              </div>
            </section>
            {error ? <p className="border-t border-red-900/60 bg-red-950/40 px-5 py-2 text-sm text-red-300">{error}</p> : null}
            <div className="flex h-11 shrink-0 justify-end border-t border-dashed bg-background">
              <div className="flex items-stretch">
                <WorkspaceAction disabled={Boolean(busy)} onClick={() => void refreshWorkspace()}><RefreshCw className="size-3.5" /> Refresh</WorkspaceAction>
                {scope === "lesson" && selectedLesson ? <WorkspaceAction disabled={Boolean(busy)} onClick={() => void trialLesson(selectedLesson.id)}><ExternalLink className="size-3.5" /> Trial</WorkspaceAction> : null}
                <button className="bg-[#0070f3] px-4 text-xs text-white hover:bg-[#0761d1] disabled:bg-[#242424] disabled:text-[#878787]" disabled={Boolean(busy) || !evalReady} onClick={() => void runEvals("cassette")} title={evalReady ? "Run learner-persona evaluations" : "Complete the authoring checklist first"} type="button">Run evals</button>
              </div>
            </div>
        </div>
      )}
      chat={backend === "eve"
        ? <EveAuthoringChat sessionId={search.session} api={authoringApi} onSession={id => { void navigate({ search: previous => ({ ...previous, session: id }), replace: true }); }} />
        : <AuthoringChat messages={chatMessages} status={chatStatus} busy={Boolean(busy)} value={message} onValueChange={setMessage} onSend={value => { void sendMessage(value); }} onAnswer={answerTool} />}
    />
  );
}

function LegacySidebar({ children }: { children: ReactNode }) {
  return children;
}

function EditableChapter({
  active,
  autoFocus,
  expanded,
  lesson,
  onRename,
  onSelect,
  onToggle,
}: {
  active: boolean;
  autoFocus: boolean;
  expanded: boolean;
  lesson: AuthoringWorkspace["lessons"][number];
  onRename: (title: string) => void;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const [title, setTitle] = useState(lesson.title);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setTitle(lesson.title), [lesson.title]);
  useEffect(() => {
    if (!autoFocus) return;
    input.current?.focus();
    input.current?.select();
  }, [autoFocus]);
  const commit = () => {
    const next = title.trim();
    if (!next) {
      setTitle(lesson.title);
      return;
    }
    if (next !== lesson.title) onRename(next);
  };
  return (
    <div className={`group flex items-center gap-2 px-4 py-2.5 transition-colors ${active ? "bg-hover text-foreground" : "text-muted-foreground hover:bg-hover hover:text-foreground"}`}>
      <button aria-label={`${expanded ? "Collapse" : "Expand"} ${lesson.title}`} onClick={onToggle} type="button">
        <ArrowRight className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} strokeWidth={1.75} />
      </button>
      <input
        aria-label={`Lesson title: ${lesson.title}`}
        className="min-w-0 flex-1 bg-transparent text-[14px] font-medium outline-none"
        onBlur={commit}
        onChange={(event) => setTitle(event.target.value)}
        onFocus={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setTitle(lesson.title);
            event.currentTarget.blur();
          }
        }}
        ref={input}
        value={title}
      />
      <Pencil className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60 group-focus-within:opacity-60" strokeWidth={1.75} />
    </div>
  );
}

function EditableCourse({
  expanded,
  onRename,
  onSelect,
  onToggle,
  title: courseTitle,
}: {
  expanded: boolean;
  onRename: (title: string) => void;
  onSelect: () => void;
  onToggle: () => void;
  title: string;
}) {
  const [title, setTitle] = useState(courseTitle);
  useEffect(() => setTitle(courseTitle), [courseTitle]);
  const commit = () => {
    const next = title.trim();
    if (!next) {
      setTitle(courseTitle);
      return;
    }
    if (next !== courseTitle) onRename(next);
  };
  return (
    <div className="group flex items-center gap-2 px-4 py-2.5 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground">
      <button aria-label={`${expanded ? "Collapse" : "Expand"} ${courseTitle}`} onClick={onToggle} type="button">
        <ArrowRight className={`size-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} strokeWidth={1.75} />
      </button>
      <input
        aria-label={`Course title: ${courseTitle}`}
        className="min-w-0 flex-1 bg-transparent text-[14px] font-medium outline-none"
        onBlur={commit}
        onChange={(event) => setTitle(event.target.value)}
        onFocus={onSelect}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setTitle(courseTitle);
            event.currentTarget.blur();
          }
        }}
        value={title}
      />
      <Pencil className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60 group-focus-within:opacity-60" strokeWidth={1.75} />
    </div>
  );
}

function isAuthoringPreviewable(path: string): boolean {
  return path === "dojo.yaml" || /\.(?:md|mdx|json)$/u.test(path);
}

function ReadinessPanel({ lesson, scope, workspace }: {
  lesson: AuthoringWorkspace["lessons"][number] | null;
  scope: "course" | "lesson";
  workspace: AuthoringDraft;
}) {
  const checks = scope === "course" ? workspace.courseChecks : lesson?.checks ?? [];
  return (
    <section className="mt-7 border border-dashed">
      <div className="border-b border-dashed px-4 py-2 font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Readiness</div>
      <div className="grid gap-px bg-border/50 sm:grid-cols-2">
        {checks.map((check) => (
          <div className="flex items-center gap-2 bg-background px-4 py-3 font-prose text-sm" key={check.id}>
            {check.ready ? <Check className="size-4 text-emerald-400" /> : <Circle className="size-4 text-muted-foreground" />}
            <span className={check.ready ? "text-foreground" : "text-muted-foreground"}>{check.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function authoringEditorLanguage(path: string): "json" | "markdown" | "typescript" | "yaml" {
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";
  if (path.endsWith(".json")) return "json";
  if (/\.mdx?$/u.test(path)) return "markdown";
  return "typescript";
}

function WorkspaceTabButton({ active, children, onClick, surface }: { active: boolean; children: ReactNode; onClick: () => void; surface: "editor" | "preview" }) {
  const tab = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (active) tab.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [active]);
  const activeSurface = surface === "preview" ? "bg-background" : "bg-[#0a0a0a]";
  return <button aria-selected={active} className={`relative flex shrink-0 items-center gap-2 border-r border-t-2 border-[#242424] px-4 text-xs ${active ? `z-10 border-t-[#ededed] ${activeSurface} text-[#a1a1a1]` : "border-t-transparent bg-transparent text-[#a1a1a1] hover:bg-[#ffffff1a] hover:text-[#ededed]"}`} onClick={onClick} ref={tab} role="tab" type="button">{children}</button>;
}

function WorkspaceAction({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return <button className="flex items-center gap-2 border-r border-[#242424] px-3 text-xs text-[#a1a1a1] hover:bg-[#ffffff1a] hover:text-[#ededed] disabled:text-[#878787]" disabled={disabled} onClick={onClick} type="button">{children}</button>;
}

function ViewToggle({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-label={label}
      className="inline-flex size-8 items-center justify-center text-foreground transition-colors hover:text-primary"
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function PreviewFileIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 256 256">
      <path
        d="m212.24 83.76-56-56A6 6 0 0 0 152 26H56a14 14 0 0 0-14 14v176a14 14 0 0 0 14 14h144a14 14 0 0 0 14-14V88a6 6 0 0 0-1.76-4.24M158 46.48 193.52 82H158ZM200 218H56a2 2 0 0 1-2-2V40a2 2 0 0 1 2-2h90v50a6 6 0 0 0 6 6h50v122a2 2 0 0 1-2 2m-48.11-50.59a34.05 34.05 0 1 0-8.48 8.48l12.35 12.35a6 6 0 0 0 8.48-8.48ZM102 148a22 22 0 1 1 22 22 22 22 0 0 1-22-22"
        fill="currentColor"
      />
    </svg>
  );
}

function EditorFileIcon() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 256 256">
      <g fill="currentColor">
        <path d="M208 88h-56V32Z" opacity=".2" />
        <path d="M181.66 146.34a8 8 0 0 1 0 11.32l-24 24a8 8 0 0 1-11.32-11.32L164.69 152l-18.35-18.34a8 8 0 0 1 11.32-11.32Zm-72-24a8 8 0 0 0-11.32 0l-24 24a8 8 0 0 0 0 11.32l24 24a8 8 0 0 0 11.32-11.32L91.31 152l18.35-18.34a8 8 0 0 0 0-11.32M216 88v128a16 16 0 0 1-16 16H56a16 16 0 0 1-16-16V40a16 16 0 0 1 16-16h96a8 8 0 0 1 5.66 2.34l56 56A8 8 0 0 1 216 88m-56-8h28.69L160 51.31Zm40 136V96h-48a8 8 0 0 1-8-8V40H56v176z" />
      </g>
    </svg>
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, withAuthoringWorkspace(init));
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

async function drainStream(url: string, init: RequestInit): Promise<void> {
  const response = await fetch(url, withAuthoringWorkspace(init));
  if (!response.ok) throw new Error(await response.text());
  const reader = response.body?.getReader();
  if (!reader) return;
  while (!(await reader.read()).done) { /* Transcript is projected after the native turn. */ }
}

function withAuthoringWorkspace(init: RequestInit = {}): RequestInit {
  const workspaceId = new URLSearchParams(window.location.search).get("workspace");
  if (!workspaceId) return init;
  const headers = new Headers(init.headers);
  headers.set("x-dojofoo-workspace", workspaceId);
  return { ...init, headers };
}

function authoringApi(path: string): string {
  if (typeof window === "undefined") return path;
  const workspaceId = new URLSearchParams(window.location.search).get("workspace");
  return workspaceId ? `${path}?workspace=${encodeURIComponent(workspaceId)}` : path;
}

function errorMessage(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }

export function authoringFiles(
  workspace: AuthoringDraft,
  lesson: AuthoringWorkspace["lessons"][number] | null
): AuthoringFile[] {
  if (!lesson) return workspace.rootFiles;
  return lesson.files;
}

type AuthoringTreeNode = { children: AuthoringTreeNode[]; name: string; path: string; type: "file" | "folder" };

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

function renderAuthoringTree(nodes: AuthoringTreeNode[]): ReactNode {
  return nodes.map((node) => node.type === "folder"
    ? <FileTreeFolder key={node.path} name={node.name} value={node.path}>{renderAuthoringTree(node.children)}</FileTreeFolder>
    : <FileTreeFile key={node.path} name={node.name} value={node.path} />);
}

export function authoringFileUrl(path: string): string {
  return `/api/authoring/files/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function isSaveShortcut(event: Pick<KeyboardEvent, "ctrlKey" | "key" | "metaKey">): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
}
