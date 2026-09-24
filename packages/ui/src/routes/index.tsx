import { ClientOnly, createFileRoute, useNavigate } from "@tanstack/react-router";
import { fetchServerSentEvents, useChat, type UIMessage } from "@tanstack/ai-react";
import type { ThinkingPart, ToolCallPart } from "@tanstack/ai-client";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BundledLanguage } from "shiki";
import { ArrowRight, ArrowUpDown, Check, CheckCircle2, Circle, CircleDot, Loader2, LockKeyhole, Plus, RotateCcw, Save as SaveIcon, Star, Undo2, XCircle } from "lucide-react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
import { CourseContent } from "@/components/course-content";
import {
  Test,
  TestResults as AiTestResults,
  TestResultsContent,
  TestResultsHeader,
  TestResultsProgress,
  TestSuite,
  TestSuiteContent,
  TestSuiteName,
  TestSuiteStats,
} from "@/components/ai-elements/test-results";
import { ToolOutput } from "@/components/ai-elements/tool";
import { TerminalBlock } from "@dojofoo/ui/elements/terminal-block";
import { ToolTimeline, type TimelineStep } from "@dojofoo/ui/elements/tool-timeline";
import { EmptyStateBoard } from "@dojofoo/ui/premium/empty-states/empty-state-board";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { Button } from "@dojofoo/ui/button";
import { BrandLogo } from "@dojofoo/ui/brand-logo";
import { ChatContainer, ChatContainerContent, ChatContainerFooter } from "@dojofoo/ui/chat-container";
import { CourseLessonLayout, CourseLessonNavigation } from "@dojofoo/ui/course-lesson-layout";
import { CourseCard } from "@dojofoo/ui/course-card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dojofoo/ui/dialog";
import { InputMessage } from "@dojofoo/ui/input-message";
import { ScrollArea } from "@dojofoo/ui/scroll-area";
import { SiteNavigation } from "@dojofoo/ui/site-navigation";
import { ThinkingIndicator } from "@dojofoo/ui/thinking-indicator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@dojofoo/ui/select";
import type { LessonSnapshot, TestReport } from "@/server/lesson/service";
import type { JsonRpcRequest } from "@/server/session/protocol";
import { applyLessonMetadata, hydrateLesson } from "@/lib/lesson-snapshot";
import { projectChatTimeline, type AnchoredChatEvent } from "@/lib/chat-timeline";
import { chatAcceptsInput, isInternalLessonMessage, lessonIntroductionCanStart } from "@/lib/chat-internal";
import { cn } from "@/lib/utils";
import { AgentQuestion, isAgentQuestion, agentQuestionState } from "@/components/chat/agent-question";
import { useChatWorkTiming, type ChatWorkTiming } from "@/lib/chat-work-timing";
import { codeHighlight, codeHighlights, type CodeHighlight } from "@/lib/code-highlight";

const CodeEditor = lazy(() => import("@/components/code-editor"));
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
  const [courses, setCourses] = useState<ActiveCourse[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [drafts, setDrafts] = useState<AuthoringDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState("all");
  const [sortBy, setSortBy] = useState("recent");
  const [courseChoice, setCourseChoice] = useState<CourseGroup | null>(null);
  const [choiceWorkspaceId, setChoiceWorkspaceId] = useState("");
  const [choiceSessionId, setChoiceSessionId] = useState("current");

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

  async function openCourse(course: ActiveCourse, sessionId?: string | null) {
    window.localStorage.setItem("dojofoo.workspace", course.workspaceId);
    if (course.mode === "interactive") {
      await navigate({ to: "/interactive" });
      return;
    }
    if (sessionId === null && course.kata) {
      const response = await fetch(`${lessonApi(course.workspaceId, course.dojo, course.kata)}/sessions`, { method: "POST" });
      await assertResponse(response);
      const started = await response.json() as LessonSnapshot;
      if (started.sessionId) {
        await navigate({ to: "/session/$sessionId", params: { sessionId: started.sessionId } });
        return;
      }
    }
    const existingSession = sessionId === undefined ? course.sessionId : sessionId;
    if (existingSession) {
      await navigate({ to: "/session/$sessionId", params: { sessionId: existingSession } });
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
    if (group.workspaces.length === 1) {
      void openCourse(group.workspaces[0]);
      return;
    }
    const workspace = preferredWorkspace(group);
    setCourseChoice(group);
    setChoiceWorkspaceId(workspace.workspaceId);
    setChoiceSessionId(workspace.sessionId ?? "current");
  }

  const choiceWorkspace = courseChoice?.workspaces.find((course) => course.workspaceId === choiceWorkspaceId) ?? null;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNavigation
        brand={<a aria-label="Dojofoo courses" className="mr-1 flex items-center" href="/"><BrandLogo /></a>}
        actions={(
          <>
            <a className="px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground" href="https://dojo.foo/docs" rel="noreferrer" target="_blank">Docs</a>
          </>
        )}
      />
      <section className="marketplace-lined-frame mx-auto max-w-(--fd-layout-width) px-4 sm:px-5">
        <div className="marketplace-lined-surface grid min-h-[calc(100vh-4rem)] md:grid-cols-[19rem_minmax(0,1fr)]">
          <aside aria-label="Local dojo filters" className="border-b border-dashed border-border bg-surface-1 py-6 md:border-b-0 md:border-r md:py-12">
            <LocalFilter label="Language" allLabel="All languages" items={languages} selected={language} onSelect={setLanguage} />
          </aside>
          <div className="min-w-0 px-5 py-12 lg:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <h1 className="text-4xl font-medium tracking-tight">Your dojos</h1>
                <p className="mt-3 max-w-2xl font-prose text-base leading-7 text-muted-foreground">
                  Continue a course or add another dojo to a local workspace.
                </p>
              </div>
              <Select onValueChange={setSortBy} size="compact" value={sortBy}>
                <SelectTrigger aria-label="Sort local dojos" className="min-w-40" icon={ArrowUpDown} />
                <SelectContent>
                  <SelectItem index={0} value="recent">Most recent</SelectItem>
                  <SelectItem index={1} value="oldest">Oldest activity</SelectItem>
                  <SelectItem index={2} value="name">Course name</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="mt-8 border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">{error}</p>}
            {drafts.length > 0 ? (
              <section className="mt-10">
                <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-orange-400">In authoring</p>
                <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
                  {drafts.map((draft) => (
                    <a className="group relative flex min-h-[10.5rem] flex-col overflow-hidden border border-orange-500/60 bg-surface-1 p-5 transition-colors hover:border-orange-400" href={`/authoring?workspace=${encodeURIComponent(draft.workspaceId)}`} key={draft.workspaceId}>
                      <span className="absolute right-0 top-0 h-0 w-0 border-l-[42px] border-t-[42px] border-l-transparent border-t-orange-500" />
                      <Star className="absolute right-1.5 top-1.5 size-3.5 fill-background text-background" />
                      <p className="font-display text-xs font-medium uppercase tracking-[0.14em] text-orange-400">{draft.mode}</p>
                      <h2 className="mt-3 font-display text-xl font-medium">{humanTitle(draft.name)}</h2>
                      <p className="mt-2 font-prose text-sm text-muted-foreground">{draft.description || "Course draft"}</p>
                      <span className="mt-auto flex items-center justify-between pt-5 text-xs text-muted-foreground">Resume authoring <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" /></span>
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
            {!coursesLoading && !error && visibleCourses.length === 0 && drafts.length === 0 ? (
              <EmptyStateBoard
                actionLabel="Browse dojos"
                className="mt-10"
                columns={["Added", "Learning", "Completed"]}
                cursorLabel="start here"
                description="Browse the marketplace, then add a dojo to the workspace where you want to learn."
                eyebrow="Dojos / empty"
                onAction={() => window.open("https://dojo.foo/#dojos", "_blank", "noopener,noreferrer")}
                title="Add your first dojo."
              />
            ) : (
            <div className="mt-10 grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {visibleCourses.map((group) => {
              const course = preferredWorkspace(group);
              return (
              <CourseCard
                description={course.description}
                eyebrow={course.language}
                footer={(
                  <>
                  <div className="min-w-0">
                    <p className="truncate text-xs text-muted-foreground">{group.workspaces.length > 1 ? `${group.workspaces.length} workspaces` : course.mode === "interactive" ? "Interactive lesson" : humanTitle(course.kata ?? "Not started")}</p>
                    <p className="mt-1 truncate font-mono text-[11px]">{group.workspaces.length > 1 ? "Choose where to continue" : course.sessionId ? middleEllipsis(course.sessionId) : "Not started"}</p>
                  </div>
                  <ArrowRight className="shrink-0 transition-transform group-hover:translate-x-1" size={18} />
                  </>
                )}
                footerClassName="items-end justify-between gap-4"
                key={group.dojo}
                label={`Open ${humanTitle(course.dojo)}`}
                onClick={() => chooseCourse(group)}
                title={humanTitle(course.dojo)}
              />
              );
          })}
              <a className="group flex min-h-[10.5rem] flex-col items-center justify-center border border-dashed border-border/80 bg-surface-1 p-5 text-center transition-colors duration-80 hover:border-primary" href="https://dojo.foo" rel="noreferrer" target="_blank">
                <Plus className="mb-3 text-muted-foreground transition-colors group-hover:text-primary" size={22} />
                <h2 className="text-[15px] font-semibold">Add a dojo</h2>
                <p className="mt-2 max-w-52 font-prose text-sm text-muted-foreground">Browse the marketplace and add another course to your local dojo.</p>
              </a>
            </div>
            )}
          </div>
        </div>
      </section>
      <Dialog open={Boolean(courseChoice)} onOpenChange={(open) => { if (!open) setCourseChoice(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Continue {humanTitle(courseChoice?.dojo ?? "course")}</DialogTitle>
            <DialogDescription>Choose the workspace first. Sessions stay attached to its files and harness transcript.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 py-2">
            <label className="grid gap-2">
              <span className="font-display text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Workspace</span>
              <Select
                onValueChange={(workspaceId) => {
                  const workspace = courseChoice?.workspaces.find((candidate) => candidate.workspaceId === workspaceId);
                  setChoiceWorkspaceId(workspaceId);
                  setChoiceSessionId(workspace?.sessionId ?? "current");
                }}
                value={choiceWorkspaceId}
              >
                <SelectTrigger
                  aria-label="Course workspace"
                  displayValue={choiceWorkspace
                    ? `${choiceWorkspace.workspaceName} · ${humanTitle(choiceWorkspace.kata ?? "Not started")}`
                    : "Choose workspace"}
                />
                <SelectContent>
                  {courseChoice?.workspaces.map((workspace, index) => (
                    <SelectItem index={index} key={workspace.workspaceId} value={workspace.workspaceId}>
                      {workspace.workspaceName} · {humanTitle(workspace.kata ?? "Not started")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {choiceWorkspace && <span className="truncate font-mono text-xs text-muted-foreground">{choiceWorkspace.path}</span>}
            </label>
            <label className="grid gap-2">
              <span className="font-display text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Session</span>
              <Select onValueChange={setChoiceSessionId} value={choiceSessionId}>
                <SelectTrigger
                  aria-label="Course session"
                  displayValue={choiceSessionId === "current"
                    ? choiceWorkspace?.sessionId ? "Start a new session" : "Start current lesson"
                    : humanTitle(choiceWorkspace?.sessions.find((session) => session.sessionId === choiceSessionId)?.lessonId ?? "Session") + ` · ${middleEllipsis(choiceSessionId)}`}
                />
                <SelectContent>
                  <SelectItem index={0} value="current">{choiceWorkspace?.sessionId ? "Start a new session" : "Start current lesson"}</SelectItem>
                  {choiceWorkspace?.sessions.map((session, index) => (
                    <SelectItem index={index + 1} key={session.sessionId} value={session.sessionId}>
                      {humanTitle(session.lessonId)} · {middleEllipsis(session.sessionId)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancel</Button>} />
            <Button
              disabled={!choiceWorkspace}
              onClick={() => {
                if (!choiceWorkspace) return;
                setCourseChoice(null);
                void openCourse(choiceWorkspace, choiceSessionId === "current" ? null : choiceSessionId);
              }}
            >
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
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

function LocalFilter({ label, allLabel, items, selected, onSelect, className = "" }: {
  label: string;
  allLabel: string;
  items: string[];
  selected: string;
  onSelect: (value: string) => void;
  className?: string;
}) {
  const options = [{ label: allLabel, value: "all" }, ...items.map((item) => ({ label: item, value: item }))];
  return (
    <section aria-label={label} className={className}>
      <h2 className="px-4 pb-4 font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</h2>
      <nav>
        {options.map((option, index) => {
          const active = selected === option.value;
          return (
            <button
              aria-pressed={active}
              className={`marketplace-category flex w-full cursor-pointer items-center gap-2.5 border-dashed border-border px-4 py-4 text-left text-[13px] outline-none transition-colors ${index === options.length - 1 ? "" : "border-b"} ${active ? "font-medium text-foreground" : "text-muted-foreground"}`}
              key={option.value}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {active && <ArrowRight aria-label="Selected filter" className="size-4 shrink-0" role="img" strokeWidth={1.75} />}
            </button>
          );
        })}
      </nav>
    </section>
  );
}

export function LessonPage({ requestedCourseId, requestedLessonId, requestedSessionId, requestedWorkspaceId }: {
  requestedCourseId?: string;
  requestedLessonId?: string;
  requestedSessionId?: string;
  requestedWorkspaceId?: string;
}) {
  const navigate = useNavigate();
  const [lesson, setLesson] = useState<LessonSnapshot | null>(null);
  const [courses, setCourses] = useState<ActiveCourse[]>([]);
  const [coursesReady, setCoursesReady] = useState(false);
  const [workspaceId, setWorkspaceId] = useState("");
  const [code, setCode] = useState("");
  const [editorHighlight, setEditorHighlight] = useState<(CodeHighlight & { nonce: number }) | undefined>();
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"code" | "tests">("code");
  const [checking, setChecking] = useState(false);
  const [liveTests, setLiveTests] = useState<TestReport["tests"]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [modelChanging, setModelChanging] = useState(false);
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
  const apiBase = workspaceId && selectedCourse && selectedLessonId
    ? lessonApi(workspaceId, selectedCourse.dojo, selectedLessonId)
    : "";
  const chatConnection = useMemo(() => fetchServerSentEvents(
    apiBase ? `${apiBase}/messages` : "/api/unavailable",
    () => ({ body: forwardedProps.current }),
  ), [apiBase]);
  const {
    error: chatError,
    messages,
    sendMessage,
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
  const timelineMessages = useMemo(() => projectChatTimeline(messages, hostChatEvents), [hostChatEvents, messages]);
  const highlightCode = useCallback((highlight: CodeHighlight) => {
    setActiveWorkspaceTab("code");
    setEditorHighlight((current) => ({ ...highlight, nonce: (current?.nonce ?? 0) + 1 }));
  }, []);

  const metadataTarget = useMemo(() => ({ setCode, setLesson }), []);
  const setStreamedMessagesRef = useRef(setStreamedMessages);
  setStreamedMessagesRef.current = setStreamedMessages;
  const hydrate = useCallback((next: LessonSnapshot) => {
    hydrateLesson(next, { ...metadataTarget, setMessages: (value) => setStreamedMessagesRef.current(value) });
    setHostChatEvents([]);
    setBusy("");
    setError(null);
  }, [metadataTarget]);
  const updateMetadata = useCallback((next: LessonSnapshot) => {
    applyLessonMetadata(next, metadataTarget);
    setBusy("");
    setError(null);
  }, [metadataTarget]);

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
        if (requestedSessionId && !selected?.sessions.some((session) => session.sessionId === requestedSessionId)) {
          throw new Error("This exact lesson session is unavailable. Dojofoo will not substitute another session's transcript.");
        }
        setCourses(activeCourses);
        setWorkspaceId(selected?.workspaceId ?? "");
        setCoursesReady(true);
      })
      .catch((cause: Error) => {
        setCoursesReady(true);
        setError(cause.message);
      });
  }, [requestedSessionId, requestedWorkspaceId]);

  useEffect(() => {
    if (!coursesReady) return;
    setLesson(null);
    const course = courses.find((candidate) => candidate.workspaceId === workspaceId);
    const lessonId = requestedLessonId ?? course?.kata;
    if (!course || (requestedCourseId && course.dojo !== requestedCourseId)) {
      setBusy("");
      setError("Course not found.");
      return;
    }
    if (!lessonId) {
      setBusy("");
      setError("This course has no lesson to continue.");
      return;
    }
    fetch(lessonApi(workspaceId, course.dojo, lessonId))
      .then(async (response) => ({
        response,
        body: (await response.json()) as LessonSnapshot | { error: string } | null,
      }))
      .then(async ({ response, body }) => {
        if (!response.ok) {
          throw new Error(body && "error" in body ? body.error : `Could not load the dojo (${response.status})`);
        }
        if (body && !("error" in body)) {
          hydrate(body);
          if (!requestedLessonId && body.sessionId && body.sessionId !== requestedSessionId) {
            await navigate({
              to: "/session/$sessionId",
              params: { sessionId: body.sessionId },
              replace: true,
            });
          }
        }
      })
      .catch((cause: Error) => {
        setBusy("");
        setError(cause.message);
      });
  }, [courses, coursesReady, hydrate, navigate, requestedCourseId, requestedLessonId, requestedSessionId, workspaceId]);

  useEffect(() => {
    if (chatError) setError(chatError.message);
  }, [chatError]);

  useEffect(() => {
    const sessionId = lesson?.sessionId;
    if (!workspaceId || !selectedCourse || !selectedLessonId || !sessionId) {
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
  }, [hydrate, lesson?.sessionId, navigate, selectedCourse, selectedLessonId, workspaceId]);

  useEffect(() => {
    const observation = pendingCheckObservation;
    if (!observation || chatStatus !== "ready") return;
    setPendingCheckObservation(null);
    forwardedProps.current = { kind: "check-observation", observation };
    void sendMessage(
      CHECK_OBSERVATION_MESSAGE,
    ).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => { forwardedProps.current = {}; });
  }, [chatStatus, pendingCheckObservation, sendMessage]);

  useEffect(() => {
    if (!apiBase || !lesson || !lessonIntroductionCanStart(chatStatus, messages)) return;
    if (introductions.current.has(apiBase)) return;
    introductions.current.add(apiBase);
    setBusy("Sensei is introducing the lesson…");
    forwardedProps.current = { kind: "introduction" };
    void sendMessage(INTRODUCTION_MESSAGE)
      .then(async () => {
        const response = await fetch(apiBase);
        if (!response.ok) throw new Error(`Could not refresh the lesson (${response.status})`);
        const updated = await response.json() as LessonSnapshot;
        // The AI SDK stream is the authoritative message state for this turn.
        // Refresh lesson metadata (especially the newly-created session ID)
        // without replacing the completed streamed parts with a transcript
        // reconstruction that may not yet contain the same tool grouping.
        updateMetadata(updated);
        if (updated.sessionId) {
          await navigate({
            to: "/session/$sessionId",
            params: { sessionId: updated.sessionId },
            replace: true,
          });
        }
      })
      .catch((cause: unknown) => {
        introductions.current.delete(apiBase);
        setBusy("");
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => { forwardedProps.current = {}; });
  }, [apiBase, chatStatus, lesson, messages, navigate, sendMessage, updateMetadata]);

  async function sendQuestion(message = question.trim()) {
    if (!message) return;
    setQuestion("");
    try {
      await sendMessage(message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
    }
  }

  async function changeModel(value: string) {
    if (!apiBase || !lesson?.model || value === lesson.model.currentValue) return;
    setModelChanging(true);
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setModelChanging(false);
    }
  }

  async function answerTool(answers: Record<string, AskUserAnswer>) {
    setBusy("Continuing lesson…");
    if (!apiBase) return;
    try {
      const response = await fetch(`${apiBase}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: Object.fromEntries(Object.values(answers).map((answer) => [
            answer.questionId,
            answer.otherText ? [...answer.selectedIds, answer.otherText] : answer.selectedIds,
          ])),
        }),
      });
      const body = await response.json() as LessonSnapshot | { ok: true } | { error: string };
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

  async function continueLesson() {
    if (!apiBase) return;
    setBusy("Preparing the next lesson…");
    try {
      const response = await fetch(`${apiBase}/progressions`, { method: "POST" });
      const body = await response.json() as LessonSnapshot | { error: string };
      if (!response.ok || "error" in body) {
        throw new Error("error" in body ? body.error : `Could not continue the course (${response.status})`);
      }
      await viewLesson(body.kata, body.dojo);
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
        params: { courseId: selectedCourse?.dojo, lessonId: selectedLessonId },
      } satisfies JsonRpcRequest));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
      setChecking(false);
    }
  }

  const chatIsWorking = chatStatus === "submitted" || chatStatus === "streaming";
  const chatCanAcceptInput = chatAcceptsInput(chatStatus);
  const chatWorkTiming = useChatWorkTiming(chatIsWorking, lesson?.sessionId ?? apiBase);
  const latestMessageHasStreamingOutput = chatIsWorking
    && messages.at(-1)?.role === "assistant"
    && messages.at(-1)!.parts.length > 0;

  async function reset() {
    try {
      if (!apiBase || !lesson) throw new Error("No lesson is available");
      await fetch(`${apiBase}/files/${encodeURIComponent(lesson.fileId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: lesson.starterCode }),
      }).then(assertResponse);
      updateMetadata({ ...lesson, code: lesson.starterCode, result: null });
      setActiveWorkspaceTab("code");
      setResetDialogOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
    }
  }

  async function viewLesson(name: string, courseId?: string) {
    const course = courses.find((candidate) => candidate.workspaceId === workspaceId);
    if (!course) return setError("Course not found");
    setActiveWorkspaceTab("code");
    await navigate({
      to: "/course/$workspaceId/$courseId/lesson/$lessonId",
      params: { workspaceId, courseId: courseId ?? course.dojo, lessonId: name },
    });
  }

  const save = useCallback(async () => {
    if (!lesson?.isCurrent || code === lesson.code) return;
    try {
      if (!apiBase) throw new Error("No lesson is available");
      await fetch(`${apiBase}/files/${encodeURIComponent(lesson.fileId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: code }),
      }).then(assertResponse);
      updateMetadata({ ...lesson, code });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
    }
  }, [apiBase, code, lesson, updateMetadata]);

  useEffect(() => {
    const onSave = (event: KeyboardEvent) => {
      if (!lesson?.isCurrent || event.key.toLowerCase() !== "s" || (!event.metaKey && !event.ctrlKey)) return;
      event.preventDefault();
      void save();
    };
    window.addEventListener("keydown", onSave);
    return () => window.removeEventListener("keydown", onSave);
  }, [lesson?.isCurrent, save]);

  if (!lesson) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">Dojo</h1>
        <p className="mt-4 font-prose text-muted-foreground">{error ?? busy}</p>
      </main>
    );
  }

  const completed = lesson.result?.complete === true || lesson.state === "completed";
  const thinking = chatStatus === "submitted" || chatStatus === "streaming";
  const nextLesson = lesson.lessons[lesson.lessons.findIndex((item) => item.name === lesson.kata) + 1];
  const nextLessonPending = busy === "Preparing the next lesson…";
  return (
    <CourseLessonLayout
      navigation={<LessonNavigation lesson={lesson} workspaceId={workspaceId} />}
      lesson={(
        <ScrollArea className="min-h-0 bg-surface-1" data-testid="lesson-pane">
          <div className="flex flex-col pb-12">
            <div className="order-2 px-8 pt-8">
              <p className={`font-display text-xs font-medium uppercase tracking-[0.14em] ${lesson.isCurrent ? "text-muted-foreground" : "text-emerald-400"}`}>
                {lesson.isCurrent ? "Current lesson" : "Completed lesson"}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">{lesson.title}</h2>
              <LessonBriefing markdown={lesson.briefing} />
            </div>

            <section className="order-1 w-full border-b border-[#242424] bg-[#0a0a0a] text-[#ededed] shadow-surface-3" data-testid="lesson-workspace">
              <div className="flex h-10 items-stretch border-b border-[#242424] bg-black" data-testid="workspace-bar">
                <div className="flex items-stretch" role="tablist" aria-label="Lesson workspace">
                  <button
                  aria-controls="code-panel"
                  aria-selected={activeWorkspaceTab === "code"}
                  className={`border-r border-t-2 border-[#242424] px-4 font-mono text-xs ${activeWorkspaceTab === "code" ? "border-t-[#ededed] bg-[#0a0a0a] text-[#a1a1a1]" : "border-t-transparent bg-black text-[#a1a1a1] hover:bg-[#ffffff1a] hover:text-[#ededed]"}`}
                  onClick={() => setActiveWorkspaceTab("code")}
                  role="tab"
                  type="button"
                >
                  <span className="flex items-center gap-2">
                    {fileName(lesson.filePath)}
                    <Circle
                      aria-label={dirty ? "Unsaved changes" : "Saved"}
                      className={`size-2 ${dirty ? "fill-[#14cbb7] text-[#14cbb7]" : "fill-[#878787] text-[#878787]"}`}
                      role="img"
                    />
                  </span>
                  </button>
                  <button
                  aria-controls="tests-panel"
                  aria-selected={activeWorkspaceTab === "tests"}
                  className={`flex items-center gap-2 border-r border-t-2 border-[#242424] px-4 text-xs ${activeWorkspaceTab === "tests" ? "border-t-[#ededed] bg-[#0a0a0a] text-[#a1a1a1]" : "border-t-transparent bg-black text-[#a1a1a1] hover:bg-[#ffffff1a] hover:text-[#ededed]"}`}
                  onClick={() => setActiveWorkspaceTab("tests")}
                  role="tab"
                  type="button"
                >
                  <TestStateIcon report={lesson.result} />
                  <span>Tests</span>
                  <span className="text-[10px] text-[#878787]">{testPercentage(lesson.result)}</span>
                  </button>
                </div>
                {busy && !thinking && <span className="ml-auto self-center px-3 text-xs text-[#878787]">{busy}</span>}
                {lesson.isCurrent && (
                  <div aria-label="Lesson actions" className={`${busy && !thinking ? "" : "ml-auto"} flex items-stretch border-l border-[#242424]`} role="toolbar">
                    <button
                      className="flex items-center gap-2 border-r border-[#242424] px-3 text-xs text-[#a1a1a1] hover:bg-[#ffffff1a] hover:text-[#ededed] disabled:cursor-default disabled:text-[#878787]"
                      disabled={Boolean(busy)}
                      onClick={() => setResetDialogOpen(true)}
                      type="button"
                    >
                      <RotateCcw className="size-3.5" />
                      Reset
                    </button>
                    <button
                      aria-keyshortcuts="Control+Z Meta+Z"
                      className="flex items-center gap-2 border-r border-[#242424] px-3 text-xs text-[#a1a1a1] hover:bg-[#ffffff1a] hover:text-[#ededed] disabled:cursor-default disabled:text-[#878787]"
                      disabled={Boolean(busy)}
                      onClick={() => undoEditor.current?.()}
                      type="button"
                    >
                      <Undo2 className="size-3.5" />
                      Undo
                    </button>
                    <button
                      aria-keyshortcuts="Control+S Meta+S"
                      className="flex items-center gap-2 border-r border-[#242424] px-3 text-xs text-[#a1a1a1] hover:bg-[#ffffff1a] hover:text-[#ededed] disabled:cursor-default disabled:text-[#878787]"
                      disabled={!dirty || Boolean(busy)}
                      onClick={() => void save()}
                      type="button"
                    >
                      <SaveIcon className="size-3.5" />
                      Save
                    </button>
                    <button
                      className="bg-[#0070f3] px-4 text-xs text-white hover:bg-[#0761d1] disabled:cursor-default disabled:bg-[#242424] disabled:text-[#878787]"
                      disabled={Boolean(busy)}
                      onClick={() => void check()}
                      type="button"
                    >
                      Check
                    </button>
                  </div>
                )}
              </div>
              <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Reset this lesson?</DialogTitle>
                    <DialogDescription className="font-prose">
                      Restore the original scaffold. Your current solution will be discarded.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose render={<Button variant="secondary">Cancel</Button>} />
                    <Button disabled={Boolean(busy)} onClick={() => void reset()}>
                      Reset lesson
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Dialog open={nextLessonPending} onOpenChange={() => undefined}>
                <DialogContent>
                  <div className="flex items-start gap-4 py-2">
                    <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-blue-500 motion-reduce:animate-none" />
                    <DialogHeader>
                      <DialogTitle>Opening {nextLesson?.title ?? "the next lesson"}</DialogTitle>
                      <DialogDescription className="font-prose">
                        Preparing its scaffold and lesson context…
                      </DialogDescription>
                    </DialogHeader>
                  </div>
                </DialogContent>
              </Dialog>
              <div className="aspect-video min-h-0 overflow-hidden" data-testid="lesson-canvas">
                <div className="h-full" hidden={activeWorkspaceTab !== "code"} id="code-panel" role="tabpanel">
                  <ClientOnly fallback={<div className="h-full animate-pulse bg-[#0a0a0a]" />}>
                    <Suspense fallback={<div className="h-full animate-pulse bg-[#0a0a0a]" />}>
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
                        onUndoReady={(undo) => { undoEditor.current = undo; }}
                        readOnly={!lesson.isCurrent}
                        lessonApiBase={apiBase}
                      />
                    </Suspense>
                  </ClientOnly>
                </div>
                <div className="h-full overflow-auto" hidden={activeWorkspaceTab !== "tests"} id="tests-panel" role="tabpanel">
                  {checking
                    ? <RunningTestResults tests={liveTests} />
                    : lesson.result
                    ? <LessonTestResults report={lesson.result} title={lesson.title} />
                    : <div className="flex h-full items-center justify-center text-sm text-[#878787]">Run the lesson checks to see test coverage.</div>}
                </div>
              </div>
            </section>
            <div className="order-3 mx-8 mt-3 flex items-center gap-3">
              {completed && lesson.isCurrent && (
                <Button
                  disabled={Boolean(busy)}
                  onClick={() => void continueLesson()}
                  type="button"
                  variant="tertiary"
                >
                  Continue to next lesson
                </Button>
              )}
            </div>
            {error && <p className="order-3 mx-8 mt-4 border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
          </div>
        </ScrollArea>
      )}
      chat={(
        <ChatContainer
          data-chat-error={chatError?.message}
          data-chat-status={chatStatus}
          data-host-event-count={hostChatEvents.length}
          data-testid="chat-pane"
        >
          <ChatContainerContent>
              {timelineMessages
                .filter((message) => message.parts.some((part) => part.type !== "text"
                  || !isInternalLessonMessage(part.content)))
                .map((message) => (
                  <StreamedChatMessage
                    fragments={lesson.fragments}
                    key={message.id}
                    message={message}
                    onHighlight={highlightCode}
                    onToolAnswer={answerTool}
                    streaming={chatIsWorking && message.id === messages.at(-1)?.id}
                    timing={message.id === messages.at(-1)?.id ? chatWorkTiming : undefined}
                    workspaceId={workspaceId}
                  />
                ))}
              {chatIsWorking && !latestMessageHasStreamingOutput && (
                <ThinkingIndicator className="px-0" key="pending-agent-work" />
              )}
              {checking && <LiveCheckSummary tests={liveTests} />}
              {chatError && (
                <div className="border border-destructive/50 bg-destructive/10 p-3 font-prose text-sm text-destructive" role="alert">
                  {chatError.message}
                </div>
              )}
          </ChatContainerContent>
          <ChatContainerFooter data-testid="chat-composer">
              <label className="sr-only" htmlFor="sensei-composer">Message the sensei</label>
              <InputMessage
                disabled={!chatCanAcceptInput}
                history={messages
                  .filter((item) => item.role === "user")
                  .map((item) => item.parts.flatMap((part) =>
                    part.type === "text" && !isInternalLessonMessage(part.content) ? [part.content] : []
                  ).join(""))
                  .filter(Boolean)}
                onSend={(message) => void sendQuestion(message)}
                onValueChange={setQuestion}
                leftSlot={lesson.model && (
                  <Select
                    disabled={modelChanging || !chatCanAcceptInput}
                    onValueChange={(value) => void changeModel(value)}
                    size="compact"
                    value={lesson.model.currentValue}
                  >
                    <SelectTrigger
                      aria-label="Harness model"
                      className="max-w-56 px-2 font-mono text-[11px]"
                      data-testid="harness-model-selector"
                      variant="borderless"
                    />
                    <SelectContent>
                      {lesson.model.options.map((option, index) => (
                        <SelectItem index={index} key={option.value} value={option.value}>
                          {option.group ? `${option.group} · ${option.name}` : option.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                placeholder="Ask about the lesson…"
                sendLabel="Send"
                status={chatStatus === "submitted" || chatStatus === "streaming" ? "streaming" : "idle"}
                textareaProps={{ id: "sensei-composer", "aria-label": "Message the sensei" }}
                value={question}
              />
          </ChatContainerFooter>
        </ChatContainer>
      )}
    />
  );
}

function LessonNavigation({
  lesson,
  workspaceId,
}: {
  lesson: LessonSnapshot;
  workspaceId: string;
}) {
  const [expandedLesson, setExpandedLesson] = useState(lesson.kata);

  useEffect(() => {
    setExpandedLesson(lesson.kata);
  }, [lesson.kata]);

  return (
    <CourseLessonNavigation courseTitle={humanTitle(lesson.dojo)}>
          {lesson.lessons.map((item, index) => {
            return (
              <LessonNavigationItem
                currentKata={lesson.kata}
                expanded={expandedLesson === item.name}
                item={item}
                key={item.name}
                last={index === lesson.lessons.length - 1}
                lessonHref={`/course/${encodeURIComponent(workspaceId)}/${encodeURIComponent(lesson.dojo)}/lesson/${encodeURIComponent(item.name)}`}
                onExpandedChange={setExpandedLesson}
              />
            );
          })}
    </CourseLessonNavigation>
  );
}

function middleEllipsis(value: string, visibleCharacters = 22): string {
  if (value.length <= visibleCharacters) return value;
  const startLength = Math.ceil(visibleCharacters / 2);
  const endLength = Math.floor(visibleCharacters / 2);
  return `${value.slice(0, startLength)}…${value.slice(-endLength)}`;
}

const LessonNavigationItem = memo(function LessonNavigationItem({
  currentKata,
  expanded,
  item,
  last,
  lessonHref,
  onExpandedChange,
}: {
  currentKata: string;
  expanded: boolean;
  item: LessonSnapshot["lessons"][number];
  last: boolean;
  lessonHref: string;
  onExpandedChange: (name: string) => void;
}) {
  const accessible = item.state === "completed" || item.isCurrent;
  return (
    <AccordionPrimitive.Root
      collapsible
      onValueChange={onExpandedChange}
      type="single"
      value={expanded ? item.name : ""}
    >
      <AccordionPrimitive.Item
        className={`w-full rounded-none border-dashed ${last ? "border-b-0" : "border-b"}`}
        data-lesson-state={item.isCurrent ? "current" : item.state === "completed" ? "completed" : "upcoming"}
        value={item.name}
      >
        <AccordionPrimitive.Header>
          {accessible && item.name !== currentKata ? (
            <a
              className="flex w-full items-center gap-2.5 px-4 py-4 text-left text-[14px] font-medium text-muted-foreground outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--focus-ring,#6B97FF)]"
              href={lessonHref}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate">{item.title}</span>
              </span>
              <LessonStateIcon completed={item.state === "completed"} current={item.isCurrent} />
            </a>
          ) : (
            <AccordionPrimitive.Trigger
              aria-description={!accessible ? "Upcoming lesson; expand to preview its goal" : undefined}
              className={`flex w-full items-center gap-2.5 px-4 py-4 text-left text-[14px] font-medium outline-none transition-colors hover:bg-hover focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--focus-ring,#6B97FF)] ${!accessible ? "cursor-default text-muted-foreground/40" : "text-muted-foreground data-[state=open]:text-foreground"}`}
              data-navigation-disabled={!accessible || undefined}
            >
              <>
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate">{item.title}</span>
                </span>
                <LessonStateIcon completed={item.state === "completed"} current={item.isCurrent} />
              </>
            </AccordionPrimitive.Trigger>
          )}
        </AccordionPrimitive.Header>
        <LessonAccordionContent>
          <div>
            <p className="font-prose leading-5">{item.summary}</p>
            {accessible && item.name !== currentKata && (
              <a className="mt-2 inline-block text-xs font-medium text-foreground underline underline-offset-4" href={lessonHref}>
                Open lesson
              </a>
            )}
          </div>
        </LessonAccordionContent>
      </AccordionPrimitive.Item>
    </AccordionPrimitive.Root>
  );
});

function LessonAccordionContent({ children }: { children: React.ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    const inner = innerRef.current;
    if (!content || !inner) return;
    const measure = () => {
      content.style.setProperty("--lesson-accordion-height", `${inner.offsetHeight}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  return (
    <AccordionPrimitive.Content
      className="lesson-accordion-content overflow-hidden text-[13px] text-muted-foreground"
      forceMount
      ref={contentRef}
    >
      <div className="p-4" ref={innerRef}>{children}</div>
    </AccordionPrimitive.Content>
  );
}

export function StreamedChatMessage({
  fragments,
  message,
  onToolAnswer,
  onHighlight,
  streaming = false,
  timing,
  workspaceId,
}: {
  fragments: Record<string, string>;
  message: UIMessage;
  onToolAnswer?: (answers: Record<string, AskUserAnswer>) => void | Promise<void>;
  onHighlight?: (highlight: CodeHighlight) => void;
  streaming?: boolean;
  timing?: ChatWorkTiming;
  workspaceId: string;
}) {
  const assistant = message.role === "assistant";
  return (
    <div
      className={cn(
        "dojo-chat-message flex min-w-0 max-w-full font-prose",
        assistant ? "w-full flex-col items-start" : "justify-end self-end",
      )}
      data-testid={assistant ? "sensei-streaming-message" : "senpai-streaming-message"}
    >
      <div className={cn(
        "min-w-0 max-w-full space-y-2 overflow-hidden",
        assistant ? "w-full" : "bg-muted px-3 py-2 text-sm",
      )}>
        {groupMessageParts(message.parts).map((group, index) => {
          if (group.kind === "activity") {
            return <ActivityTimeline activities={group.parts} key={`activity-${index}`} streaming={streaming} timing={timing} />;
          }
          const part = group.part;
          if (part.type === "thinking") {
            return null;
          }
          if (part.type === "text") {
            if (isInternalLessonMessage(part.content)) return null;
            return <MessageContent autoHighlight={streaming} fragments={fragments} key={`${part.type}-${index}`} onHighlight={onHighlight} text={part.content} workspaceId={workspaceId} />;
          }
          if (part.type === "ui-resource" && /^(?:dojo|dojofoo):\/\/lessons\//u.test(part.resource.uri)) {
            return <MessageContent fragments={fragments} key={`${part.type}-${index}`} kind="lesson-fragment" text={part.resource.text ?? ""} workspaceId={workspaceId} />;
          }
          if (part.type === "tool-call") {
            if (part.name.includes("dojo_ui_show") && part.state === "complete") {
              const fragmentId = lessonFragmentId(part.input);
              return fragmentId
                ? <MessageContent fragments={fragments} key={`${part.type}-${part.id}`} kind="lesson-fragment" text={fragmentId} workspaceId={workspaceId} />
                : null;
            }
            if (part.name === "dojo_lesson_verify") {
              const report = isTestReport(part.output) ? part.output : null;
              const failed = part.state === "error" && !report;
              if (report) return <ChatTestTerminal key={`${part.type}-${index}`} report={report} />;
              if (isActiveThinkingActivity(part)) return <ChatTestTerminal key={`${part.type}-${index}`} />;
              if (failed) {
                return (
                  <div className="w-full" key={`${part.type}-${index}`}>
                    <ToolOutput errorText="Lesson checks failed" output={part.output} />
                  </div>
                );
              }
              return null;
            }
            if (isAgentQuestion(part)) {
              return onToolAnswer ? (
                <AgentQuestion
                  className="w-full max-w-none"
                  key={`${part.type}-${part.id}`}
                  onAnswer={onToolAnswer}
                  {...agentQuestionState(part)}
                />
              ) : null;
            }
            if (part.name.includes("dojo_lesson_complete") && !toolFailed(part)) return null;
            return null;
          }
          return null;
        })}
      </div>
    </div>
  );
}

type MessagePart = UIMessage["parts"][number];
type ActivityPart = ThinkingPart | ToolCallPart;
type MessagePartGroup = { kind: "activity"; parts: ActivityPart[] } | { kind: "part"; part: MessagePart };

function groupMessageParts(parts: UIMessage["parts"]): MessagePartGroup[] {
  const groups: MessagePartGroup[] = [];
  for (const part of parts) {
    if (part.type === "tool-result") continue;
    if (isTimelineActivity(part)) {
      const previous = groups.at(-1);
      if (previous?.kind === "activity") previous.parts.push(part);
      else groups.push({ kind: "activity", parts: [part] });
    } else groups.push({ kind: "part", part });
  }
  return groups;
}

function isTimelineActivity(part: MessagePart): part is ActivityPart {
  if (part.type === "thinking") return true;
  if (part.type !== "tool-call") return false;
  if (part.name === "dojo_lesson_verify" || isAgentQuestion(part)) return false;
  if (part.name.includes("dojo_ui_show") || (part.name.includes("dojo_lesson_complete") && !toolFailed(part))) return false;
  return true;
}

function lessonFragmentId(input: unknown): string | undefined {
  if (!input || typeof input !== "object" || !("fragmentId" in input)) return undefined;
  return typeof input.fragmentId === "string" ? input.fragmentId : undefined;
}

function isActiveThinkingActivity(activity: ToolCallPart): boolean {
  return activity.type === "tool-call"
    && (activity.state === "awaiting-input" || activity.state === "input-streaming" || activity.state === "input-complete");
}

function ActivityTimeline({ activities, streaming, timing }: { activities: ActivityPart[]; streaming: boolean; timing?: ChatWorkTiming }) {
  const [open, setOpen] = useState(false);
  const steps = activities.map<TimelineStep>((activity) => {
    if (activity.type === "thinking") return { verb: "Thinking", status: streaming ? "running" : "success" };
    const running = isActiveThinkingActivity(activity);
    return {
      verb: running ? toolActivityLabel(activity.name) : toolFailed(activity) ? `${toolResultLabel(activity.name)} failed` : toolResultLabel(activity.name),
      chip: activityCommand(activity) ?? toolTarget(activity),
      status: running ? "running" : toolFailed(activity) ? "error" : "success",
    };
  });
  const elapsedMs = activityDuration(activities, timing);
  const elapsed = elapsedMs === undefined ? undefined : formatElapsed(elapsedMs);
  const suffix = elapsed ? ` · ${elapsed}` : "";
  return (
    <ToolTimeline
      activeLabel={`Working${suffix}`}
      className="max-w-none"
      onOpenChange={setOpen}
      open={open}
      restingLabel={`Worked${suffix}`}
      stats={[]}
      steps={steps}
      streaming={streaming}
      visibleSteps={steps.length}
    />
  );
}

function activityDuration(activities: ActivityPart[], timing?: ChatWorkTiming): number | undefined {
  if (timing?.startedAt !== undefined) return (timing.completedAt ?? Date.now()) - timing.startedAt;
  const values = activities.flatMap((activity) => {
    const duration = (activity as ActivityPart & { durationMs?: number }).durationMs;
    return duration === undefined ? [] : [duration];
  });
  return values.length ? Math.max(...values) : undefined;
}

function toolTarget(part: ToolCallPart): string | undefined {
  if (!part.input || typeof part.input !== "object") return undefined;
  const input = part.input as Record<string, unknown>;
  for (const key of ["path", "file", "name", "query"]) {
    if (typeof input[key] === "string") return input[key];
  }
  return undefined;
}

function serializeToolValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
}

function toolFailed(part: ToolCallPart): boolean {
  if (part.state === "error") return true;
  return /(?:"status"\s*:\s*"failed"|request timed out|mcp error)/iu.test(serializeToolValue(part.output));
}

function toolActivityLabel(name: string): string {
  if (name.includes("dojo_lesson_complete")) return "Asking how to continue";
  return `Running ${name.replaceAll("_", " ")}`;
}

function toolResultLabel(name: string): string {
  if (name.includes("dojo_lesson_complete")) return "Completion prompt";
  return name.replaceAll("_", " ");
}

function formatElapsed(durationMs: number): string {
  return durationMs < 1_000 ? "<1s" : `${Math.round(durationMs / 1_000)}s`;
}

function activityCommand(activity: ToolCallPart): string | undefined {
  if (!activity.input || typeof activity.input !== "object") return undefined;
  const input = activity.input as Record<string, unknown>;
  if (typeof input.command === "string") return input.command;
  const rawInput = input.rawInput;
  if (rawInput && typeof rawInput === "object" && typeof (rawInput as Record<string, unknown>).command === "string") {
    return (rawInput as Record<string, string>).command;
  }
  return undefined;
}


function isTestReport(value: unknown): value is TestReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<TestReport>;
  return typeof report.passed === "number"
    && typeof report.total === "number"
    && Array.isArray(report.tests);
}

function LessonStateIcon({ completed, current }: { completed: boolean; current: boolean }) {
  const Icon = completed ? Check : current ? ArrowRight : LockKeyhole;
  const label = completed ? "Completed lesson" : current ? "Current lesson" : "Upcoming lesson";
  return (
    <Icon
      aria-label={label}
      className={completed ? "size-4 text-emerald-400" : current ? "size-4 text-foreground" : "size-3.5 text-muted-foreground/45"}
      role="img"
      strokeWidth={1.75}
    />
  );
}

function TestStateIcon({ report }: { report: TestReport | null }) {
  const Icon = !report ? CircleDot : report.complete ? CheckCircle2 : XCircle;
  return (
    <Icon
      aria-label={report ? `${report.passed} of ${report.total} tests passed` : "Tests not run"}
      className={`size-3.5 ${report?.complete ? "text-[#58c760]" : report ? "text-[#f05b8d]" : "text-[#878787]"}`}
      role="img"
      strokeWidth={1.75}
    />
  );
}

function testPercentage(report: TestReport | null): string {
  if (!report || report.total === 0) return "—";
  return `${Math.round((report.passed / report.total) * 100)}%`;
}

function failureLines(report: TestReport | null, filePath: string): number[] {
  if (!report) return [];
  const suffix = `/${filePath.replaceAll("\\", "/")}:`;
  const lines = new Set<number>();
  for (const test of report.tests) {
    for (const message of test.failureMessages) {
      for (const frame of message.split("\n")) {
        if (!frame.replaceAll("\\", "/").includes(suffix)) continue;
        const match = frame.match(/:(\d+):\d+\)?$/);
        if (match) lines.add(Number(match[1]));
      }
    }
  }
  return [...lines];
}

function LessonBriefing({ markdown }: { markdown: string }) {
  return (
    <div className="mt-5 max-w-3xl space-y-2 font-prose text-[15px] leading-7 text-foreground/90">
      {markdown.split("\n").map((line, index) => {
        const value = line.trim();
        if (!value) return null;
        if (value.startsWith("### ")) {
          return <h3 className="pt-2 font-display text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground" key={index}>{value.slice(4)}</h3>;
        }
        const numbered = value.match(/^(\d+)\.\s+(.*)$/);
        if (numbered) {
          return <p className="pl-4" key={index}><span className="mr-2 font-mono text-xs text-muted-foreground">{numbered[1]}.</span>{inlineCode(numbered[2])}</p>;
        }
        return <p key={index}>{inlineCode(value)}</p>;
      })}
    </div>
  );
}

function inlineCode(value: string) {
  return value.split(/(`[^`]+`)/g).map((part, index) => part.startsWith("`")
    ? <code className="bg-surface-3 px-1 py-0.5 font-mono text-[14px]" key={index}>{part.slice(1, -1)}</code>
    : part);
}

function MessageContent({
  autoHighlight = false,
  fragments,
  kind,
  onHighlight,
  text,
  workspaceId,
}: {
  autoHighlight?: boolean;
  fragments?: Record<string, string>;
  kind?: "message" | "commentary" | "reasoning" | "tool" | "checkpoint" | "lesson-fragment";
  onHighlight?: (highlight: CodeHighlight) => void;
  text: string;
  workspaceId?: string;
}) {
  const automaticHighlight = useRef("");
  useEffect(() => {
    if (!autoHighlight || !onHighlight) return;
    const highlight = codeHighlights(text).at(-1);
    if (!highlight) return;
    const signature = `${highlight.from}:${highlight.to}`;
    if (automaticHighlight.current === signature) return;
    automaticHighlight.current = signature;
    onHighlight(highlight);
  }, [autoHighlight, onHighlight, text]);

  if (kind === "lesson-fragment") {
    const fragment = fragments?.[text];
    return fragment
      ? <div className="w-full border border-border bg-surface-1 p-4"><CourseContent basePath={null} workspaceId={workspaceId ?? ""}>{fragment}</CourseContent></div>
      : <p className="w-full text-sm text-muted-foreground">The authored lesson fragment “{text}” is unavailable.</p>;
  }
  if (kind === "commentary") {
    return (
      <div className="w-full border-l border-dashed pl-3 text-sm text-muted-foreground">
        <p className="mb-1 font-display text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Agent note</p>
        <MarkdownText onHighlight={onHighlight} text={text} />
      </div>
    );
  }
  if (kind === "tool" || kind === "checkpoint") {
    return <p className="w-full font-mono text-xs text-muted-foreground">{text}</p>;
  }

  const parts = text.split(/```([\w-]*)\n([\s\S]*?)```/g);
  return (
    <div className="w-full space-y-2">
      {parts.map((part, index) => {
        if (index % 3 === 1) return null;
        if (index % 3 === 2) {
          return (
            <CodeBlock className="my-2 w-full" code={part.trimEnd()} key={index} language={codeLanguage(parts[index - 1])}>
              <CodeBlockCopyButton aria-label="Copy code" />
            </CodeBlock>
          );
        }
        return part.trim() ? <MarkdownText key={index} onHighlight={onHighlight} text={part} /> : null;
      })}
    </div>
  );
}

function MarkdownText({ onHighlight, text }: { onHighlight?: (highlight: CodeHighlight) => void; text: string }) {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }
    const listMatch = line.match(/^([-*]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      const ordered = /^\d/.test(listMatch[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].trim().match(/^([-*]|\d+[.)])\s+(.*)$/);
        if (!match || /^\d/.test(match[1]) !== ordered) break;
        items.push(match[2]);
        index += 1;
      }
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-7`} key={`list-${index}`}>
          {items.map((item, itemIndex) => <li key={itemIndex}>{inlineMessage(item, onHighlight)}</li>)}
        </List>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push(<p className="font-semibold text-foreground" key={`heading-${index}`}>{inlineMessage(heading[2], onHighlight)}</p>);
    } else if (line.startsWith("> ")) {
      blocks.push(<blockquote className="border-l border-dashed pl-3 text-muted-foreground" key={index}>{inlineMessage(line.slice(2), onHighlight)}</blockquote>);
    } else {
      blocks.push(<p className="whitespace-pre-wrap" key={index}>{inlineMessage(line, onHighlight)}</p>);
    }
    index += 1;
  }
  return <>{blocks}</>;
}

function inlineMessage(value: string, onHighlight?: (highlight: CodeHighlight) => void) {
  return value.split(/(`[^`]+`|\*\*[^*]+\*\*|\[highlight:L\d+(?:-(?:L)?\d+)?\])/giu).map((part, index) => {
    const highlight = codeHighlight(part);
    if (highlight) {
      return (
        <button
          className="dojo-inline-code cursor-pointer text-blue-500 hover:text-blue-400"
          key={index}
          onClick={() => onHighlight?.(highlight)}
          type="button"
        >
          {part}
        </button>
      );
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code className="dojo-inline-code" key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function ChatTestTerminal({ report }: { report?: TestReport }) {
  const lines = report?.tests.flatMap((test) => [
    `${test.status === "passed" ? "✓" : test.status === "failed" ? "×" : "-"} ${test.name}`,
    ...test.failureMessages.slice(0, 1).map((failure) => `  ${failure.split("\n")[0]}`),
  ]) ?? [];
  return (
    <TerminalBlock
      className="max-w-none"
      command={report ? `${report.passed}/${report.total} lesson checks passed` : "Running lesson checks"}
      done={Boolean(report)}
      failed={Boolean(report?.failed)}
      lines={lines}
      visibleCount={lines.length}
    />
  );
}

function LiveCheckSummary({ tests }: { tests: TestReport["tests"] }) {
  const lines = tests.map((test) => `${test.status === "passed" ? "✓" : "×"} ${test.name}`);
  return <TerminalBlock className="max-w-none" command="Running lesson checks" done={false} lines={lines} visibleCount={lines.length} />;
}

function RunningTestResults({ tests }: { tests: TestReport["tests"] }) {
  return (
    <section aria-busy="true" aria-live="polite">
      <AiTestResults className="rounded-none border-0 bg-black text-[#ededed]" summary={{ passed: 0, failed: 0, skipped: 0, total: 0 }}>
        <TestResultsHeader>
          <div>
            <h3 className="font-semibold">Test results</h3>
            <p className="mt-1 text-sm text-[#878787]">{tests.length > 0 ? `${tests.length} tests finished…` : "Running kata tests…"}</p>
          </div>
        </TestResultsHeader>
        <TestResultsContent>
          {tests.length === 0
            ? <p className="px-1 font-mono text-xs text-[#878787]">Executing the configured test command</p>
            : tests.map((test, index) => (
              <div className="flex items-center gap-2 px-1 py-1 font-mono text-xs" key={`${test.name}-${index}`}>
                {test.status === "passed" ? <Check className="size-3.5 text-emerald-500" /> : <XCircle className="size-3.5 text-red-500" />}
                <span>{test.name}</span>
              </div>
            ))}
        </TestResultsContent>
      </AiTestResults>
    </section>
  );
}

function LessonTestResults({ report, title }: { report: TestReport; title: string }) {
  const suites = groupTestsBySuite(report.tests, title);
  const ungrouped = suites.get("") ?? [];
  const passedGroups = [...suites.values()].filter((tests) =>
    tests.some((test) => test.status === "passed") && tests.every((test) => test.status !== "failed")
  ).length;
  return (
    <section aria-labelledby="test-results-title">
      <AiTestResults className="rounded-none border-0 bg-black text-[#ededed]" summary={{ passed: report.passed, failed: report.failed, skipped: report.skipped, total: report.total, duration: report.durationMs }}>
        <TestResultsHeader>
          <div>
            <h3 className="font-semibold" id="test-results-title">Test results</h3>
            <p className="mt-1 text-sm text-muted-foreground">{passedGroups} of {suites.size} test groups passed</p>
          </div>
        </TestResultsHeader>
        <TestResultsContent>
          <TestResultsProgress
            aria-label="Test progress"
            aria-valuemax={report.total}
            aria-valuemin={0}
            aria-valuenow={report.passed}
            role="progressbar"
          />
          {ungrouped.map((test) => <TestResult key={`${test.filePath ?? ""}:${test.name}`} test={test} />)}
          {[...suites.entries()].filter(([name]) => name).map(([name, tests]) => {
            const passed = tests.filter((test) => test.status === "passed").length;
            const failed = tests.filter((test) => test.status === "failed").length;
            const skipped = tests.filter((test) => test.status === "skipped").length;
            const status = failed > 0 ? "failed" : passed > 0 ? "passed" : "skipped";
            return (
              <TestSuite className="rounded-none border-[#242424] bg-black" defaultOpen key={name} name={name} status={status}>
                <TestSuiteName>
                  <span className="font-medium text-sm">{name}</span>
                  <TestSuiteStats data-testid={`suite-stats-${name}`} failed={failed} passed={passed} skipped={skipped} />
                </TestSuiteName>
                <TestSuiteContent>
                  {tests.map((test) => <TestResult key={`${test.filePath ?? ""}:${test.name}`} test={test} />)}
                </TestSuiteContent>
              </TestSuite>
            );
          })}
        </TestResultsContent>
      </AiTestResults>
    </section>
  );
}

function TestResult({ test }: { test: TestReport["tests"][number] }) {
  return <Test duration={test.durationMs} name={test.name} status={test.status} />;
}

function groupTestsBySuite(tests: TestReport["tests"], fallback: string): Map<string, TestReport["tests"]> {
  const groups = new Map<string, TestReport["tests"]>();
  for (const test of tests) {
    const name = test.suite.join(" › ") || fallback;
    groups.set(name, [...(groups.get(name) ?? []), test]);
  }
  return groups;
}

function humanTitle(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function codeLanguage(value: string): BundledLanguage {
  const language = value.toLowerCase();
  if (language === "js") return "javascript";
  if (language === "ts") return "typescript";
  if (language === "py") return "python";
  if (language === "tsx" || language === "jsx" || language === "javascript" || language === "typescript" || language === "python" || language === "json" || language === "bash" || language === "shell") {
    return language;
  }
  return "markdown";
}
