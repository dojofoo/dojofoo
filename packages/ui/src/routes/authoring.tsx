import { Eye, Code } from "@mynaui/icons-react";
import type { AuthoringEvalReport } from "@dojofoo/authoring/server";
import { httpError } from "@/lib/http-error";
import type { AuthoringDraft, AuthoringWorkspace } from "@dojofoo/authoring/service";
import { authoringMessageText, isAuthoringBootstrapMessage } from "@dojofoo/authoring/types";
import { createFileRoute } from "@tanstack/react-router";
import { fetchServerSentEvents, useChat, type UIMessage } from "@tanstack/ai-react";
import {
  ArrowRight,
  ExternalLink,
  Pencil,
  Play,
  Plus,
  Refresh as RefreshCw,
} from "@mynaui/icons-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AuthoringFilePreview } from "@/components/authoring-file-preview";
import { AuthoringEvaluationReport } from "@/components/authoring-evaluation-report";
import { AuthoringEvaluationSettings } from "@/components/authoring-evaluation-settings";
import type { EvaluationSettings } from "@dojofoo/authoring/evaluation/settings";
import { TreeTitleMenu, authoringEvaluationStatus, authoringSidebarSelection } from "@/components/authoring-sidebar";
import { authoringNavigation } from "@/lib/authoring-navigation";
import { AuthoringChat } from "@/components/authoring-chat";
import { EveAuthoringChat } from "@/components/eve-authoring-chat";
import { CourseContent } from "@/components/course-content";
import { vercelCursorColors } from "@/lib/code-editor-theme";
import { WorkspaceFileTabs } from "@/components/workspace-file-tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuthoringFiles } from "@/hooks/use-authoring-files";
import { useAuthoringWatch } from "@/hooks/use-authoring-watch";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { rememberAuthoringSession } from "@/lib/authoring-session-link";
import { Button as UIXButton } from "@dojofoo/uix/components/button";
import { AgentChatWorkspace } from "@dojofoo/uix/containers/learning-workspace";
import { AppShell, Dropdown, Icon, MenuButton } from "@dojofoo/uix/components/app-shell";
import { codingAgents } from "@/lib/coding-agents";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { Editor, EditorTabs } from "@dojofoo/uix/containers/editor";
import { LessonBrief, LessonChecklist } from "@dojofoo/uix/components/lesson-brief";
import { CoursesIcon, DoneIcon, Cancel01Icon, FilterIcon } from "@dojofoo/uix/icons";
import { ScrollArea } from "@dojofoo/ui/scroll-area";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { FileTree, FileTreeFile, FileTreeFolder } from "@dojofoo/uix/components/motion/file-tree";

const CodeEditor = lazy(() => import("@dojofoo/uix/containers/code-editor").then(({ CodeEditor }) => ({ default: CodeEditor })));

type ReportResponse = { report: AuthoringEvalReport | null; root: string };
type AuthoringFile = { content: string; label: string; path: string };

export const Route = createFileRoute("/authoring")({
  component: AuthoringPage,
  validateSearch: (search: Record<string, unknown>): { workspace?: string; session?: string } => ({
    ...(typeof search.workspace === "string" ? { workspace: search.workspace } : {}),
    ...(typeof search.session === "string" ? { session: search.session } : {}),
  }),
});

function AuthoringPage() {
  const { account, toast } = useAccountMenu();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [backend, setBackend] = useState<"acp" | "eve">();
  const [workspace, setWorkspace] = useState<AuthoringDraft | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);
  const [courseExpanded, setCourseExpanded] = useState(true);
  const [onlyCourseFiles, setOnlyCourseFiles] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [scope, setScope] = useState<"course" | "lesson">("course");
  const [view, setView] = useState<"editor" | "preview">("editor");
  const [newLessonId, setNewLessonId] = useState<string | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("Loading your dojo…");
  const [error, setError] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [trialError, setTrialError] = useState<{ lessonId: string; message: string } | null>(null);
  const [trialHarness, setTrialHarness] = useState("");
  const [evaluationReport, setEvaluationReport] = useState<AuthoringEvalReport | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [evaluationSettingsOpen, setEvaluationSettingsOpen] = useState(false);
  const [evaluationError, setEvaluationError] = useState<{ lessonId: string; source: "load" | "run"; message: string; previousReport?: string } | null>(null);
  const reportLesson = useRef<string | null>(null);
  reportLesson.current = scope === "lesson" ? selectedLessonId : null;
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
  const files = useMemo(() => workspace ? [...new Map([...workspace.rootFiles, ...workspace.lessons.flatMap((lesson) => lesson.files)].map((file) => [file.path, file])).values()] : undefined, [workspace]);
  const editorFiles = useAuthoringFiles(files);
  const { activeFile, draft, setDraft, open: setActiveFilePath } = editorFiles;
  const activeFilePath = activeFile?.path ?? "";
  const dirty = activeFile !== null && draft !== activeFile.content;
  const currentFiles = useRef({ files, dirty: editorFiles.dirty });
  currentFiles.current = { files, dirty: editorFiles.dirty };
  useAuthoringWatch(authoringApi("/api/authoring/changes"), async () => {
    const next = await request<AuthoringDraft>(authoringApi("/api/authoring/draft"));
    const nextFiles = [...next.rootFiles, ...next.lessons.flatMap(lesson => lesson.files)];
    const conflicts = currentFiles.current.files?.filter(file => currentFiles.current.dirty(file)
      && nextFiles.find(candidate => candidate.path === file.path)?.content !== file.content);
    if (conflicts?.length) {
      setError(`Files changed externally: ${conflicts.map(file => file.path).join(", ")}. Your unsaved edits are preserved. Review the changes before saving or refreshing.`);
      return;
    }
    selectWorkspace(next);
  }, setError);
  const previewable = Boolean(activeFile && isAuthoringPreviewable(activeFile.path));
  const evalReady = workspace && selectedLesson
    ? [...workspace.courseChecks, ...selectedLesson.checks].every(({ ready }) => ready)
    : false;

  // Reports belong to a lesson, not to whichever file happened to be open
  // when the last evaluation finished. Also refresh after agent file changes.
  useEffect(() => {
    setEvaluationReport(null);
    setReportOpen(false);
  }, [selectedLessonId, scope]);

  useEffect(() => {
    if (!selectedLessonId || scope !== "lesson") return;
    const controller = new AbortController();
    const url = new URL(authoringApi("/api/authoring/report"), window.location.origin);
    url.searchParams.set("lessonId", selectedLessonId);
    void fetch(url, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load this lesson's evaluation result. Refresh to try again.");
      const result = await response.json() as ReportResponse;
      if (!controller.signal.aborted) {
        setEvaluationReport(result.report);
        setEvaluationError(current => {
          if (current?.lessonId !== selectedLessonId) return current;
          // A fresh completed report is authoritative, even when Kyoshi ran
          // it outside this button. Null, stale and running reports must not
          // erase a failed request merely because the watcher refreshed.
          const replaced = result.report?.completedAt && result.report.status !== "stale"
            && result.report.directory !== current.previousReport;
          return current.source === "load" || replaced ? null : current;
        });
      }
    }).catch(cause => {
      if (!controller.signal.aborted) setEvaluationError(current => current?.lessonId === selectedLessonId && current.source === "run"
        ? current : { lessonId: selectedLessonId, source: "load", message: errorMessage(cause) });
    });
    return () => controller.abort();
  }, [selectedLessonId, scope, workspace]);

  // Sidebar status per lesson; the watcher refreshes `workspace` on every
  // file or report change, so this follows Kyoshi's evaluations too.
  const [lessonStatuses, setLessonStatuses] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!workspace) return;
    const controller = new AbortController();
    void fetch(authoringApi("/api/authoring/reports"), withAuthoringWorkspace({ signal: controller.signal }))
      .then(response => response.ok ? response.json() as Promise<{ statuses: Record<string, string> }> : null)
      .then(result => { if (result && !controller.signal.aborted) setLessonStatuses(result.statuses); })
      .catch(() => {});
    return () => controller.abort();
  }, [workspace]);

  const visibleReport = scope === "lesson" && selectedLessonId && evaluationReport?.lessonIds.at(-1) === selectedLessonId ? evaluationReport : null;
  const visibleEvaluationError = scope === "lesson" && evaluationError?.lessonId === selectedLessonId ? evaluationError : null;

  const activeFileLessonId = workspace?.lessons.find((entry) => entry.files.some((file) => file.path === activeFile?.path))?.id;
  useEffect(() => {
    if (!activeFile) return;
    setScope(activeFileLessonId ? "lesson" : "course");
    if (activeFileLessonId) { setSelectedLessonId(activeFileLessonId); setExpandedLessonId(activeFileLessonId); }
  }, [activeFile?.path, activeFileLessonId]);

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
  }

  function selectRootFile(path: string) {
    const file = workspace?.rootFiles.find((entry) => entry.path === path);
    if (!file) return;
    setScope("course");
    setActiveFilePath(file.path);
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
    setBusy("Loading your dojo…");
    setError(null);
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
    setBusy("Saving file…");
    setFileErrors(current => { const next = { ...current }; delete next[path]; return next; });
    try {
      selectWorkspace(await request<AuthoringDraft>(authoringFileUrl(path), {
        body: JSON.stringify({ content }),
        headers: { "content-type": "application/json" },
        method: "PUT",
      }));
      editorFiles.saved(path, content);
    } catch (cause) {
      setFileErrors(current => ({ ...current, [path]: errorMessage(cause) }));
    } finally { setBusy(""); }
  }

  async function trialLesson(lessonId: string) {
    // Reserve the tab inside the click gesture, not after asynchronous setup
    // when browsers may block it. Detach its opener before loading the trial.
    const tab = window.open("about:blank", "_blank");
    setTrialError(null);
    if (!tab) {
      setTrialError({ lessonId, message: "Allow pop-ups for this site, then try opening the lesson again." });
      return;
    }
    tab.opener = null;
    tab.document.title = "Preparing lesson…";
    tab.document.body.textContent = "Preparing your lesson. You can return to authoring while it loads.";
    setBusy("Preparing a learner trial…");
    try {
      const trial = await request<{ courseId: string; lessonId: string; workspaceId: string }>(
        authoringApi(`/api/authoring/lessons/${encodeURIComponent(lessonId)}/trials`),
        { method: "POST" }
      );
      await request(`/api/workspaces/${encodeURIComponent(trial.workspaceId)}/courses/${encodeURIComponent(trial.courseId)}/lessons/${encodeURIComponent(trial.lessonId)}/sessions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(trialHarness ? { harness: trialHarness } : {}),
      });
      if (!tab.closed) tab.location.replace(`/course/${encodeURIComponent(trial.workspaceId)}/${encodeURIComponent(trial.courseId)}/lesson/${encodeURIComponent(trial.lessonId)}`);
    } catch (cause) {
      tab.close();
      setTrialError({ lessonId, message: errorMessage(cause) });
    } finally { setBusy(""); }
  }

  async function runEvals() {
    if (!selectedLessonId) return;
    const lessonId = selectedLessonId;
    setBusy("Trialing Sensei and judging teaching…");
    setEvaluationError(null);
    try {
      const settings = await request<EvaluationSettings | null>(authoringApi("/api/authoring/evaluation-settings"));
      if (!settings?.enabled) { setEvaluationSettingsOpen(true); return; }
      const result = await request<ReportResponse>(authoringApi("/api/authoring/evals"), {
        body: JSON.stringify({ lessonIds: [lessonId], callId: crypto.randomUUID() }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      // The run belongs to the lesson where it started, not the view open
      // when it finishes. Returning to that lesson reads its saved report.
      if (reportLesson.current === lessonId) {
        setEvaluationReport(result.report);
        setReportOpen(true);
      }
    } catch (cause) {
      setEvaluationError({ lessonId, source: "run", message: errorMessage(cause), previousReport: evaluationReport?.directory });
    } finally { setBusy(""); }
  }

  const brand = <a href="/" className="flex items-center" aria-label="Dojo dashboard"><BrandLogo className="w-11" /></a>;
  const shell = { ...account, brand, workspace: "Dojo", sidebarWidth: "18rem", showNews: false, showOnboarding: false };
  if (!workspace || !backend) return <div className="h-dvh"><AppShell {...shell} navigation={[]}>
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Kyoshi</h1>
      <p role={error ? "alert" : "status"} className="mt-4 font-prose text-muted-foreground">{error ?? busy}</p>
      {error ? <UIXButton className="mt-4" disabled={Boolean(busy)} onClick={() => void bootstrap()}>Reload workspace</UIXButton> : null}
    </main>
  </AppShell></div>;

  const navigation = authoringNavigation(workspace, onlyCourseFiles);
  const courseRow = navigation[0]!.items[0]!;
  courseRow.actions = <TreeTitleMenu title={courseRow.label} disabled={Boolean(busy)} onRename={title => { void renameCourse(title); }} />;
  navigation[0]!.actions = <Dropdown title="Course files" align="end" items={[{
    label: onlyCourseFiles ? "Show all files" : "Show only course files", checked: !onlyCourseFiles, onSelect: () => setOnlyCourseFiles(value => !value),
  }]} trigger={({ open, toggle }) => <button type="button" className="ui-as-icon-btn" aria-label="Course actions" aria-expanded={open} onClick={toggle}><Icon icon={FilterIcon} size={14} /></button>} />;
  const lessonGroups = workspace.lessons.map(lesson => `authoring:lesson:${encodeURIComponent(lesson.id)}`);
  navigation[1]!.items.forEach((row, index) => {
    const lesson = workspace.lessons[index];
    if (!lesson) { row.disabled = Boolean(busy); return; }
    const status = authoringEvaluationStatus(lessonStatuses[lesson.id]);
    const verdict = lessonStatuses[lesson.id];
    row.note = status.label;
    row.status = <span role="img" aria-label={status.label} className="flex size-4 shrink-0 items-center justify-center text-[var(--brand)]">
      {verdict === "passed" ? <Icon icon={DoneIcon} size={13} /> : verdict?.endsWith("failed") ? <Icon icon={Cancel01Icon} size={13} /> : <i className="size-1.5 rounded-full bg-current opacity-60" />}
    </span>;
    row.actions = <TreeTitleMenu title={row.label} disabled={Boolean(busy)} onRename={title => { void renameLesson(lesson.id, title); }} />;
  });
  const activeResource = scope === "course" ? `authoring:course:file:${encodeURIComponent(activeFilePath)}`
    : `authoring:lesson:${encodeURIComponent(selectedLessonId ?? "")}:file:${encodeURIComponent(activeFilePath)}`;
  const expandedGroups = Object.fromEntries([
    ["authoring:course", courseExpanded],
    ...expandedFolders.map(id => [id, true]),
    ...workspace.lessons.map(lesson => [`authoring:lesson:${encodeURIComponent(lesson.id)}`, expandedLessonId === lesson.id]),
  ]);
  const evaluationAction = scope === "lesson" && selectedLessonId ? <UIXButton size="sm" disabled={Boolean(busy) || !evalReady} onClick={() => void runEvals()} title={evalReady ? "Evaluate selected lesson with configured models and two judges (uses model quota)" : "Complete the authoring checklist first"} type="button">Evaluate lesson</UIXButton> : null;
  const conversation = backend === "eve"
    ? <EveAuthoringChat embedded sessionId={search.session} api={authoringApi} onSession={id => {
      if (search.workspace) rememberAuthoringSession(search.workspace, id);
      void navigate({ search: previous => ({ ...previous, session: id }), replace: true });
    }} />
    : <AuthoringChat embedded messages={chatMessages} status={chatStatus} busy={Boolean(busy)} value={message} onValueChange={setMessage} onSend={value => { void sendMessage(value); }} onAnswer={answerTool} />;
  return <div className="h-dvh overflow-hidden">
    <AgentChatWorkspace {...shell} contentKind="code" active={activeResource}
      evals={visibleReport ? <AuthoringEvaluationReport report={visibleReport} actions={evaluationAction} /> : undefined}
      evalsOpen={reportOpen} onEvalsOpenChange={setReportOpen}
      navigation={[{ id: "main", items: [{ id: "courses", label: "Courses", icon: CoursesIcon, href: "/" }] }, ...navigation]}
      expandedGroups={expandedGroups} onExpandedGroupsChange={next => {
        setCourseExpanded(Boolean(next["authoring:course"]));
        const opened = lessonGroups.find(id => next[id] && !expandedGroups[id]) ?? lessonGroups.find(id => next[id]);
        setExpandedLessonId(opened ? workspace.lessons[lessonGroups.indexOf(opened)]!.id : null);
        setExpandedFolders(Object.keys(next).filter(id => next[id] && id !== "authoring:course" && !lessonGroups.includes(id)));
      }}
      onNavigate={id => {
        if (id === "courses") { window.location.assign("/"); return; }
        if (id === "authoring:add-lesson") { if (!busy) void addLesson(); return; }
        const selected = authoringSidebarSelection(workspace, id);
        if (selected?.scope === "course") selectRootFile(selected.path);
        else if (selected) {
          const lesson = workspace.lessons.find(item => item.id === selected.lessonId);
          if (lesson) selectLessonFile(lesson, selected.path);
        }
      }}
      crumbs={[
        { label: workspace.name || "Untitled dojo", onClick: () => selectRootFile(workspace.rootFiles[0]?.path ?? "dojo.yaml") },
        ...(scope === "lesson" && selectedLesson ? [{ label: selectedLesson.title }] : []),
      ]}
      askAssistant={backend === "acp" && !busy}
      onCommand={(id, query) => { if (id === "ask" && query && backend === "acp" && !busy) void sendMessage(query); }}
      editor={<Editor flush className="h-full" tabs={<div
              className="flex shrink-0 items-stretch border-b border-[var(--line-soft)]"
            >
              <EditorTabs mode="authoring" label="Authoring workspace" active={activeFilePath}
                tabs={editorFiles.tabs.paths.flatMap((path) => { const file = files?.find((entry) => entry.path === path); return file ? [{ path, label: file.label, dirty: editorFiles.dirty(file) }] : []; })}
                onSelect={setActiveFilePath} onClose={editorFiles.close} onMove={editorFiles.move} />
              {busy ? <span className="ml-auto self-center px-3 text-xs text-[#878787]">{busy}</span> : null}
              {previewable ? (
                <div className={`${busy ? "" : "ml-auto"} flex items-center px-2`}>
                  <ViewToggle
                    label={view === "preview" ? "Switch to code" : "Switch to preview"}
                    onClick={() => setView(view === "preview" ? "editor" : "preview")}
                  >
                    {view === "preview" ? <EditorFileIcon /> : <PreviewFileIcon />}
                  </ViewToggle>
                </div>
              ) : null}
            </div>}><div className="flex h-full min-h-0 flex-col" data-testid="authoring-lesson-pane">
            <section className="flex min-h-0 flex-1 flex-col" data-testid="authoring-workspace">
              <div className="min-h-0 flex-1 overflow-auto">
                {view === "preview" && previewable
                  ? activeFile && <AuthoringFilePreview key={activeFile.path} path={activeFile.path} source={draft} workspace={workspace} />
                  : activeFile
                    ? <Suspense fallback={<div className="p-6 text-sm text-[#878787]">Loading editor…</div>}>
                        <CodeEditor
                          key={workspace.root}
                          code={draft}
                          coverage={false}
                          filePath={activeFile.path}
                          language={authoringEditorLanguage(activeFile.path)}
                          lessonApiBase=""
                          documentationUrl={authoringApi("/api/authoring/language/hover")}
                          onChange={setDraft}
                          onSave={content => { if (activeFile && dirty && !busy) void saveActiveFile(activeFile.path, content); }}
                          readOnly={false}
                        />
                      </Suspense>
                    : <p className="p-6 text-sm text-muted-foreground">Open a file from the course or lesson sidebar.</p>}
              </div>
            </section>
            {error ? <div role="alert" className="flex items-start gap-3 border-t border-dashed px-5 py-2 text-sm text-destructive"><p className="flex-1">{error}</p><button type="button" className="shrink-0 underline" onClick={() => setError(null)}>Dismiss</button></div> : null}
            {fileErrors[activeFilePath] ? <div role="alert" className="flex items-start gap-3 border-t border-dashed px-5 py-2 text-sm text-destructive">
              <p className="flex-1">{activeFilePath}: {fileErrors[activeFilePath]}</p>
              <button type="button" className="shrink-0 underline" onClick={() => setFileErrors(current => { const next = { ...current }; delete next[activeFilePath]; return next; })}>Dismiss</button>
            </div> : null}
            {visibleEvaluationError ? <div role="alert" className="flex items-start gap-3 border-t border-dashed px-5 py-2 text-sm text-destructive">
              <p className="flex-1">Evaluation · {selectedLesson?.title ?? selectedLessonId}: {visibleEvaluationError.message}</p>
              <button type="button" className="shrink-0 underline" onClick={() => setEvaluationError(null)}>Dismiss</button>
            </div> : null}
            {scope === "lesson" && trialError?.lessonId === selectedLessonId ? <div role="alert" className="flex items-start gap-3 border-t border-dashed px-5 py-2 text-sm text-destructive">
              <p className="flex-1">Trial · {selectedLesson?.title ?? selectedLessonId}: {trialError.message}</p>
              <button type="button" className="shrink-0 underline" onClick={() => setTrialError(null)}>Dismiss</button>
            </div> : null}
            <div className="flex min-h-11 shrink-0 flex-wrap justify-end border-t border-[var(--line-soft)]">
              <AuthoringEvaluationSettings open={evaluationSettingsOpen} onOpenChange={setEvaluationSettingsOpen} api={authoringApi} onSaved={() => setEvaluationError(null)} />
              <div className="flex flex-wrap items-center justify-end gap-1 p-1">
                <WorkspaceAction disabled={Boolean(busy)} onClick={() => setEvaluationSettingsOpen(true)}>Evaluation settings</WorkspaceAction>
                <WorkspaceAction disabled={Boolean(busy)} onClick={() => void refreshWorkspace()}><RefreshCw className="size-3.5" /> Refresh</WorkspaceAction>
                {visibleReport ? <WorkspaceAction disabled={false} onClick={() => setReportOpen(!reportOpen)}>{reportOpen ? "Hide evaluation" : "Evaluation results"}</WorkspaceAction> : null}
                {scope === "lesson" && selectedLesson ? <>
                  <MenuButton label="Trial agent" value={trialHarness} onChange={setTrialHarness} disabled={Boolean(busy)} align="start"
                    icon={codingAgents.find(agent => agent.value === trialHarness)?.icon}
                    options={[{ value: "", label: "Configured trial agent" }, ...["codex", "opencode", "cursor", "grok", "fx"].map(value => ({ value, label: codingAgents.find(agent => agent.value === value)!.name }))]} />
                  <WorkspaceAction disabled={Boolean(busy)} onClick={() => void trialLesson(selectedLesson.id)}><ExternalLink className="size-3.5" /> Trial</WorkspaceAction>
                </> : null}
                {evaluationAction}
              </div>
            </div>
      </div></Editor>}
      details={<LessonBrief title={scope === "course" ? workspace.name : selectedLesson?.title ?? workspace.name}>
        <CourseContent basePath={null} workspaceId="" diagrams={false}>
          {(scope === "course" ? workspace.description : selectedLesson?.description)
            || "Describe the observable learner outcome in the corresponding manifest field."}
        </CourseContent>
        <LessonChecklist checks={scope === "course" ? workspace.courseChecks : selectedLesson?.checks ?? []} />
        {workspace.issues.length > 0 && <div className="mt-5 text-sm text-[var(--muted)]"><h3>Draft issues</h3>
          <ul>{workspace.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>
        </div>}
      </LessonBrief>}
      header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Kyoshi</b><span className="ui-as-chat__speaker-note">Master of Senseis and course shaper</span></span>}
      conversation={conversation}>
    </AgentChatWorkspace>
    {toast}
  </div>;

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

function authoringEditorLanguage(path: string): "json" | "markdown" | "typescript" | "yaml" {
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";
  if (path.endsWith(".json")) return "json";
  if (/\.mdx?$/u.test(path)) return "markdown";
  return "typescript";
}

function WorkspaceAction({ children, disabled, onClick }: { children: ReactNode; disabled: boolean; onClick: () => void }) {
  return <UIXButton size="sm" variant="ghost" disabled={disabled} onClick={onClick} type="button">{children}</UIXButton>;
}

function ViewToggle({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <Tooltip content={label} side="bottom">
    <button
      aria-label={label}
      className="inline-flex size-8 items-center justify-center text-foreground transition-colors hover:text-primary"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
    </Tooltip>
  );
}

function PreviewFileIcon() {
  return (
    <Eye aria-hidden="true" className="size-4" />
  );
}

function EditorFileIcon() {
  return (
    <Code aria-hidden="true" className="size-4" />
  );
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, withAuthoringWorkspace(init));
  if (!response.ok) throw await httpError(response);
  return response.json() as Promise<T>;
}

async function drainStream(url: string, init: RequestInit): Promise<void> {
  const response = await fetch(url, withAuthoringWorkspace(init));
  if (!response.ok) throw await httpError(response);
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
  if (!workspaceId) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("workspace", workspaceId);
  return `${url.pathname}${url.search}${url.hash}`;
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
