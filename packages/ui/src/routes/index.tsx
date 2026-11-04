import type { CourseAppearance } from "@dojofoo/config";
import type { CoursePosition } from "@/server/control/routes";
import { Link } from "@tanstack/react-router";
import { AiMagicIcon } from "@dojofoo/uix/icons";
import { StreamedChatMessage } from "@/components/chat/streamed-message";
export { StreamedChatMessage, evaluationSummary } from "@/components/chat/streamed-message";
import { AppShell, Dropdown, Icon as UIXIcon, MenuButton, type ShellSection } from "@dojofoo/uix/components/app-shell";
import { AgentChatWorkspace } from "@dojofoo/uix/containers/learning-workspace";
import { Composer } from "@dojofoo/uix/containers/assistant-home";
import { LessonBrief } from "@dojofoo/uix/components/lesson-brief";
import { lessonResources } from "@/lib/lesson-resources";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { WorkspaceSkeleton } from "@dojofoo/uix/components/workspace-skeleton";
import { CourseCard, courseColor } from "@dojofoo/uix/components/course-card";
import { Button as UIXButton } from "@dojofoo/uix/components/button";
import { Editor, EditorTabs } from "@dojofoo/uix/containers/editor";
import { LearningLibrary } from "@dojofoo/uix/containers/learning-library";
import { DashboardPalette } from "@/components/dashboard-palette";
import { ArrowDown01Icon, BackIcon, Cancel01Icon, DoneIcon } from "@dojofoo/uix/icons";
import { LocalDashboard, type LocalSetup } from "@/components/local-onboarding";
import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import type { UIMessage } from "@tanstack/ai-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RefreshAlt as RotateCcw,
  Save as SaveIcon,
  Undo as Undo2,
} from "@mynaui/icons-react";
import { CourseContent } from "@/components/course-content";
import { LessonTestResults } from "@/components/lesson-test-results";
import { failureLines } from "@/lib/lesson-test-results";
import { TerminalOutput } from "@dojofoo/uix/components/terminal-output";
import { ChatTranscript } from "@/components/chat/assistant-response";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dojofoo/ui/dialog";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { useWorkspaceAgent } from "@/hooks/use-workspace-agent";
import { codingAgents } from "@/lib/coding-agents";
import { courseArt } from "@/lib/course-color";
import { dashboardNavigation, dashboardNavigationKey } from "@/lib/dashboard-navigation";
import { httpError } from "@/lib/http-error";
import type { LessonSnapshot, TestReport } from "@/server/lesson/service";
import type { JsonRpcRequest } from "@/server/session/protocol";
import type { AnchoredChatEvent } from "@/lib/chat-timeline";
import type { CheckReportState, GuardViolation } from "@dojofoo/protocol";
import { AgentChat } from "@/components/agent-chat";
import { usePageSocket } from "@/hooks/use-page-socket";
import { type CodeHighlight } from "@/lib/code-highlight";

const CodeEditor = lazy(() => import("@dojofoo/uix/containers/code-editor").then(({ CodeEditor }) => ({ default: CodeEditor })));

export const Route = createFileRoute("/")({ component: () => <LocalDashboard>{setup => <CourseIndex setup={setup} />}</LocalDashboard> });

type ActiveCourse = {
  appearance?: CourseAppearance;
  position?: CoursePosition;
  workspaceId: string;
  runId: string | null;
  dojo: string;
  title: string;
  description: string;
  language: string;
  framework: string | null;
  tags: string[];
  mode: "katas" | "interactive";
  kata: string | null;
  path: string;
  workspaceName: string;
  lastSeenAt: number;
  selected: boolean;
  sessionId: string | null;
  sessions: Array<{ lessonId: string; sessionId: string }>;
};

type AuthoringDraft = { appearance?: CourseAppearance; workspaceId: string; name: string; description: string; mode: string; lastSeenAt: number };

type LessonCheckEvent = {
  lesson: LessonSnapshot;
  observation: import("@/server/lesson/service").CheckObservation;
};

function lessonApi(workspaceId: string, courseId: string, lessonId: string): string {
  return `/api/workspaces/${encodeURIComponent(workspaceId)}/courses/${encodeURIComponent(courseId)}/lessons/${encodeURIComponent(lessonId)}`;
}

async function assertResponse(response: Response): Promise<Response> {
  if (response.ok) return response;
  const body = await response.text();
  throw new Error(body || `Request failed (${response.status})`);
}

function CourseIndex({ setup }: { setup: LocalSetup }) {
  const navigate = useNavigate();
  const { account, toast } = useAccountMenu();
  const [courses, setCourses] = useState<ActiveCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drafts, setDrafts] = useState<AuthoringDraft[]>([]);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [authoringError, setAuthoringError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  useEffect(() => {
    fetch("/api/control/courses")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load active courses (${response.status})`);
        return response.json() as Promise<ActiveCourse[]>;
      })
      .then(setCourses)
      .catch((cause: Error) => setError(cause.message))
      .finally(() => setCoursesLoading(false));
  }, []);
  useEffect(() => {
    fetch("/api/control/authoring")
      .then((response) => response.ok ? response.json() as Promise<AuthoringDraft[]> : [])
      .then(setDrafts)
      .catch(() => setDrafts([]));
  }, []);

  const languages = [...new Set(courses.map(course => course.language))].sort();
  const visibleCourses = courses.filter(course => language === "all" || course.language === language).sort((left, right) => {
    if (sortBy === "name") return left.title.localeCompare(right.title);
    return sortBy === "oldest" ? left.lastSeenAt - right.lastSeenAt : right.lastSeenAt - left.lastSeenAt;
  });
  const openCourse = (courseId: string) => { const course = courses.find(item => item.dojo === courseId); if (course?.runId) void navigate({ to: "/learn/$runId", params: { runId: course.runId } }); };

  async function createCourse() {
    if (creatingCourse) return;
    setCreatingCourse(true);
    setAuthoringError(undefined);
    try {
      const response = await fetch("/api/control/authoring", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "New course" }) });
      if (!response.ok) throw await httpError(response);
      const draft = await response.json() as AuthoringDraft;
      setDrafts(previous => [draft, ...previous.filter(item => item.workspaceId !== draft.workspaceId)]);
      await navigate({ to: "/authoring", search: { workspace: draft.workspaceId } });
    } catch (error) { setAuthoringError(error instanceof Error ? error.message : "Could not create the draft."); }
    finally { setCreatingCourse(false); }
  }

  async function deleteCourse(id: string, authoring = false) {
    try {
      const response = await fetch(`/api/control/${authoring ? "authoring" : "courses"}/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw await httpError(response);
      if (authoring) setDrafts(previous => previous.filter(draft => draft.workspaceId !== id));
      else setCourses(previous => previous.filter(course => course.dojo !== id));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not delete the course."); }
  }

  const explore = () => { void navigate({ to: "/explore" }); };
  const navigation = dashboardNavigation();

  return (
    <div style={{ height: "100dvh" }}>
      <AppShell {...account} workspace="Dojo" sidebarWidth="18rem" brand={<Link to="/" className="flex items-center" aria-label="Dojofoo courses"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></Link>}
        user={setup.user} navigation={navigation} navigationKey={dashboardNavigationKey} active="courses"
        showNews={false} showOnboarding={false}
        onSearch={() => setPaletteOpen(true)} onNavigate={id => { if (id === "explore") explore(); }}>
        <LearningLibrary loading={coursesLoading} error={error ?? undefined} onExplore={explore}
          onNewCourse={() => { void createCourse(); }} newCoursePending={creatingCourse} authoringError={authoringError}
          controls={<>
            <MenuButton label="Language" value={language} onChange={setLanguage}
              options={[{ value: "all", label: "All languages" }, ...languages.map(value => ({ value, label: value }))]} />
            <MenuButton label="Sort local dojos" value={sortBy} onChange={setSortBy}
              options={[{ value: "recent", label: "Most recent" }, { value: "oldest", label: "Oldest activity" }, { value: "name", label: "Course name" }]} />
          </>}
          courses={visibleCourses.map(course => ({ id: course.dojo, title: course.title, color: courseColor(courseArt(course.dojo, course.appearance)), mark: course.language,
            href: `/learn/${encodeURIComponent(course.runId!)}`, caption: course.position?.complete ? "Completed" : course.position ? course.position.lessonTitle : humanTitle(course.kata ?? "Not started"),
            detail: course.position ? `Lesson ${course.position.lessonIndex + 1} of ${course.position.totalLessons}${course.position.slide ? ` · Slide ${course.position.slide} of ${course.position.totalSlides}` : ""}` : course.description,
            progress: course.position ? Math.round(course.position.completedLessons / course.position.totalLessons * 100) : undefined,
            onOpen: () => openCourse(course.dojo), onDelete: () => { void deleteCourse(course.dojo); } }))}
          drafts={drafts.map(draft => ({ id: draft.workspaceId, title: draft.name, color: courseColor(courseArt(draft.workspaceId, draft.appearance)), mark: draft.mode,
            caption: "Draft", detail: draft.description || "Open authoring", href: `/authoring?workspace=${encodeURIComponent(draft.workspaceId)}`, onDelete: () => { void deleteCourse(draft.workspaceId, true); } }))} />
        {toast}
      </AppShell>
      <DashboardPalette open={paletteOpen} onOpenChange={setPaletteOpen} searchLabel="Search your courses"
        placeholder="Search courses, drafts and documentation…" groups={[
          { id: "courses", label: "Courses", commands: courses.map(course => ({ id: `course:${course.dojo}`, label: course.title, keywords: course.language })) },
          { id: "drafts", label: "Authoring", commands: drafts.map(draft => ({ id: `draft:${draft.workspaceId}`, label: draft.name })) },
        ]} onRun={id => {
          if (id.startsWith("course:")) openCourse(id.slice(7));
          else if (id.startsWith("draft:")) void navigate({ to: "/authoring", search: { workspace: id.slice(6) } });
        }} />
    </div>
  );
}

/** A lesson's workspace before its files arrive */
export function LessonLoading({ account, toast, error }: Pick<ReturnType<typeof useAccountMenu>, "account" | "toast"> & { error?: string | null }) {
  const navigate = useNavigate();
  return (
    <div style={{ height: "100dvh" }}><AgentChatWorkspace {...account} workspace="Dojo" sidebarWidth="18rem" brand={<Link to="/" className="flex items-center" aria-label="Dojo dashboard"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></Link>}
      navigation={[{ id: "lessons", heading: "Lessons", items: [], before: !error && <WorkspaceSkeleton label="Loading lessons" rows={4} /> }]}
      showNews={false} showOnboarding={false} askAssistant={false}
      crumbs={[{ label: "Dashboard", icon: <UIXIcon icon={BackIcon} size={14} />, onClick: () => { void navigate({ to: "/" }); } }]}
      editor={<Editor flush>{error ? <p role="alert" className="p-5 text-sm text-destructive">{error}</p> : <WorkspaceSkeleton />}</Editor>}
      header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Sensei</b></span>}
      composer={<Composer tray={false} disabled models={[]} attachments="unavailable" dictation={false} plugins={false}
        agent={{ name: "Coding agent", icon: AiMagicIcon }} placeholder="Ask your Sensei…" />} />{toast}</div>
  );
}

export function LessonPage({ runId, initialLesson, requestedCourseId, requestedLessonId, requestedSessionId, requestedWorkspaceId }: {
  /** The course run the page's address names (`/learn/$runId`) */
  runId: string;
  initialLesson?: LessonSnapshot;
  requestedCourseId?: string;
  requestedLessonId?: string;
  /** A conversation from the URL or a history pick; AgentChat asks for it as the page's default (D29) */
  requestedSessionId?: string;
  requestedWorkspaceId?: string;
}) {
  const navigate = useNavigate();
  const { account, toast } = useAccountMenu({ preserveWorkspace: true });
  const [lesson, setLesson] = useState<LessonSnapshot | null>(initialLesson ?? null);
  const [courses, setCourses] = useState<ActiveCourse[]>([]);
  const [coursesReady, setCoursesReady] = useState(false);
  const [selectedWorkspaceId, setWorkspaceId] = useState("");
  const workspaceId = requestedWorkspaceId ?? selectedWorkspaceId;
  const [code, setCode] = useState(initialLesson?.code ?? "");
  const [editorHighlight, setEditorHighlight] = useState<(CodeHighlight & { nonce: number }) | undefined>();
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"code" | "tests">("code");
  const [checking, setChecking] = useState(false);
  const [liveTests, setLiveTests] = useState<TestReport["tests"]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [modelNotice, setModelNotice] = useState("");
  const [busy, setBusy] = useState("Loading your dojo…");
  const [error, setError] = useState<string | null>(null);
  // Check cards in the conversation: one per Check this page ran, labelled with what Sensei saw (D16)
  const [checkCards, setCheckCards] = useState<Array<{ observationId: string; report: TestReport; state?: CheckReportState }>>([]);
  const ownChecks = useRef(0);
  const [guardNotice, setGuardNotice] = useState<GuardViolation | null>(null);
  // The conversation the page asks AgentChat for: the URL's, or a replacement the server made
  const [session, setSession] = useState(requestedSessionId);
  useEffect(() => { setSession(requestedSessionId); }, [requestedSessionId]);
  const [agentEpoch, setAgentEpoch] = useState(0);
  const chat = useRef<{ send(text: string): void } | null>(null);
  const lessonUrl = useRef("");
  const workspaceAgent = useWorkspaceAgent({ workspaceId, persona: "sensei", onSwitched: agentId => {
    setCheckCards([]);
    setModelNotice(`Sensei now uses ${codingAgents.find(agent => agent.value === agentId)?.name ?? agentId} in this workspace.`);
    setAgentEpoch(epoch => epoch + 1);
    // The lesson's agent is read again; its files and unsaved edits stay as they are
    if (lessonUrl.current) void fetch(`${lessonUrl.current}?prepare=false`).then(response => response.ok ? response.json() as Promise<LessonSnapshot> : undefined)
      .then(next => { if (next) setLesson(current => current ? { ...current, harness: next.harness } : current); }, () => {});
  } });
  const undoEditor = useRef<(() => boolean) | null>(null);
  const selectedCourse = courses.find((course) => course.workspaceId === workspaceId && (!requestedCourseId || course.dojo === requestedCourseId));
  const selectedLessonId = requestedLessonId
    ?? selectedCourse?.sessions.find((item) => item.sessionId === requestedSessionId)?.lessonId
    ?? selectedCourse?.kata ?? undefined;
  const dojoId = requestedCourseId ?? selectedCourse?.dojo;
  const apiBase = workspaceId && dojoId && selectedLessonId
    ? lessonApi(workspaceId, dojoId, selectedLessonId)
    : "";
  lessonUrl.current = apiBase;
  const dirty = lesson ? code !== lesson.code : false;
  const highlightCode = useCallback((highlight: CodeHighlight) => {
    setActiveWorkspaceTab("code");
    setEditorHighlight((current) => ({ ...highlight, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

  const hydrate = useCallback((next: LessonSnapshot) => {
    setLesson(next);
    setCode(next.code);
    setCheckCards([]);
    setGuardNotice(null);
    setBusy("");
    setError(null);
  }, []);

  useEffect(() => {
    fetch("/api/control/courses")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load active courses (${response.status})`);
        return response.json() as Promise<ActiveCourse[]>;
      })
      .then((activeCourses) => {
        const stored = window.localStorage.getItem("dojofoo.workspace");
        const selected = activeCourses.find((course) => course.workspaceId === requestedWorkspaceId && (!requestedCourseId || course.dojo === requestedCourseId))
          ?? activeCourses.find((course) => course.sessions.some((item) => item.sessionId === requestedSessionId))
          ?? activeCourses.find((course) => course.workspaceId === stored)
          ?? activeCourses.find((course) => course.selected)
          ?? activeCourses[0];
        setCourses(activeCourses);
        setWorkspaceId(selected?.workspaceId ?? "");
        setCoursesReady(true);
      })
      .catch((cause: Error) => {
        setCoursesReady(true);
        if (!requestedWorkspaceId || !requestedCourseId || !requestedLessonId) setError(cause.message);
      });
  }, [requestedCourseId, requestedLessonId, requestedSessionId, requestedWorkspaceId]);

  useEffect(() => {
    if (!coursesReady || apiBase) return;
    setBusy("");
    setError(current => current ?? (selectedCourse ? "This course has no lesson to continue." : "Course not found."));
  }, [apiBase, coursesReady, selectedCourse]);

  // The learner's read: files, material and results, never a conversation (constraint 2)
  useEffect(() => {
    if (!apiBase) return;
    if (initialLesson && initialLesson.dojo === dojoId && initialLesson.kata === selectedLessonId) {
      hydrate(initialLesson);
      return;
    }
    setLesson(null);
    setModelNotice("");
    const controller = new AbortController();
    fetch(`${apiBase}?prepare=false`, { signal: controller.signal })
      .then(async (response) => ({ response, body: (await response.json()) as LessonSnapshot | { error: string } | null }))
      .then(({ response, body }) => {
        if (!response.ok) throw new Error(body && "error" in body ? body.error : `Could not load the dojo (${response.status})`);
        if (body && !("error" in body)) {
          if (requestedCourseId && body.dojo !== requestedCourseId) throw new Error("Course not found.");
          if (controller.signal.aborted) return;
          hydrate(body);
        }
      })
      .catch((cause: Error) => {
        if (controller.signal.aborted) return;
        setBusy("");
        setError(cause.message);
      });
    return () => controller.abort();
  }, [apiBase, dojoId, hydrate, initialLesson, requestedCourseId, selectedLessonId]);

  const codeRef = useRef(code);
  codeRef.current = code;
  const lessonRef = useRef(lesson);
  lessonRef.current = lesson;
  /** The file as the server has it now: after a guard restore, the editor shows it unless the learner has unsaved changes */
  const restoredFile = useCallback(async () => {
    const current = lessonRef.current;
    if (!apiBase || !current) return;
    const response = await fetch(`${apiBase}/files/${encodeURIComponent(current.fileId)}`).then(assertResponse);
    const file = await response.json() as { attributes: { content: string } };
    setLesson(previous => previous ? { ...previous, code: file.attributes.content, result: null } : previous);
    setCode(file.attributes.content);
  }, [apiBase]);

  // The lesson page's socket (D19): its presence, the Check, the check cards, guard notices, replacements and navigation
  const socket = usePageSocket({ workspace: workspaceId, course: dojoId, lesson: selectedLessonId }, message => {
    const params = (message.params ?? {}) as Partial<LessonCheckEvent> & { test?: TestReport["tests"][number]; observationId?: string; state?: CheckReportState;
      to?: string; lessonId?: string; courseId?: string };
    if (message.method === "lesson.check.started") {
      setLiveTests([]);
      setChecking(true);
    } else if (message.method === "lesson.check.test" && params.test) {
      setLiveTests((current) => [...current, params.test!]);
    } else if (message.method === "lesson.check.completed" && params.observation) {
      const observation = params.observation;
      setLesson((current) => current ? { ...current, result: observation.report } : current);
      if (ownChecks.current > 0) {
        ownChecks.current--;
        setCheckCards(current => [...current.filter(card => card.observationId !== observation.id), { observationId: observation.id, report: observation.report }]);
      }
      setChecking(false);
    } else if (message.method === "lesson.check.report" && params.observationId && params.state) {
      setCheckCards(current => current.map(card => card.observationId === params.observationId
        // A seen report stays seen; a later "sent" for it changes nothing
        ? { ...card, state: card.state === "seen" ? "seen" : params.state } : card));
    } else if (message.method === "guard.violation") {
      setGuardNotice(params as unknown as GuardViolation);
      if (codeRef.current === lessonRef.current?.code) void restoredFile().catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
      else setLesson(current => current ? { ...current, result: null } : current);
    } else if (message.method === "session.replaced" && params.to) {
      setSession(params.to);
    } else if (message.method === "lesson.navigated" && params.lessonId) {
      void viewLesson(params.lessonId, params.courseId);
    } else if (message.error?.message) {
      setChecking(false);
      setError(message.error.message);
    }
  });

  async function check() {
    setActiveWorkspaceTab("tests");
    setChecking(true);
    try {
      if (!apiBase || !lesson) throw new Error("No lesson is available");
      await fetch(`${apiBase}/files/${encodeURIComponent(lesson.fileId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: code }),
      }).then(assertResponse);
      setLesson(current => current ? { ...current, code } : current);
      const current = socket.current;
      if (!current || current.readyState !== WebSocket.OPEN) throw new Error("The lesson connection is not ready yet");
      ownChecks.current++;
      current.send(JSON.stringify({
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "lesson.check",
        params: { courseId: dojoId, lessonId: selectedLessonId },
      } satisfies JsonRpcRequest));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
      setChecking(false);
    }
  }

  async function reset() {
    try {
      if (!apiBase || !lesson) throw new Error("No lesson is available");
      await fetch(`${apiBase}/files/${encodeURIComponent(lesson.fileId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: lesson.starterCode }),
      }).then(assertResponse);
      setCode(lesson.starterCode);
      setLesson(current => current ? { ...current, code: lesson.starterCode, result: null } : current);
      setError(null);
      setActiveWorkspaceTab("code");
      setResetDialogOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
    }
  }

  async function viewLesson(name: string, courseId?: string) {
    const targetCourseId = courseId ?? lesson?.dojo ?? dojoId;
    if (!targetCourseId) return setError("Course not found");
    // The page's own run for its course, which a second installation of the course id doesn't hide (decision 22); another course's from the list
    const targetRunId = targetCourseId === (lesson?.dojo ?? dojoId) ? runId
      : courses.find(course => course.dojo === targetCourseId && course.workspaceId === workspaceId)?.runId;
    if (!targetRunId) return setError("Course not found");
    setActiveWorkspaceTab("code");
    await navigate({ to: "/learn/$runId", params: { runId: targetRunId }, search: { lesson: name } });
  }

  /** D25's fallback: once the checks pass, the learner can open the next lesson without Sensei's question */
  async function openNextLesson() {
    if (!apiBase) return;
    setBusy("Opening the next lesson…");
    try {
      const response = await fetch(`${apiBase}/progressions`, { method: "POST" });
      const body = await response.json() as LessonSnapshot | { error: string };
      if (!response.ok || "error" in body) throw new Error("error" in body ? body.error : `Could not open the next lesson (${response.status})`);
      setBusy("");
      await viewLesson(body.kata, body.dojo);
    } catch (cause) {
      setBusy("");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  const save = useCallback(async (nextCode = code) => {
    if (!lesson?.isCurrent || nextCode === lesson.code) return;
    try {
      if (!apiBase) throw new Error("No lesson is available");
      await fetch(`${apiBase}/files/${encodeURIComponent(lesson.fileId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: nextCode }),
      }).then(assertResponse);
      setLesson(current => current ? { ...current, code: nextCode } : current);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [apiBase, code, lesson]);

  useEffect(() => {
    const onSave = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !lesson?.isCurrent || event.key.toLowerCase() !== "s" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      void save();
    };
    window.addEventListener("keydown", onSave);
    return () => window.removeEventListener("keydown", onSave);
  }, [lesson?.isCurrent, save]);

  const hostEvents = useMemo<AnchoredChatEvent[]>(() => checkCards.map(card => ({
    afterMessageId: null,
    message: {
      id: `host-check:${card.observationId}`,
      role: "assistant",
      parts: [
        { type: "tool-call", id: `check:${card.observationId}`, name: "dojo_lesson_verify", arguments: "{}", input: {}, state: "complete", output: card.report },
        ...(card.state ? [{ type: "text" as const, content: checkCardLabel(card.state) }] : []),
      ],
    } as UIMessage,
  })), [checkCards]);

  if (!lesson) return <LessonLoading account={account} toast={toast} error={error} />;

  const lessonIndex = lesson.lessons.findIndex(item => item.name === lesson.kata);
  const nextLessonAvailable = lesson.isCurrent && Boolean(lesson.result?.complete || lesson.state === "completed") && lessonIndex >= 0 && lessonIndex < lesson.lessons.length - 1;
  const navigation: ShellSection[] = [
    { id: "lessons", heading: "Lessons", layout: "lessons", before: <div className="lj-course"><CourseCard
      course={{ title: lesson.course?.title ?? "Course", version: lesson.course?.version, author: lesson.course?.author,
        repo: lesson.course?.repository, language: lesson.course?.language, lessons: lesson.course?.lessons ?? lesson.lessons.length, art: courseArt(lesson.dojo, lesson.course?.appearance), shader: lesson.course?.appearance?.shader }}
      enrolled={{ version: lesson.course?.version, progress: Math.round(lesson.lessons.filter(item => item.state === "completed").length / lesson.lessons.length * 100), value: lesson.title }} />
    </div>, items: lesson.lessons.map((item, index) => ({
      id: `lesson:${item.name}`, label: item.title, marker: String(index + 1).padStart(2, "0"),
      state: item.state === "completed" ? "done" : item.isCurrent ? "active" : "locked",
      note: item.state !== "completed" && !item.isCurrent ? "Upcoming lesson; expand to preview its goal" : undefined,
      ...(item.name === lesson.kata || item.state !== "completed" && !item.isCurrent
        ? { preview: <p>{item.summary}</p> }
        : { onClick: () => { void viewLesson(item.name); } }),
    })) },
  ];
  if ((lesson.course?.chapters?.length ?? 0) > 1) {
    const rows = navigation[0]!.items;
    navigation[0]!.heading = "Chapters";
    navigation[0]!.items = lesson.course!.chapters!.map((chapter, index) => ({
      id: `chapter:${chapter.id}`, label: chapter.title, marker: String(index + 1).padStart(2, "0"),
      children: rows.filter(row => (lesson.lessons.find(item => row.id === `lesson:${item.name}`)?.chapter?.id ?? "default") === chapter.id).map((row, index) => ({ ...row, marker: String(index + 1).padStart(2, "0") })),
    }));
  }
  return <div style={{ height: "100dvh" }}><AgentChatWorkspace {...account} brand={<Link to="/" className="flex items-center" aria-label="Dojo dashboard"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></Link>}
    workspace="Dojo" showNews={false} showOnboarding={false} sidebarWidth="18rem"
    navigation={navigation} navigationKey={`${workspaceId}:${lesson.dojo}`} active={`lesson:${lesson.kata}`} navigationTransition={false}
    onNavigate={id => { if (id.startsWith("lesson:")) void viewLesson(id.slice(7)); }}
    crumbs={[{ label: "Dashboard", icon: <UIXIcon icon={BackIcon} size={14} />, onClick: () => { void navigate({ to: "/" }); } }, { label: lesson.course?.name ?? humanTitle(lesson.dojo) }, { label: lesson.title }]}
    commands={[
      { id: "lessons", label: "Lessons", commands: lesson.lessons.filter(item => item.state === "completed" || item.isCurrent).map(item => ({ id: `lesson:${item.name}`, label: item.title })) },
      { id: "files", label: "Lesson workspace", commands: [{ id: "view:code", label: lesson.filePath }, { id: "view:tests", label: "Test results" }] },
    ]}
    askAssistant onCommand={(id, query) => {
      if (id === "view:code") setActiveWorkspaceTab("code");
      else if (id === "view:tests") setActiveWorkspaceTab("tests");
      else if (id.startsWith("lesson:")) void viewLesson(id.slice(7));
      else if (id === "ask" && query?.trim()) chat.current?.send(query.trim());
    }}
    editor={<div className="h-full w-full" data-testid="lesson-workspace">
              <Editor className="h-full" flush tabs={
                <EditorTabs mode="learning" label="Lesson workspace" active={activeWorkspaceTab}
                  onSelect={(path) => { if (path === "code" || path === "tests") setActiveWorkspaceTab(path); }}
                  tabs={[
                    { path: "code", label: <span className="font-mono">{fileName(lesson.filePath)}</span>, dirty, panelId: "code-panel" },
                    { path: "tests", panelId: "tests-panel", label: <><TestStateIcon report={lesson.result} /><span>Tests</span><span className="text-xs text-muted-foreground">{testPercentage(lesson.result)}</span></> },
                  ]} />} actions={lesson.isCurrent || busy ? <>
                {busy && <span className="ml-auto self-center px-3 text-xs text-muted-foreground">{busy}</span>}
                {lesson.isCurrent && (
                  <div aria-label="Lesson actions" className={`${busy ? "" : "ml-auto"} flex shrink-0 items-center gap-1 px-1`} role="toolbar">
                    <UIXButton size="sm" variant="ghost"
                      icon={<RotateCcw className="size-3.5" />}
                      disabled={Boolean(busy)}
                      onClick={() => setResetDialogOpen(true)}
                      type="button"
                    >
                      Reset
                    </UIXButton>
                    <UIXButton size="sm" variant="ghost"
                      icon={<Undo2 className="size-3.5" />}
                      aria-keyshortcuts="Control+Z Meta+Z"
                      disabled={Boolean(busy)}
                      onClick={() => undoEditor.current?.()}
                      type="button"
                    >
                      Undo
                    </UIXButton>
                    <UIXButton size="sm" variant="ghost"
                      icon={<SaveIcon className="size-3.5" />}
                      aria-keyshortcuts="Control+S Meta+S"
                      disabled={!dirty || Boolean(busy)}
                      onClick={() => void save()}
                      type="button"
                    >
                      Save
                    </UIXButton>
                    <UIXButton size="sm"
                      disabled={Boolean(busy)}
                      onClick={() => void check()}
                      type="button"
                    >
                      Check
                    </UIXButton>
                    {nextLessonAvailable && <UIXButton size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => void openNextLesson()} type="button">
                      Open next lesson
                    </UIXButton>}
                  </div>
                )}
              </> : undefined}>
              <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                <DialogContent className="ui-as" style={{ borderRadius: "var(--box-radius)", background: "var(--surface-5)", boxShadow: "var(--shadow-5)" }}>
                  <DialogHeader>
                    <DialogTitle>Reset this lesson?</DialogTitle>
                    <DialogDescription>
                      Restore the original scaffold. Your current solution will be discarded.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<UIXButton variant="ghost">Cancel</UIXButton>} />
                    <UIXButton disabled={Boolean(busy)} onClick={() => void reset()}>
                      Reset lesson
                    </UIXButton>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {guardNotice && <div role="status" data-testid="guard-notice" className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-3)] px-3 py-2 text-sm">
                <span>The file changed while Sensei was working. Dojofoo restored the version from before Sensei's turn.{guardNotice.quarantined ? ` The other version is at ${guardNotice.quarantined}.` : ""}</span>
                {dirty && <UIXButton size="sm" variant="secondary" type="button" onClick={() => { void restoredFile().catch(cause => setError(cause instanceof Error ? cause.message : String(cause))); }}>Use the restored file</UIXButton>}
                <UIXButton size="sm" variant="ghost" type="button" onClick={() => setGuardNotice(null)}>Dismiss</UIXButton>
              </div>}
              <div className="h-full min-h-0 overflow-hidden" data-testid="lesson-canvas">
                <div className="h-full" hidden={activeWorkspaceTab !== "code"} id="code-panel" role="tabpanel">
                  <ClientOnly fallback={<div className="h-full animate-pulse bg-[var(--ui-ed-surface)]" />}>
                    <Suspense fallback={<WorkspaceSkeleton label="Loading editor" />}>
                      <CodeEditor
                        code={code}
                        coverage={true}
                        failedLines={failureLines(lesson.result, lesson.filePath)}
                        filePath={lesson.filePath}
                        language={lesson.language}
                        highlight={editorHighlight}
                        lineHits={lesson.result?.coverage?.lineHits}
                        key={lesson.kata}
                        onChange={setCode}
                        onSave={(value) => void save(value)}
                        onUndoReady={(undo) => { undoEditor.current = undo; }}
                        readOnly={!lesson.isCurrent}
                        lessonApiBase={apiBase}
                      />
                    </Suspense>
                  </ClientOnly>
                </div>
                <div className="h-full overflow-auto" hidden={activeWorkspaceTab !== "tests"} id="tests-panel" role="tabpanel">
                  <LessonTestResults report={lesson.result} running={checking} tests={liveTests}
                    filePath={lesson.filePath} onReveal={({ line }) => highlightCode({ from: line, to: line })} />
                </div>
              </div>
              </Editor>
            </div>}
    details={<div data-testid="lesson-pane">
      <LessonMaterial lesson={lesson} workspaceId={workspaceId} />
      {error && <p role="alert" className="mt-4 text-sm text-[var(--destructive)]">{error}</p>}
    </div>}
    header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Sensei</b><span className="ui-as-chat__speaker-note">Teaches this lesson</span></span>}
    conversation={<div data-testid="chat-pane" className="contents" data-host-event-count={hostEvents.length}>
      <AgentChat key={`${workspaceId}:${lesson.dojo}:${lesson.kata}:${agentEpoch}`} embedded workspaceId={workspaceId} persona="sensei"
        page={{ course: lesson.dojo, lesson: lesson.kata }} sessionId={session}
        onSessionDropped={() => { void navigate({ to: "/learn/$runId", params: { runId }, search: { lesson: lesson.kata }, replace: true }); }} hostEvents={hostEvents} fragments={lesson.fragments} onHighlight={highlightCode}
        controls={chat} agents={workspaceAgent.agents} onAgentChange={workspaceAgent.request} agentChanging={workspaceAgent.switching} />
      {modelNotice && <p role="status" className="px-2 pt-1 text-xs text-muted-foreground">{modelNotice}</p>}
      {workspaceAgent.notice}
      {workspaceAgent.dialog}
    </div>} />{toast}</div>;

}

/** The check card's label (D16): held and sent wait for Sensei; consumed, or read through context, is seen */
function checkCardLabel(state: CheckReportState): string {
  if (state === "seen") return "Sensei saw this";
  if (state === "dropped") return "Sensei hasn't seen this; press Check again or ask";
  return "Sensei will see this after it finishes";
}

function middleEllipsis(value: string, visibleCharacters = 22): string {
  if (value.length <= visibleCharacters) return value;
  const startLength = Math.ceil(visibleCharacters / 2);
  const endLength = Math.floor(visibleCharacters / 2);
  return `${value.slice(0, startLength)}…${value.slice(-endLength)}`;
}

function TestStateIcon({ report }: { report: TestReport | null }) {
  const glyph = report?.failed ? Cancel01Icon : report?.passed ? DoneIcon : undefined;
  return <span role="img" aria-label={report ? `${report.passed} of ${report.total} tests passed` : "Tests not run"}
    className="inline-flex size-3.5 items-center justify-center text-[var(--brand)]">
    {glyph ? <UIXIcon icon={glyph} size={14} /> : <span className="size-1 rounded-full bg-current" />}
  </span>;
}

function testPercentage(report: TestReport | null): string {
  if (!report || report.total === 0) return "—";
  return `${Math.round((report.passed / report.total) * 100)}%`;
}

function LessonMaterial({ lesson, workspaceId }: { lesson: LessonSnapshot; workspaceId: string }) {
  const basePath = lesson.briefingBasePath ?? null;
  const resources = useMemo(() => lessonResources(lesson.briefing, basePath, workspaceId), [lesson.briefing, basePath, workspaceId]);
  const body = (content: string) => content.replace(/^# [^\n]+\n+/, "");
  const chapterFirst = lesson.lessons.find(item => (item.chapter?.id ?? "default") === lesson.chapter?.id)?.name === lesson.kata;
  const overview = (title: string, intro: NonNullable<LessonSnapshot["intro"]>) => <LessonBrief title={title}>
    <CourseContent basePath={intro.path.includes("/") ? intro.path.slice(0, intro.path.lastIndexOf("/")) : null} workspaceId={workspaceId} courseId={lesson.dojo} diagrams={false}>{body(intro.content)}</CourseContent>
  </LessonBrief>;
  return <>
    {lesson.lessons[0]?.name === lesson.kata && lesson.course?.intro && overview(lesson.course.title ?? lesson.course.name, lesson.course.intro)}
    {chapterFirst && lesson.chapter?.intro && overview(lesson.chapter.title, lesson.chapter.intro)}
    <LessonBrief title={lesson.title} resources={resources}>
      <CourseContent basePath={basePath} workspaceId={workspaceId} courseId={lesson.dojo} diagrams={false}>{lesson.intro ? body(lesson.briefing) : lesson.briefing}</CourseContent>
    </LessonBrief>
  </>;

}

function LiveCheckSummary({ tests }: { tests: TestReport["tests"] }) {
  const lines = tests.map((test) => `${test.status === "passed" ? "✓" : test.status === "failed" ? "×" : "-"} ${test.name}`);
  return <TerminalOutput label="Running lesson checks" status="running" lines={lines} />;
}

function humanTitle(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}
