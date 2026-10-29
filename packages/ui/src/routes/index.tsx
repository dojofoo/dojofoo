import { AiMagicIcon } from "@dojofoo/uix/icons";
import { StreamedChatMessage } from "@/components/chat/streamed-message";
export { StreamedChatMessage, evaluationSummary } from "@/components/chat/streamed-message";
import { AppShell, Dropdown, Icon as UIXIcon, MenuButton, type ShellSection } from "@dojofoo/uix/components/app-shell";
import { AgentChatWorkspace } from "@dojofoo/uix/containers/learning-workspace";
import { Composer } from "@dojofoo/uix/containers/assistant-home";
import { LessonBrief } from "@dojofoo/uix/components/lesson-brief";
import { followLink } from "@dojofoo/uix/lib/link-event";
import { lessonResources } from "@/lib/lesson-resources";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { WorkspaceSkeleton } from "@dojofoo/uix/components/workspace-skeleton";
import { CourseCard, courseColor } from "@dojofoo/uix/components/course-card";
import { Button as UIXButton } from "@dojofoo/uix/components/button";
import { Editor, EditorTabs } from "@dojofoo/uix/containers/editor";
import { LearningLibrary } from "@dojofoo/uix/containers/learning-library";
import { DashboardPalette } from "@/components/dashboard-palette";
import { ArrowDown01Icon, BackIcon, Cancel01Icon, DoneIcon } from "@dojofoo/uix/icons";
import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { fetchServerSentEvents, useChat, type UIMessage } from "@tanstack/ai-react";
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
import { codingAgents } from "@/lib/coding-agents";
import { courseArt } from "@/lib/course-color";
import { dashboardNavigation, dashboardNavigationKey } from "@/lib/dashboard-navigation";
import { starterCourses } from "@/lib/starter-courses";
import { authoringSessionLink, authoringSessionSearch } from "@/lib/authoring-session-link";
import { httpError } from "@/lib/http-error";
import type { LessonSnapshot, TestReport } from "@/server/lesson/service";
import type { JsonRpcRequest } from "@/server/session/protocol";
import { projectChatTimeline, type AnchoredChatEvent } from "@/lib/chat-timeline";
import { chatAcceptsInput, isInternalLessonMessage, lessonIntroductionCanStart } from "@/lib/chat-internal";
import { useChatWorkTiming } from "@/lib/chat-work-timing";
import { type CodeHighlight } from "@/lib/code-highlight";

const CodeEditor = lazy(() => import("@dojofoo/uix/containers/code-editor").then(({ CodeEditor }) => ({ default: CodeEditor })));
const INTRODUCTION_MESSAGE = "[dojo:begin-lesson]";
const CHECK_OBSERVATION_MESSAGE = "[dojo:check-observation]";

export const Route = createFileRoute("/")({ component: CourseIndex });

type ActiveCourse = {
  workspaceId: string;
  runId: string | null;
  dojo: string;
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

type CourseGroup = {
  dojo: string;
  workspaces: ActiveCourse[];
};
type AuthoringDraft = { workspaceId: string; name: string; description: string; mode: string; lastSeenAt: number };

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

function CourseIndex() {
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
  const [courseChoice, setCourseChoice] = useState<CourseGroup | null>(null);
  const [courseChoiceOpen, setCourseChoiceOpen] = useState(false);
  const [choiceWorkspaceId, setChoiceWorkspaceId] = useState("");
  const [choiceSessionId, setChoiceSessionId] = useState("current");
  const [openingCourse, setOpeningCourse] = useState(false);
  const [courseOpenError, setCourseOpenError] = useState<string>();
  const courseOpenRequest = useRef<AbortController | null>(null);
  useEffect(() => () => courseOpenRequest.current?.abort(), []);

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

  const groups = groupCourses(courses);
  const starters = starterCourses.filter(item => !groups.some(group => group.dojo === item.id));
  const languages = [...new Set(groups.flatMap((group) => group.workspaces.map((course) => course.language)))].sort();
  const visibleCourses = groups
    .filter((group) => language === "all" || group.workspaces.some((course) => course.language === language))
    .sort((left, right) => {
      const leftSeen = courseGroupLastSeen(left);
      const rightSeen = courseGroupLastSeen(right);
      if (sortBy === "oldest") return leftSeen - rightSeen;
      if (sortBy === "name") return humanTitle(left.dojo).localeCompare(humanTitle(right.dojo));
      return rightSeen - leftSeen;
    });

  async function openCourse(course: ActiveCourse, sessionId?: string | null, signal?: AbortSignal) {
    window.localStorage.setItem("dojofoo.workspace", course.workspaceId);
    if (course.mode === "interactive") {
      await navigate({ to: "/interactive", search: { workspace: course.workspaceId, course: course.dojo } });
      return;
    }
    if (sessionId === null && course.kata) {
      const response = await fetch(`${lessonApi(course.workspaceId, course.dojo, course.kata)}/sessions`, { method: "POST", signal });
      await assertResponse(response);
      const started = await response.json() as LessonSnapshot;
      if (signal?.aborted) return;
      if (started.sessionId) {
        await navigate({ to: "/session/$sessionId", params: { sessionId: started.sessionId },
          state: { lesson: { workspaceId: course.workspaceId, courseId: course.dojo, lessonId: started.kata, sessionId: started.sessionId } } });
        return;
      }
    }
    const existingSession = sessionId === undefined ? course.sessionId : sessionId;
    if (existingSession) {
      const lessonId = course.sessions.find(session => session.sessionId === existingSession)?.lessonId;
      await navigate({ to: "/session/$sessionId", params: { sessionId: existingSession },
        state: lessonId ? { lesson: { workspaceId: course.workspaceId, courseId: course.dojo, lessonId, sessionId: existingSession } } : undefined });
      return;
    }
    if (course.kata) {
      await navigate({
        to: "/course/$workspaceId/$courseId/lesson/$lessonId",
        params: { workspaceId: course.workspaceId, courseId: course.dojo, lessonId: course.kata },
      });
      return;
    }
    await navigate({ to: "/course/$workspaceId", params: { workspaceId: course.workspaceId } });
  }

  function chooseCourse(group: CourseGroup) {
    setCourseOpenError(undefined);
    if (group.workspaces.length === 1) {
      void openCourse(group.workspaces[0]);
      return;
    }
    const workspace = preferredWorkspace(group);
    setCourseChoice(group);
    setCourseChoiceOpen(true);
    setChoiceWorkspaceId(workspace.workspaceId);
    setChoiceSessionId(workspace.sessionId ?? "current");
  }

  const choiceWorkspace = courseChoice?.workspaces.find((course) => course.workspaceId === choiceWorkspaceId) ?? null;

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

  const explore = () => { void navigate({ to: "/explore" }); };
  const navigation = dashboardNavigation();

  return (
    <div style={{ height: "100dvh" }}>
      <AppShell {...account} workspace="Dojo" sidebarWidth="18rem" brand={<a href="/" className="flex items-center" aria-label="Dojofoo courses"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></a>}
        navigation={navigation} navigationKey={dashboardNavigationKey} active="courses"
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
          courses={[...visibleCourses.map(group => {
            const course = preferredWorkspace(group);
            const single = group.workspaces.length === 1;
            const href = !single || course.mode === "interactive" ? undefined
              : course.sessionId ? `/session/${encodeURIComponent(course.sessionId)}`
              : course.kata ? `/course/${encodeURIComponent(course.workspaceId)}/${encodeURIComponent(course.dojo)}/lesson/${encodeURIComponent(course.kata)}`
              : `/course/${encodeURIComponent(course.workspaceId)}`;
            return { id: group.dojo, title: humanTitle(course.dojo), color: courseColor(courseArt(group.dojo)), mark: course.language, href,
              caption: single ? course.mode === "interactive" ? "Interactive lesson" : humanTitle(course.kata ?? "Not started") : `${group.workspaces.length} workspaces`,
              detail: single ? course.workspaceName : "Choose where to continue", onOpen: () => chooseCourse(group) };
          }), ...(language === "all" ? starters.map(course => ({ id: `starter:${course.id}`, title: course.title, color: courseColor(course.art), mark: "Dojo",
            caption: "Draft starter", detail: "Install to begin", href: `/starter/${encodeURIComponent(course.id)}`,
            onOpen: () => { void navigate({ to: "/starter/$courseId", params: { courseId: course.id } }); },
          })) : [])]}
          drafts={drafts.map(draft => ({ id: draft.workspaceId, title: humanTitle(draft.name), color: courseColor(courseArt(draft.workspaceId)), mark: draft.mode,
            caption: "Draft", detail: draft.description || "Open authoring", href: authoringSessionLink(draft.workspaceId) }))} />
        {toast}
      </AppShell>
      <DashboardPalette open={paletteOpen} onOpenChange={setPaletteOpen} searchLabel="Search your courses"
        placeholder="Search courses, drafts and documentation…" groups={[
          { id: "courses", label: "Courses", commands: groups.map(group => ({ id: `course:${group.dojo}`, label: humanTitle(group.dojo), keywords: preferredWorkspace(group).language })) },
          { id: "starters", label: "Starter courses", commands: starters.map(course => ({ id: `starter:${course.id}`, label: course.title, keywords: course.blurb })) },
          { id: "drafts", label: "Authoring", commands: drafts.map(draft => ({ id: `draft:${draft.workspaceId}`, label: humanTitle(draft.name) })) },
        ]} onRun={id => {
          if (id.startsWith("course:")) { const group = groups.find(item => item.dojo === id.slice(7)); if (group) chooseCourse(group); }
          else if (id.startsWith("draft:")) void navigate({ to: "/authoring", search: authoringSessionSearch(id.slice(6)) });
          else if (id.startsWith("starter:")) void navigate({ to: "/starter/$courseId", params: { courseId: id.slice(8) } });
        }} />
      <Dialog open={courseChoiceOpen} onOpenChange={open => {
        setCourseChoiceOpen(open);
        if (!open) courseOpenRequest.current?.abort();
      }}>
        <DialogContent className="ui-as" style={{ borderRadius: "var(--box-radius)", background: "var(--surface-5)", boxShadow: "var(--shadow-5)" }}>
          <DialogHeader>
            <DialogTitle>Continue {humanTitle(courseChoice?.dojo ?? "course")}</DialogTitle>
            <DialogDescription>Choose the workspace first. Sessions stay attached to its files and harness transcript.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-2">
            <label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">Workspace</span>
              <MenuButton label="Course workspace" align="start" className="w-full justify-between" disabled={openingCourse}
                value={choiceWorkspaceId} onChange={workspaceId => {
                  const workspace = courseChoice?.workspaces.find(candidate => candidate.workspaceId === workspaceId);
                  setChoiceWorkspaceId(workspaceId);
                  setChoiceSessionId(workspace?.sessionId ?? "current");
                }} options={courseChoice?.workspaces.map(workspace => ({ value: workspace.workspaceId,
                  label: `${workspace.workspaceName} · ${humanTitle(workspace.kata ?? "Not started")}` })) ?? []} />
              {choiceWorkspace && <span className="truncate font-mono text-xs text-muted-foreground">{choiceWorkspace.path}</span>}
            </label>
            <label className="grid gap-2">
              <span className="text-xs font-medium text-muted-foreground">Session</span>
              <MenuButton label="Course session" align="start" className="w-full justify-between" disabled={openingCourse} value={choiceSessionId} onChange={setChoiceSessionId}
                options={[{ value: "current", label: choiceWorkspace?.sessionId ? "Start a new session" : "Start current lesson" },
                  ...(choiceWorkspace?.sessions.map(session => ({ value: session.sessionId,
                    label: `${humanTitle(session.lessonId)} · ${middleEllipsis(session.sessionId)}` })) ?? [])]} />
            </label>
          </div>
          {courseOpenError && <p role="alert" className="text-sm text-destructive">{courseOpenError}</p>}
          <DialogFooter>
            <DialogClose render={<UIXButton variant="ghost">Cancel</UIXButton>} />
            <UIXButton
              disabled={!choiceWorkspace || openingCourse}
              onClick={async () => {
                if (!choiceWorkspace || openingCourse) return;
                const controller = new AbortController();
                courseOpenRequest.current = controller;
                setOpeningCourse(true);
                setCourseOpenError(undefined);
                try {
                  await openCourse(choiceWorkspace, choiceSessionId === "current" ? null : choiceSessionId, controller.signal);
                  if (!controller.signal.aborted) setCourseChoiceOpen(false);
                } catch (cause) {
                  if (!controller.signal.aborted) setCourseOpenError(cause instanceof Error ? cause.message : String(cause));
                } finally { setOpeningCourse(false); }
              }}
            >
              {openingCourse ? "Opening…" : "Continue"}
            </UIXButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function groupCourses(courses: ActiveCourse[]): CourseGroup[] {
  const groups = new Map<string, ActiveCourse[]>();
  for (const course of courses) groups.set(course.dojo, [...(groups.get(course.dojo) ?? []), course]);
  return [...groups].map(([dojo, workspaces]) => ({ dojo, workspaces }));
}

function courseGroupLastSeen(group: CourseGroup): number {
  return Math.max(...group.workspaces.map((workspace) => workspace.lastSeenAt));
}

function preferredWorkspace(group: CourseGroup): ActiveCourse {
  return group.workspaces.find((workspace) => workspace.selected)
    ?? [...group.workspaces].sort((left, right) => right.lastSeenAt - left.lastSeenAt)[0];
}

export function LessonPage({ requestedHarness, requestedCourseId, requestedLessonId, requestedSessionId, requestedWorkspaceId }: {
  requestedHarness?: string;
  requestedCourseId?: string;
  requestedLessonId?: string;
  requestedSessionId?: string;
  requestedWorkspaceId?: string;
}) {
  const navigate = useNavigate();
  const { account, toast } = useAccountMenu({ preserveWorkspace: true });
  const [lesson, setLesson] = useState<LessonSnapshot | null>(null);
  const [conversationReady, setConversationReady] = useState(false);
  const [conversationError, setConversationError] = useState<string>();
  const [conversationAttempt, setConversationAttempt] = useState(0);
  const [courses, setCourses] = useState<ActiveCourse[]>([]);
  const [coursesReady, setCoursesReady] = useState(false);
  const [selectedWorkspaceId, setWorkspaceId] = useState("");
  const workspaceId = requestedWorkspaceId ?? selectedWorkspaceId;
  const [code, setCode] = useState("");
  const [editorHighlight, setEditorHighlight] = useState<(CodeHighlight & { nonce: number }) | undefined>();
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"code" | "tests">("code");
  const [checking, setChecking] = useState(false);
  const [liveTests, setLiveTests] = useState<TestReport["tests"]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [modelChanging, setModelChanging] = useState(false);
  const [agentChanging, setAgentChanging] = useState(false);
  const navigationRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    navigationRequest.current = controller;
    return () => controller.abort();
  }, []);
  const [modelNotice, setModelNotice] = useState("");
  const [busy, setBusy] = useState("Loading your dojo…");
  const [error, setError] = useState<string | null>(null);
  const introductions = useRef(new Set<string>());
  const [pendingCheckObservation, setPendingCheckObservation] = useState<import("@/server/lesson/service").CheckObservation | null>(null);
  const [hostChatEvents, setHostChatEvents] = useState<AnchoredChatEvent[]>([]);
  const messagesRef = useRef<UIMessage[]>([]);
  const forwardedProps = useRef<Record<string, unknown>>({});
  const sessionSocket = useRef<WebSocket | null>(null);
  const undoEditor = useRef<(() => boolean) | null>(null);
  const selectedCourse = courses.find((course) => course.workspaceId === workspaceId);
  const selectedLessonId = requestedLessonId
    ?? selectedCourse?.sessions.find((session) => session.sessionId === requestedSessionId)?.lessonId
    ?? selectedCourse?.kata;
  const dojoId = requestedCourseId ?? selectedCourse?.dojo;
  const apiBase = workspaceId && dojoId && selectedLessonId
    ? lessonApi(workspaceId, dojoId, selectedLessonId)
    : "";
  const chatConnection = useMemo(() => fetchServerSentEvents(
    apiBase ? `${apiBase}/messages` : "/api/unavailable",
    () => ({ body: forwardedProps.current }),
  ), [apiBase]);
  const {
    error: chatError,
    messages,
    sendMessage,
    stop,
    setMessages: setStreamedMessages,
    status: chatStatus,
  } = useChat({
    // A Chat owns its request lifecycle. Recreate it when the REST resource
    // changes so a submitted/error state from another lesson cannot strand
    // this lesson's observation queue. The harness session ID arrives inside
    // that resource's snapshot; using it here would recreate the Chat during
    // hydration and discard the recovered transcript we just supplied.
    connection: chatConnection,
    persistence: false,
    threadId: apiBase || "dojo-unavailable",
  });
  const dirty = lesson ? code !== lesson.code : false;
  messagesRef.current = messages;
  const timelineMessages = useMemo(() => projectChatTimeline(messages, hostChatEvents)
    .filter(message => message.parts.some(part => part.type !== "text" || !isInternalLessonMessage(part.content))), [hostChatEvents, messages]);
  const { viewportRef: chatViewportRef, scrollToBottom } = useChatScroll();
  const highlightCode = useCallback((highlight: CodeHighlight) => {
    setActiveWorkspaceTab("code");
    setEditorHighlight((current) => ({ ...highlight, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

  const setStreamedMessagesRef = useRef(setStreamedMessages);
  setStreamedMessagesRef.current = setStreamedMessages;
  const hydrate = useCallback((next: LessonSnapshot) => {
    setLesson(next);
    setCode(next.code);
    setStreamedMessagesRef.current(next.messages);
    setHostChatEvents([]);
    setBusy("");
    setError(null);
  }, []);
  const setSessionAddress = useCallback((next: LessonSnapshot) => {
    if (!next.sessionId) return;
    const sessionAddress = { lesson: { workspaceId, courseId: next.dojo, lessonId: next.kata, sessionId: next.sessionId } };
    return navigate({
      to: ".",
      state: sessionAddress,
      mask: { to: "/session/$sessionId", params: { sessionId: next.sessionId }, unmaskOnReload: true, state: sessionAddress },
      replace: true,
      resetScroll: false,
      viewTransition: false,
    });
  }, [navigate, workspaceId]);

  useEffect(() => {
    fetch("/api/control/courses")
      .then(async (response) => {
        if (!response.ok) throw new Error(`Could not load active courses (${response.status})`);
        return response.json() as Promise<ActiveCourse[]>;
      })
      .then((activeCourses) => {
        const stored = window.localStorage.getItem("dojofoo.workspace");
        const selected = activeCourses.find((course) => course.workspaceId === requestedWorkspaceId)
          ?? activeCourses.find((course) => course.sessions.some((session) => session.sessionId === requestedSessionId))
          ?? activeCourses.find((course) => course.workspaceId === stored)
          ?? activeCourses.find((course) => course.selected)
          ?? activeCourses[0];
        if (requestedSessionId && !requestedLessonId && !selected?.sessions.some((session) => session.sessionId === requestedSessionId)) {
          throw new Error("This exact lesson session is unavailable. Dojofoo will not substitute another session's transcript.");
        }
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

  useEffect(() => {
    if (!apiBase) return;
    // Updating an already accepted session's address must not reload its files.
    if (requestedSessionId && lesson?.sessionId === requestedSessionId
      && lesson.dojo === dojoId && lesson.kata === selectedLessonId) return;
    setLesson(null);
    setConversationReady(false);
    setConversationError(undefined);
    setModelNotice("");
    const controller = new AbortController();
    fetch(`${apiBase}?prepare=false`, { signal: controller.signal })
      .then(async (response) => ({
        response,
        body: (await response.json()) as LessonSnapshot | { error: string } | null,
      }))
      .then(async ({ response, body }) => {
        if (!response.ok) {
          throw new Error(body && "error" in body ? body.error : `Could not load the dojo (${response.status})`);
        }
        if (body && !("error" in body)) {
          if (requestedCourseId && body.dojo !== requestedCourseId) throw new Error("Course not found.");
          if (requestedSessionId && body.sessionId !== requestedSessionId) throw new Error("This exact lesson session is unavailable. Dojofoo will not substitute another session’s transcript.");
          if (controller.signal.aborted) return;
          hydrate(body);
          if (!requestedLessonId && body.sessionId && body.sessionId !== requestedSessionId) {
            await setSessionAddress(body);
          }
        }
      })
      .catch((cause: Error) => {
        if (controller.signal.aborted) return;
        setBusy("");
        setError(cause.message);
      });
    return () => controller.abort();
  }, [apiBase, dojoId, hydrate, requestedCourseId, requestedLessonId, requestedSessionId, selectedLessonId, setSessionAddress]);

  useEffect(() => {
    if (!apiBase || !lesson) return;
    if (conversationReady && requestedSessionId === lesson.sessionId) return;
    const controller = new AbortController();
    setConversationReady(false);
    setConversationError(undefined);
    // The existing host owns native resume and history. Apply only conversation
    // fields so a slow agent cannot overwrite edits made since files appeared.
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void (async () => {
        // A retry reads the accepted session before deciding to create one.
        const saved = requestedHarness && conversationAttempt > 0
          ? await fetch(`${apiBase}?prepare=false`, { signal: controller.signal }).then(assertResponse).then(response => response.json() as Promise<LessonSnapshot>)
          : lesson;
        if (controller.signal.aborted) return;
        const startSelected = requestedHarness && !saved.sessionId;
        const response = await fetch(startSelected ? `${apiBase}/sessions` : apiBase, {
          signal: controller.signal,
          ...(startSelected ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ harness: requestedHarness }) } : {}),
        }).then(assertResponse);
        const next = await response.json() as LessonSnapshot;
        if (controller.signal.aborted) return;
        if (requestedSessionId && next.sessionId !== requestedSessionId) throw new Error("This exact lesson session is unavailable.");
        setLesson(current => current ? { ...current, sessionId: next.sessionId, model: next.model, harness: next.harness, harnesses: next.harnesses } : current);
        setStreamedMessagesRef.current(next.messages);
        setConversationReady(true);
      })().catch(cause => { if (!controller.signal.aborted) setConversationError(cause.message); });
    });
    return () => controller.abort();
  }, [apiBase, lesson?.kata, requestedSessionId, requestedHarness, conversationAttempt]);

  useEffect(() => {
    if (chatError) setError(chatError.message);
  }, [chatError]);

  useEffect(() => {
    const sessionId = lesson?.sessionId;
    if (!workspaceId || !dojoId || !selectedLessonId || !sessionId) {
      return;
    }
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let reconnectDelay = 250;
    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = new URL(`${protocol}//${window.location.host}/api/session`);
      url.searchParams.set("session", sessionId);
      const socket = new WebSocket(url);
      sessionSocket.current = socket;
      socket.addEventListener("open", () => {
        reconnectDelay = 250;
      });
      socket.addEventListener("message", (message) => {
        const event = JSON.parse(String(message.data)) as JsonRpcRequest & { error?: { message?: string } };
        const params = event.params as { lesson?: LessonSnapshot; message?: string; test?: TestReport["tests"][number] } & Partial<LessonCheckEvent>;
        if (event.method === "session.snapshot") {
          return;
        } else if (event.method === "lesson.check.started") {
          setLiveTests([]);
          setChecking(true);
        } else if (event.method === "lesson.check.test" && params.test) {
          setLiveTests((current) => [...current, params.test!]);
        } else if (event.method === "lesson.check.completed" && params.lesson && params.observation) {
          setLesson((current) => current ? { ...current, result: params.observation!.report } : current);
          setHostChatEvents((current) => [...current, {
            afterMessageId: messagesRef.current.at(-1)?.id ?? null,
            message: {
              id: `host-check:${params.observation!.id}`,
              role: "assistant",
              parts: [{
                type: "tool-call",
                id: `check:${params.observation!.id}`,
                name: "dojo_lesson_verify",
                arguments: "{}",
                input: {},
                state: "complete",
                output: params.observation!.report,
              }],
            },
          }]);
          setPendingCheckObservation(params.observation);
          setChecking(false);
        } else if (event.error?.message) {
          setChecking(false);
          setError(event.error.message);
        }
      });
      socket.addEventListener("close", () => {
        if (sessionSocket.current === socket) sessionSocket.current = null;
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 3_000);
      });
    };
    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      sessionSocket.current?.close();
      sessionSocket.current = null;
    };
  }, [dojoId, lesson?.sessionId, selectedLessonId, workspaceId]);

  useEffect(() => {
    const observation = pendingCheckObservation;
    if (!observation || !conversationReady || chatStatus !== "ready") return;
    setPendingCheckObservation(null);
    forwardedProps.current = { kind: "check-observation", observation };
    void sendMessage(
      CHECK_OBSERVATION_MESSAGE,
    ).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => { forwardedProps.current = {}; });
  }, [chatStatus, conversationReady, pendingCheckObservation, sendMessage]);

  useEffect(() => {
    if (!apiBase || !lesson || lesson.introduced || !conversationReady || !lessonIntroductionCanStart(chatStatus, messages)) return;
    if (introductions.current.has(apiBase)) return;
    introductions.current.add(apiBase);
    setBusy("Sensei is introducing the lesson…");
    forwardedProps.current = { kind: "introduction" };
    const signal = navigationRequest.current?.signal;
    void sendMessage(INTRODUCTION_MESSAGE)
      .then(async () => {
        if (signal?.aborted) return;
        const response = await fetch(apiBase, { signal });
        if (!response.ok) throw new Error(`Could not refresh the lesson (${response.status})`);
        const updated = await response.json() as LessonSnapshot;
        if (signal?.aborted) return;
        // The AI SDK stream is the authoritative message state for this turn.
        // Refresh lesson metadata (especially the newly-created session ID)
        // without replacing the completed streamed parts with a transcript
        // reconstruction that may not yet contain the same tool grouping.
        setLesson(updated);
        setBusy("");
        setError(null);
        if (updated.sessionId && updated.sessionId !== requestedSessionId) {
          await setSessionAddress(updated);
        }
      })
      .catch((cause: unknown) => {
        introductions.current.delete(apiBase);
        setBusy("");
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => { forwardedProps.current = {}; });
  }, [apiBase, chatStatus, conversationReady, lesson, messages, requestedSessionId, sendMessage, setSessionAddress]);

  async function sendQuestion(message = question.trim()) {
    if (!message) return;
    scrollToBottom();
    setQuestion("");
    try {
      await sendMessage(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
    }
  }

  async function changeAgent(value: string) {
    if (!apiBase || !lesson || value === lesson.harness || agentChanging || modelChanging || !lesson.harnesses?.some(harness => harness === value)) return;
    const signal = navigationRequest.current?.signal;
    setAgentChanging(true);
    setModelNotice("Starting a conversation with the selected coding agent…");
    setError(null);
    try {
      const response = await fetch(`${apiBase}/sessions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ harness: value }), signal });
      if (!response.ok) throw await httpError(response);
      const next = await response.json() as LessonSnapshot;
      if (signal?.aborted) return;
      // Agent selection creates no paid turn and must not navigate away from dirty code.
      introductions.current.add(apiBase);
      // A new agent owns a new conversation. The mounted editor and unsaved code stay local.
      setLesson(next);
      setStreamedMessages(next.messages);
      setHostChatEvents([]);
      setConversationReady(true);
      setConversationError(undefined);
      await setSessionAddress(next);
      setModelNotice(`Started a conversation with ${codingAgents.find(agent => agent.value === next.harness)?.name ?? next.harness}.`);
    } catch (cause) {
      setModelNotice("Agent change failed. Your conversation stays open.");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setAgentChanging(false); }
  }

  async function changeModel(value: string) {
    if (!apiBase || !lesson?.model || value === lesson.model.currentValue) return;
    setModelChanging(true);
    setModelNotice("Changing model… Your conversation stays open.");
    setError(null);
    try {
      const response = await fetch(`${apiBase}/configuration/model`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      const body = await response.json() as LessonSnapshot["model"] | { error: string };
      if (!response.ok || !body || "error" in body) {
        throw new Error(body && "error" in body ? body.error : `Could not change model (${response.status})`);
      }
      setLesson((current) => current ? { ...current, model: body } : current);
      const selected = body.options.find((option) => option.value === body.currentValue);
      setModelNotice(`Model changed to ${selected?.name ?? body.currentValue}. Your conversation is unchanged.`);
    } catch (cause) {
      setModelNotice("Model change failed. Check the error before continuing.");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setModelChanging(false);
    }
  }

  async function answerTool(answers: Record<string, AskUserAnswer>) {
    scrollToBottom();
    setBusy("Continuing lesson…");
    if (!apiBase) return;
    const signal = navigationRequest.current?.signal;
    try {
      const response = await fetch(`${apiBase}/messages`, {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: Object.fromEntries(Object.values(answers).map((answer) => [
            answer.questionId,
            answer.otherText ? [...answer.selectedIds, answer.otherText] : answer.selectedIds,
          ])),
        }),
      });
      const body = await response.json() as LessonSnapshot | { ok: true } | { error: string };
      if (signal?.aborted) return;
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : `Could not answer the sensei (${response.status})`);
      }
      if ("kata" in body) await viewLesson(body.kata, body.dojo);
      else setBusy("");
    } catch (cause) {
      setBusy("");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

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
      const socket = sessionSocket.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) throw new Error("The lesson connection is not ready yet");
      socket.send(JSON.stringify({
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

  const chatIsWorking = chatStatus === "submitted" || chatStatus === "streaming";
  const chatCanAcceptInput = conversationReady && chatAcceptsInput(chatStatus);
  const chatWorkTiming = useChatWorkTiming(chatIsWorking, lesson?.sessionId ?? apiBase);

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
    setActiveWorkspaceTab("code");
    await navigate({
      to: "/course/$workspaceId/$courseId/lesson/$lessonId",
      params: { workspaceId, courseId: targetCourseId, lessonId: name },
    });
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

  if (!lesson) {
    return (
      <div style={{ height: "100dvh" }}><AgentChatWorkspace {...account} workspace="Dojo" sidebarWidth="18rem" brand={<a href="/" className="flex items-center" aria-label="Dojo dashboard" onClick={event => followLink(event, () => { void navigate({ to: "/" }); })}><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></a>}
        navigation={[{ id: "lessons", heading: "Lessons", items: [], before: !error && <WorkspaceSkeleton label="Loading lessons" rows={4} /> }]}
        showNews={false} showOnboarding={false} askAssistant={false}
        crumbs={[{ label: "Dashboard", icon: <UIXIcon icon={BackIcon} size={14} />, onClick: () => { void navigate({ to: "/" }); } }]}
        editor={<Editor flush>{error ? <p role="alert" className="p-5 text-sm text-destructive">{error}</p> : <WorkspaceSkeleton />}</Editor>}
        header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Sensei</b></span>}
        composer={<Composer tray={false} disabled models={[]} attachments="unavailable" dictation={false} plugins={false}
          agent={{ name: "Coding agent", icon: AiMagicIcon }} placeholder="Ask your Sensei…" />} />{toast}</div>
    );
  }

  const thinking = chatStatus === "submitted" || chatStatus === "streaming";
  const navigation: ShellSection[] = [
    { id: "lessons", heading: "Lessons", layout: "lessons", before: <div className="lj-course"><CourseCard
      course={{ title: lesson.course?.name ?? humanTitle(lesson.dojo), version: lesson.course?.version, author: lesson.course?.author,
        repo: lesson.course?.repository, language: lesson.course?.language, lessons: lesson.course?.lessons ?? lesson.lessons.length, art: courseArt(lesson.dojo) }}
      enrolled={{ version: lesson.course?.version, progress: Math.round(lesson.lessons.filter(item => item.state === "completed").length / lesson.lessons.length * 100), value: lesson.title }} />
    </div>, items: lesson.lessons.map((item, index) => ({
      id: `lesson:${item.name}`, label: item.title, marker: String(index + 1).padStart(2, "0"),
      state: item.state === "completed" ? "done" : item.isCurrent ? "active" : "locked",
      note: item.state !== "completed" && !item.isCurrent ? "Upcoming lesson; expand to preview its goal" : undefined,
      ...(item.name === lesson.kata || item.state !== "completed" && !item.isCurrent
        ? { preview: <p>{item.summary}</p> }
        : { href: `/course/${encodeURIComponent(workspaceId)}/${encodeURIComponent(lesson.dojo)}/lesson/${encodeURIComponent(item.name)}` }),
    })) },
  ];
  return <div style={{ height: "100dvh" }}><AgentChatWorkspace {...account} brand={<a href="/" className="flex items-center" aria-label="Dojo dashboard" onClick={event => followLink(event, () => { void navigate({ to: "/" }); })}><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></a>}
    workspace="Dojo" showNews={false} showOnboarding={false} sidebarWidth="18rem"
    navigation={navigation} navigationKey={`${workspaceId}:${lesson.dojo}`} active={`lesson:${lesson.kata}`} navigationTransition={false}
    onNavigate={id => { if (id.startsWith("lesson:")) void viewLesson(id.slice(7)); }}
    crumbs={[{ label: "Dashboard", icon: <UIXIcon icon={BackIcon} size={14} />, onClick: () => { void navigate({ to: "/" }); } }, { label: lesson.course?.name ?? humanTitle(lesson.dojo) }, { label: lesson.title }]}
    commands={[
      { id: "lessons", label: "Lessons", commands: lesson.lessons.filter(item => item.state === "completed" || item.isCurrent).map(item => ({ id: `lesson:${item.name}`, label: item.title })) },
      { id: "files", label: "Lesson workspace", commands: [{ id: "view:code", label: lesson.filePath }, { id: "view:tests", label: "Test results" }] },
    ]}
    askAssistant={chatCanAcceptInput} onCommand={(id, query) => {
      if (id === "view:code") setActiveWorkspaceTab("code");
      else if (id === "view:tests") setActiveWorkspaceTab("tests");
      else if (id.startsWith("lesson:")) void viewLesson(id.slice(7));
      else if (id === "ask" && chatCanAcceptInput && query?.trim()) void sendQuestion(query.trim());
    }}
    editor={<div className="h-full w-full" data-testid="lesson-workspace">
              <Editor className="h-full" flush tabs={
                <EditorTabs mode="learning" label="Lesson workspace" active={activeWorkspaceTab}
                  onSelect={(path) => { if (path === "code" || path === "tests") setActiveWorkspaceTab(path); }}
                  tabs={[
                    { path: "code", label: <span className="font-mono">{fileName(lesson.filePath)}</span>, dirty, panelId: "code-panel" },
                    { path: "tests", panelId: "tests-panel", label: <><TestStateIcon report={lesson.result} /><span>Tests</span><span className="text-xs text-muted-foreground">{testPercentage(lesson.result)}</span></> },
                  ]} />} actions={lesson.isCurrent || busy && !thinking ? <>
                {busy && !thinking && <span className="ml-auto self-center px-3 text-xs text-muted-foreground">{busy}</span>}
                {lesson.isCurrent && (
                  <div aria-label="Lesson actions" className={`${busy && !thinking ? "" : "ml-auto"} flex shrink-0 items-center gap-1 px-1`} role="toolbar">
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
    scroller={chatViewportRef}
    composer={<div data-testid="chat-composer">
      <Composer tray={false} attachments="unavailable" dictation={false} plugins={false} agent={codingAgents.find(agent => agent.value === lesson.harness) ?? { value: lesson.harness, name: lesson.harness ?? "Coding agent", icon: AiMagicIcon }}
        agents={codingAgents.filter(agent => lesson.harnesses?.some(value => value === agent.value)).map(agent => ({ ...agent, description: "Start a new conversation" }))}
        onAgentChange={value => { void changeAgent(value); }} agentChanging={agentChanging || (!conversationReady && !conversationError)} id="course-message" label="Message the sensei" value={question} onValueChange={setQuestion}
        placeholder="Ask your Sensei…" disabled={!chatCanAcceptInput || agentChanging} busy={chatIsWorking} onStop={stop}
        history={messages.filter(item => item.role === "user").map(item => item.parts.flatMap(part => part.type === "text" && !isInternalLessonMessage(part.content) ? [part.content] : []).join("")).filter(Boolean)}
        onSend={message => { void sendQuestion(message); }} model={lesson.model?.currentValue} models={lesson.model?.options.map(option => ({ value: option.value, name: option.name, description: option.group ?? "", icon: AiMagicIcon })) ?? []} modelChanging={modelChanging}
        onModelChange={value => { void changeModel(value); }} />
      {modelNotice && <p role="status" className="px-2 pt-1 text-xs text-muted-foreground">{modelNotice}</p>}
    </div>}>
    <div data-chat-error={chatError?.message} data-chat-status={chatStatus} data-host-event-count={hostChatEvents.length} data-testid="chat-pane">
      {conversationError && <div role="alert" className="space-y-3 p-3 text-sm text-destructive"><p>{conversationError}</p>
        <UIXButton variant="secondary" onClick={() => setConversationAttempt(attempt => attempt + 1)}>Reload conversation</UIXButton></div>}
      <ChatTranscript messages={timelineMessages} streaming={chatIsWorking} renderMessage={(message, streaming) => (
                  <StreamedChatMessage
                    fragments={lesson.fragments}
                    key={message.id}
                    message={message}
                    onHighlight={highlightCode}
                    onToolAnswer={answerTool}
                    streaming={streaming}
                    timing={streaming ? chatWorkTiming : undefined}
                    workspaceId={workspaceId}
                  />
                )} />
              {checking && <LiveCheckSummary tests={liveTests} />}
              {chatError && (
                <div className="border border-destructive/50 bg-destructive/10 p-3 font-prose text-sm text-destructive" role="alert">
                  {chatError.message}
                </div>
              )}
    </div>
  </AgentChatWorkspace>{toast}</div>;

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
  return <LessonBrief title={lesson.title} resources={resources}>
    <CourseContent basePath={basePath} workspaceId={workspaceId} diagrams={false}>{lesson.briefing}</CourseContent>
  </LessonBrief>;
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
