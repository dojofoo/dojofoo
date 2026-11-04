import { courseChapters } from "@dojofoo/config/chapters";
import { AuthoringCourseCard } from "@dojofoo/uix/components/authoring-course-card";
import { EvalsPanel } from "@dojofoo/uix/components/evals";
import { courseArt } from "@/lib/course-color";
import { CourseAuthoringSidebar } from "@dojofoo/uix/components/course-authoring-sidebar";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, Code } from "@mynaui/icons-react";
import type { EvaluationReport as AuthoringEvalReport } from "@dojofoo/agents/evaluation/run";
import { httpError } from "@/lib/http-error";
import type { AuthoringDraft } from "@dojofoo/agents/service";
import { createFileRoute } from "@tanstack/react-router";
import {
  ExternalLink,
  Refresh as RefreshCw,
} from "@mynaui/icons-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AuthoringFilePreview } from "@/components/authoring-file-preview";
import { AuthoringEvaluationReport } from "@/components/authoring-evaluation-report";
import { AuthoringEvaluationSettings } from "@/components/authoring-evaluation-settings";
import type { EvaluationSettings } from "@dojofoo/agents/evaluation/settings";
import { TreeTitleMenu, authoringEvaluationStatus } from "@/components/authoring-sidebar";
import { AgentChat } from "@/components/agent-chat";
import { ConversationHistory, type HistoryPick } from "@/components/conversation-history";
import { useWorkspaceAgent } from "@/hooks/use-workspace-agent";
import { CourseContent } from "@/components/course-content";
import { Tooltip } from "@/components/ui/tooltip";
import { useAuthoringFiles } from "@/hooks/use-authoring-files";
import { useAuthoringWatch } from "@/hooks/use-authoring-watch";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { Button as UIXButton } from "@dojofoo/uix/components/button";
import { AgentChatWorkspace } from "@dojofoo/uix/containers/learning-workspace";
import { Icon } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { WorkspaceSkeleton } from "@dojofoo/uix/components/workspace-skeleton";
import { Editor, EditorTabs } from "@dojofoo/uix/containers/editor";
import { LessonBrief } from "@dojofoo/uix/components/lesson-brief";
import { BackIcon, DoneIcon, Cancel01Icon, File01Icon, EvalsIcon } from "@dojofoo/uix/icons";

const CodeEditor = lazy(() => import("@dojofoo/uix/containers/code-editor").then(({ CodeEditor }) => ({ default: CodeEditor })));

type ReportResponse = { report: AuthoringEvalReport | null; root: string };
type AuthoringFile = { content: string; label: string; path: string };

/** A draft's authoring page, addressed by the draft's workspace id (D30); `?session=` is only a history pick's */
export const Route = createFileRoute("/authoring_/$draftId")({
  component: AuthoringRoute,
  validateSearch: (search: Record<string, unknown>): { session?: string } => ({
    ...(typeof search.session === "string" ? { session: search.session } : {}),
  }),
});

function AuthoringRoute() {
  const { draftId } = Route.useParams();
  return <AuthoringPage key={draftId} />;
}

function AuthoringPage() {
  const navigate = useNavigate();
  const dashboardCrumb = { label: "Dashboard", icon: <Icon icon={BackIcon} size={14} />, iconOnly: true, onClick: () => { void navigate({ to: "/" }); } };
  const { account, toast } = useAccountMenu({ preserveWorkspace: true });
  const search = Route.useSearch();
  const { draftId } = Route.useParams();
  const [workspace, setWorkspace] = useState<AuthoringDraft | null>(null);
  // The conversation the chat asks for: the URL's (a link or a live history pick), or an ended one read-only, which the URL never names (D32)
  const [chatView, setChatView] = useState<{ session?: string; readOnly: boolean }>({ ...(search.session ? { session: search.session } : {}), readOnly: false });
  useEffect(() => { setChatView(current => current.readOnly ? current : { ...(search.session ? { session: search.session } : {}), readOnly: false }); }, [search.session]);
  const [opened, setOpened] = useState<HistoryPick>();
  const show = (next: { session?: string; readOnly: boolean }, replace = false) => {
    setChatView(next);
    void navigate({ to: "/authoring/$draftId", params: { draftId }, search: previous => ({ ...previous, session: next.readOnly ? undefined : next.session }), replace });
  };
  // A switch remounts the conversation, which finds none on the new agent and starts one there; a pick's switch opens the pick in the same update
  const [agentEpoch, setAgentEpoch] = useState(0);
  const workspaceAgent = useWorkspaceAgent({ workspaceId: draftId, persona: "kyoshi", onSwitched: (_agentId, pick) => {
    setAgentEpoch(epoch => epoch + 1);
    show(pick ? { session: pick.id, readOnly: pick.readOnly } : { readOnly: false }, !pick);
  } });
  const pickConversation = (pick: HistoryPick) => {
    if (pick.agent !== workspaceAgent.selected) workspaceAgent.request(pick.agent, { id: pick.id, readOnly: pick.readOnly });
    else show({ session: pick.id, readOnly: pick.readOnly });
  };
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [onlyCourseFiles, setOnlyCourseFiles] = useState(true);
  const [scope, setScope] = useState<"course" | "lesson">("course");
  const [view, setView] = useState<"editor" | "preview">("editor");
  const [newLessonId, setNewLessonId] = useState<string | null>(null);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [busy, setBusy] = useState("Loading your dojo…");
  const [error, setError] = useState<string | null>(null);
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [trialError, setTrialError] = useState<{ lessonId: string; message: string } | null>(null);
  const [evaluationReport, setEvaluationReport] = useState<AuthoringEvalReport | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [evalsView, setEvalsView] = useState<"overview" | "report">("overview");
  const [evaluationSettingsOpen, setEvaluationSettingsOpen] = useState(false);
  const [evaluationError, setEvaluationError] = useState<{ lessonId: string; source: "load" | "run"; message: string; previousReport?: string } | null>(null);
  const reportLesson = useRef<string | null>(null);
  reportLesson.current = scope === "lesson" ? selectedLessonId : null;
  useEffect(() => { void bootstrap(); }, []);

  const selectedLesson = workspace?.lessons.find(({ id }) => id === selectedLessonId) ?? null;
  const files = useMemo(() => workspace ? [...new Map([...workspace.rootFiles, ...(workspace.chapters ?? []).flatMap(chapter => chapter.files ?? []), ...workspace.lessons.flatMap((lesson) => lesson.files)].map((file) => [file.path, file])).values()] : undefined, [workspace]);
  const editorFiles = useAuthoringFiles(files);
  const { activeFile, draft, setDraft, open: setActiveFilePath } = editorFiles;
  const activeFilePath = activeFile?.path ?? "";
  const dirty = activeFile !== null && draft !== activeFile.content;
  const currentFiles = useRef({ files, dirty: editorFiles.dirty });
  currentFiles.current = { files, dirty: editorFiles.dirty };
  useAuthoringWatch(authoringApi("/api/authoring/changes"), async () => {
    const next = await request<AuthoringDraft>(authoringApi("/api/authoring/draft"));
    const nextFiles = [...next.rootFiles, ...(next.chapters ?? []).flatMap(chapter => chapter.files ?? []), ...next.lessons.flatMap(lesson => lesson.files)];
    const conflicts = currentFiles.current.files?.filter(file => currentFiles.current.dirty(file)
      && nextFiles.find(candidate => candidate.path === file.path)?.content !== file.content);
    if (conflicts?.length) {
      selectWorkspace(next);
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
    if (activeFileLessonId) setSelectedLessonId(activeFileLessonId);
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

  }

  function selectLessonFile(lesson: AuthoringDraft["lessons"][number], path: string) {
    setReportOpen(false);
    const file = lesson.files.find((entry) => entry.path === path);
    if (!file) return;
    setSelectedLessonId(lesson.id);
    setScope("lesson");
    setActiveFilePath(file.path);
  }

  function selectRootFile(path: string) {
    setReportOpen(false);
    const file = [...(workspace?.rootFiles ?? []), ...(workspace?.chapters ?? []).flatMap(chapter => chapter.files ?? [])].find(entry => entry.path === path);
    if (!file) return;
    setScope("course");
    setActiveFilePath(file.path);
  }

  async function bootstrap() {
    setBusy("Loading your dojo…");
    setError(null);
    try { selectWorkspace(await request<AuthoringDraft>(authoringApi("/api/authoring/draft"))); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(""); }
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

  async function addLesson(chapterId?: string) {
    await perform("Adding a lesson…", async () => {
      const created = await request<{
        lessonId: string;
        workspace: AuthoringDraft;
      }>("/api/authoring/lessons", {
        body: JSON.stringify({ title: "Untitled lesson", ...(chapterId ? { chapterId } : {}) }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      selectWorkspace(created.workspace);
      setSelectedLessonId(created.lessonId);
      setNewLessonId(created.lessonId);
      setScope("lesson");
      const lesson = created.workspace.lessons.find(({ id }) => id === created.lessonId);
      const firstFile = lesson?.files[0];
      setActiveFilePath(firstFile?.path ?? lesson?.senseiPath ?? "dojo.yaml");
    });
  }

  async function addChapter() {
    await perform("Adding a chapter…", async () => {
      const created = await request<{ chapterId: string; workspace: AuthoringDraft }>("/api/authoring/chapters", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "New chapter" }),
      });
      selectWorkspace(created.workspace);
      const intro = created.workspace.chapters?.find(chapter => chapter.id === created.chapterId)?.intro;
      if (intro) { setReportOpen(false); setScope("course"); setActiveFilePath(intro.path); }
    });
  }

  async function renameChapter(chapterId: string, title: string) {
    await perform("Renaming chapter…", async () => {
      selectWorkspace(await request<AuthoringDraft>(`/api/authoring/chapters/${encodeURIComponent(chapterId)}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }),
      }));
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
      const trial = await request<{ courseId: string; lessonId: string; workspaceId: string; runId: string }>(
        authoringApi(`/api/authoring/lessons/${encodeURIComponent(lessonId)}/trials`),
        { method: "POST" }
      );
      if (!tab.closed) tab.location.replace(`/learn/${encodeURIComponent(trial.runId)}?lesson=${encodeURIComponent(trial.lessonId)}`);
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
        setEvalsView("report");
        setReportOpen(true);
      }
    } catch (cause) {
      setEvaluationError({ lessonId, source: "run", message: errorMessage(cause), previousReport: evaluationReport?.directory });
    } finally { setBusy(""); }
  }

  const brand = <Link to="/" className="flex items-center" aria-label="Dojo dashboard"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></Link>;
  const shell = { ...account, brand, workspace: "Dojo", sidebarWidth: "18rem", showNews: false, showOnboarding: false };
  const conversation = <><AgentChat key={`${draftId}:${agentEpoch}`} embedded workspaceId={draftId} persona="kyoshi" sessionId={chatView.session} readOnly={chatView.readOnly}
    onOpened={setOpened} onContinued={() => setChatView({ readOnly: false })}
    onSwitchRequest={agentId => { if (opened) workspaceAgent.request(agentId, { id: opened.id, readOnly: false }); }}
    agents={workspaceAgent.agents} onAgentChange={workspaceAgent.request} agentChanging={workspaceAgent.switching}
    clientContext={{ view: { scope, ...(scope === "lesson" && selectedLessonId ? { lessonId: selectedLessonId } : {}),
      ...(activeFilePath ? { file: activeFilePath, unsavedChanges: dirty } : {}),
    } }} onSessionDropped={() => show({ readOnly: false }, true)} />{workspaceAgent.notice}{workspaceAgent.dialog}</>;
  const history = <ConversationHistory workspaceId={draftId} persona="kyoshi" current={opened?.id} agents={workspaceAgent.list} onPick={pickConversation} />;
  if (!workspace) return <div className="h-dvh overflow-hidden"><AgentChatWorkspace {...shell} navigation={[
    { id: "files", heading: "Course", items: [], before: !error && <WorkspaceSkeleton label="Loading course files" rows={4} /> },
  ]} crumbs={[dashboardCrumb, { label: "Authoring" }]} askAssistant={false}
    editor={<Editor flush>{error ? <div role="alert" className="p-5 text-sm"><p>{error}</p>
      <UIXButton className="mt-4" disabled={Boolean(busy)} onClick={() => void bootstrap()}>Reload workspace</UIXButton></div>
      : <WorkspaceSkeleton />}</Editor>}
    header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Kyoshi</b>{history}</span>}
    conversation={conversation} />
    {toast}</div>;

  const fileLessons = new Map(workspace.lessons.flatMap(lesson => lesson.files.map(file => [file.path, lesson] as const)));
  const manifestDirty = workspace.rootFiles.filter(file => /^(dojo.ya?ml|dojo.json)$/.test(file.path)).some(editorFiles.dirty);
  const sidebarChapters = courseChapters(workspace).map(chapter => ({ ...chapter,
    files: workspace.chapters?.find(entry => entry.id === chapter.id)?.files ?? [],
    lessons: workspace.lessons.filter(lesson => (lesson.chapter?.id ?? "default") === chapter.id).map(lesson => {
      const verdict = lessonStatuses[lesson.id];
      const status = authoringEvaluationStatus(verdict);
      return { ...lesson, status: <Tooltip content={status.label} side="right"><span role="img" tabIndex={0} aria-label={status.label} className="flex size-4 shrink-0 items-center justify-center text-[var(--brand)]">
        {verdict === "passed" ? <Icon icon={DoneIcon} size={13} /> : verdict?.endsWith("failed") ? <Icon icon={Cancel01Icon} size={13} /> : <i className="size-1.5 rounded-full bg-current opacity-60" />}
      </span></Tooltip> };
    }),
  }));
  const sidebar = <CourseAuthoringSidebar courseTitle={workspace.name} courseFiles={workspace.rootFiles} chapters={sidebarChapters}
    selectedFile={activeFilePath} showAllFiles={!onlyCourseFiles} onToggleFiles={() => setOnlyCourseFiles(value => !value)} disabled={Boolean(busy) || manifestDirty}
    onSelectFile={path => { const lesson = fileLessons.get(path); if (lesson) selectLessonFile(lesson, path); else selectRootFile(path); }}
    onAddChapter={() => { if (!busy) void addChapter(); }} onAddLesson={id => { if (!busy) void addLesson(id); }}
    onRenameChapter={(id, title) => { void renameChapter(id, title); }} onRenameLesson={(id, title) => { void renameLesson(id, title); }}
    courseMenu={<TreeTitleMenu title={workspace.name} disabled={Boolean(busy)} onRename={title => { void renameCourse(title); }}
      option={{ label: onlyCourseFiles ? "Show all files" : "Show only course files", onSelect: () => setOnlyCourseFiles(value => !value) }} />}
    card={<AuthoringCourseCard course={{ title: workspace.title ?? workspace.name, author: workspace.author, repo: workspace.repository, version: workspace.version,
      language: workspace.language, lessons: workspace.lessons.length, chapters: sidebarChapters.length,
      art: courseArt(workspace.root, workspace.appearance), shader: workspace.appearance?.shader }}
      disabled={Boolean(busy) || manifestDirty} hint={manifestDirty ? "Save your manifest edits before changing the card color." : undefined}
      onColorChange={color => { void perform("Saving card color…", async () => {
        selectWorkspace(await request<AuthoringDraft>(authoringApi("/api/authoring/course"), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ appearance: { color } }) }));
      }); }} />} />;
  const selectedChapter = workspace.chapters?.find(chapter => chapter.files?.some(file => file.path === activeFilePath));
  const activeResource = reportOpen ? "authoring:evals" : `file:${activeFilePath}`;
  const evaluationAction = scope === "lesson" && selectedLessonId ? <UIXButton size="sm" disabled={Boolean(busy) || !evalReady} onClick={() => void runEvals()} title={evalReady ? "Evaluate selected lesson with configured models and two judges (uses model quota)" : "Complete the authoring checklist first"} type="button">Evaluate lesson</UIXButton> : null;
  return <div className="h-dvh overflow-hidden">
    <AgentChatWorkspace {...shell} navigationTransition={false} contentKind="code" active={activeResource}
      evals={evalsView === "report" && visibleReport ? <AuthoringEvaluationReport report={visibleReport} actions={evaluationAction} /> : <EvalsPanel />}
      evalsOpen={reportOpen} onEvalsOpenChange={open => { if (open) setEvalsView(visibleReport ? "report" : "overview"); setReportOpen(open); }}
      navigation={[{ id: "authoring-views", items: [{ id: "authoring:evals", label: "Evals", icon: EvalsIcon }] }, { id: "authoring-files", items: [], before: sidebar }]}
      onNavigate={id => { if (id === "authoring:evals") { setEvalsView("overview"); setReportOpen(true); } }}
      crumbs={[
        dashboardCrumb,
        { label: workspace.name || "Untitled dojo", onClick: () => selectRootFile(workspace.rootFiles[0]?.path ?? "dojo.yaml") },
        ...(scope === "lesson" && selectedLesson ? [{ label: selectedLesson.title }] : []),
      ]}
      askAssistant={false}
      commands={[{ id: "files", label: "Files", commands: (files ?? []).map(file => ({
        id: `open:${file.path}`, label: file.label, hint: fileLessons.get(file.path)?.title ?? workspace.name,
        icon: <Icon icon={File01Icon} size={16} />, keywords: file.path,
      })) }]}
      onCommand={id => {
        if (id.startsWith("open:")) {
          const path = id.slice(5);
          const lesson = fileLessons.get(path);
          if (lesson) selectLessonFile(lesson, path);
          else selectRootFile(path);
        }
      }}
      editor={<Editor flush className="h-full" tabs={
        <EditorTabs mode="authoring" label="Authoring workspace" active={activeFilePath}
          tabs={editorFiles.tabs.paths.flatMap((path) => { const file = files?.find((entry) => entry.path === path); return file ? [{ path, label: file.label, dirty: editorFiles.dirty(file) }] : []; })}
          onSelect={setActiveFilePath} onClose={editorFiles.close} onMove={editorFiles.move} />
      } actions={busy || previewable ? <div role="toolbar" aria-label="Authoring file actions" className="ml-auto flex min-w-0 items-center gap-2">
        {busy ? <span role="status" className="min-w-0 break-words px-2 text-xs text-[var(--fluid-muted)]">{busy}</span> : null}
        {previewable ? <ViewToggle label={view === "preview" ? "Switch to code" : "Switch to preview"}
          onClick={() => setView(view === "preview" ? "editor" : "preview")}>
          {view === "preview" ? <EditorFileIcon /> : <PreviewFileIcon />}
        </ViewToggle> : null}
      </div> : undefined}><div className="flex h-full min-h-0 flex-col" data-testid="authoring-lesson-pane">
            <section className="flex min-h-0 flex-1 flex-col" data-testid="authoring-workspace">
              <div className="min-h-0 flex-1 overflow-auto">
                {view === "preview" && previewable
                  ? activeFile && <AuthoringFilePreview key={activeFile.path} path={activeFile.path} source={draft} workspace={workspace} />
                  : activeFile
                    ? <Suspense fallback={<WorkspaceSkeleton label="Loading editor" />}>
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
            {error ? <div role="alert" className="flex items-start gap-3 border-t border-dashed px-5 py-2 text-sm text-destructive"><p className="flex-1">{error}</p>
              <UIXButton disabled={Boolean(busy)} onClick={() => void bootstrap()}>Reload workspace</UIXButton>
              <button type="button" className="shrink-0 underline" onClick={() => setError(null)}>Dismiss</button></div> : null}
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
              <AuthoringEvaluationSettings open={evaluationSettingsOpen} onOpenChange={setEvaluationSettingsOpen} api={authoringApi} onSaved={() => setEvaluationError(null)}
                agentName={workspaceAgent.list.find(agent => agent.selected)?.name ?? "this draft's coding agent"} />
              <div className="flex flex-wrap items-center justify-end gap-1 p-1">
                <WorkspaceAction disabled={Boolean(busy)} onClick={() => setEvaluationSettingsOpen(true)}>Evaluation settings</WorkspaceAction>
                <WorkspaceAction icon={<RefreshCw className="size-3.5" />} disabled={Boolean(busy)} onClick={() => void refreshWorkspace()}>Refresh</WorkspaceAction>
                {visibleReport ? <WorkspaceAction disabled={false} onClick={() => { setEvalsView("report"); setReportOpen(!reportOpen); }}>{reportOpen ? "Hide evaluation" : "Evaluation results"}</WorkspaceAction> : null}
                {scope === "lesson" && selectedLesson ? <WorkspaceAction icon={<ExternalLink className="size-3.5" />} disabled={Boolean(busy)} onClick={() => void trialLesson(selectedLesson.id)}>Trial</WorkspaceAction> : null}
                {evaluationAction}
              </div>
            </div>
      </div></Editor>}
      details={<LessonBrief title={scope === "course" ? selectedChapter?.title ?? workspace.name : selectedLesson?.title ?? workspace.name}>
        <CourseContent basePath={null} workspaceId="" diagrams={false}>
          {(scope === "course" ? selectedChapter ? selectedChapter.intro?.content : workspace.intro?.content : selectedLesson?.intro?.content)?.replace(/^# [^\n]+\n+/, "")
            || ""}
        </CourseContent>

      </LessonBrief>}
      header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Kyoshi</b>{history}<span className="ui-as-chat__speaker-note">Master of Senseis and course shaper</span></span>}
      conversation={conversation}>
    </AgentChatWorkspace>
    {toast}
  </div>;

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

function WorkspaceAction({ children, icon, disabled, onClick }: { children: ReactNode; icon?: ReactNode; disabled: boolean; onClick: () => void }) {
  return <UIXButton size="sm" variant="ghost" icon={icon} disabled={disabled} onClick={onClick} type="button">{children}</UIXButton>;
}

function ViewToggle({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <Tooltip content={label} side="bottom">
      <UIXButton size="sm" variant="ghost" aria-label={label} icon={children} onClick={onClick} />
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

/** The draft the page's path names (`/authoring/$draftId`): every authoring request and the watch socket are for it */
function draftIdFromPath(): string | undefined {
  const match = /^\/authoring\/([^/?#]+)/u.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]!) : undefined;
}

function withAuthoringWorkspace(init: RequestInit = {}): RequestInit {
  const workspaceId = draftIdFromPath();
  if (!workspaceId) return init;
  const headers = new Headers(init.headers);
  headers.set("x-dojofoo-workspace", workspaceId);
  return { ...init, headers };
}

function authoringApi(path: string): string {
  if (typeof window === "undefined") return path;
  const workspaceId = draftIdFromPath();
  if (!workspaceId) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("workspace", workspaceId);
  return `${url.pathname}${url.search}${url.hash}`;
}

function errorMessage(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }

export function authoringFiles(
  workspace: AuthoringDraft,
  lesson: AuthoringDraft["lessons"][number] | null
): AuthoringFile[] {
  if (!lesson) return workspace.rootFiles;
  return lesson.files;
}

export function authoringFileUrl(path: string): string {
  return `/api/authoring/files/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function isSaveShortcut(event: Pick<KeyboardEvent, "ctrlKey" | "key" | "metaKey">): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s";
}
