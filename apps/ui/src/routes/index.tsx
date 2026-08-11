import { ClientOnly, createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BundledLanguage } from "shiki";
import { ArrowRight, Check, CheckCircle2, Circle, CircleDot, LockKeyhole, RotateCcw, Save as SaveIcon, Undo2, XCircle } from "lucide-react";
import dojochoWordmark from "../../../../assets/dojocho.svg?url";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { CodeBlock, CodeBlockCopyButton } from "@/components/ai-elements/code-block";
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
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import {
  AskUserQuestions,
  type AskUserAnswer,
} from "@dojocho/ui/ask-user-questions";
import { Button } from "@dojocho/ui/button";
import { ChatMessage } from "@dojocho/ui/chat-message";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dojocho/ui/dialog";
import { InputMessage } from "@dojocho/ui/input-message";
import { InputCopy } from "@dojocho/ui/input-copy";
import { ScrollArea } from "@dojocho/ui/scroll-area";
import type { AgentActivity } from "@/server/lesson/codex-client";
import type { LessonSnapshot, TestReport } from "@/server/lesson/service";

const CodeEditor = lazy(() => import("@/components/code-editor"));

export const Route = createFileRoute("/")({ component: LessonPage });

const EMPTY_ACTIVITY: AgentActivity = {
  status: "idle",
  reasoning: "",
  steps: [],
  context: {
    usedTokens: 0,
    maxTokens: 1,
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
  },
  questions: null,
};

function LessonPage() {
  const [lesson, setLesson] = useState<LessonSnapshot | null>(null);
  const [activity, setActivity] = useState<AgentActivity>(EMPTY_ACTIVITY);
  const [code, setCode] = useState("");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"code" | "tests">("code");
  const [checking, setChecking] = useState(false);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState("Loading your dojo…");
  const [error, setError] = useState<string | null>(null);
  const activityJson = useRef(JSON.stringify(EMPTY_ACTIVITY));
  const navigationAbort = useRef<AbortController | null>(null);
  const navigationVersion = useRef(0);
  const undoEditor = useRef<(() => boolean) | null>(null);
  const kataRef = useRef<string | undefined>(undefined);
  kataRef.current = lesson?.kata;
  const chatTransport = useMemo(() => new DefaultChatTransport({
    api: "/api/lesson/chat",
    prepareSendMessagesRequest: ({ messages }) => {
      const latest = messages.at(-1);
      const message = latest?.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("") ?? "";
      return { body: { kata: kataRef.current, message } };
    },
  }), []);
  const {
    error: chatError,
    messages: streamedMessages,
    sendMessage,
    setMessages: setStreamedMessages,
    status: chatStatus,
  } = useChat({ transport: chatTransport, throttle: 30 });
  const dirty = lesson ? code !== lesson.code : false;

  const apply = useCallback((next: LessonSnapshot) => {
    setLesson(next);
    setCode(next.code);
    setBusy("");
    setError(null);
  }, []);

  const request = useCallback(async (path: string, init?: RequestInit) => {
    setBusy(path.includes("chat") ? "Sensei is thinking" : "Working…");
    setError(null);
    const response = await fetch(`/api/lesson${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const body = (await response.json()) as LessonSnapshot | { error: string } | null;
    if (!response.ok || (body && "error" in body)) {
      throw new Error(body && "error" in body ? body.error : `Request failed (${response.status})`);
    }
    if (!body) throw new Error("No lesson is available");
    apply(body);
    return body;
  }, [apply]);

  useEffect(() => {
    fetch("/api/lesson")
      .then(async (response) => ({ response, body: (await response.json()) as LessonSnapshot | null }))
      .then(async ({ response, body }) => {
        if (!response.ok) throw new Error(`Could not load the dojo (${response.status})`);
        if (!body || !body.introduced || body.transcript.length === 0) {
          await request("/start", { method: "POST" });
        }
        else apply(body);
      })
      .catch((cause: Error) => {
        setBusy("");
        setError(cause.message);
      });
  }, [apply, request]);

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const response = await fetch(`/api/lesson/activity${lesson ? `?kata=${encodeURIComponent(lesson.kata)}` : ""}`);
        if (response.ok && active) {
          const next = await response.json() as AgentActivity;
          const serialized = JSON.stringify(next);
          if (serialized !== activityJson.current) {
            activityJson.current = serialized;
            setActivity(next);
          }
        }
      } catch {
        // A transient poll failure must not interrupt the lesson itself.
      }
    };
    void poll();
    const timer = window.setInterval(poll, 350);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [lesson?.kata]);

  useEffect(() => {
    setStreamedMessages([]);
  }, [lesson?.kata, setStreamedMessages]);

  useEffect(() => {
    if (chatError) setError(chatError.message);
  }, [chatError]);

  async function sendQuestion(message = question.trim()) {
    if (!message) return;
    setQuestion("");
    try {
      await sendMessage({ text: message });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
    }
  }

  async function answerTool(answers: Record<string, AskUserAnswer>) {
    const response = await fetch("/api/lesson/tool-response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kata: lesson?.kata,
        answers: Object.fromEntries(Object.values(answers).map((answer) => [
          answer.questionId,
          answer.otherText ? [...answer.selectedIds, answer.otherText] : answer.selectedIds,
        ])),
      }),
    });
    const body = await response.json() as LessonSnapshot | { ok: true } | { error: string };
    if (!response.ok || "error" in body) {
      setError("error" in body ? body.error : `Could not answer the sensei (${response.status})`);
      return;
    }
    if ("kata" in body) apply(body);
  }

  async function check() {
    setActiveWorkspaceTab("tests");
    setChecking(true);
    try {
      await request("/check", { method: "POST", body: JSON.stringify({ code }) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
    } finally {
      setChecking(false);
    }
  }

  async function reset() {
    try {
      await request("/reset", { method: "POST" });
      setActiveWorkspaceTab("code");
      setResetDialogOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
    }
  }

  async function viewLesson(name: string) {
    navigationAbort.current?.abort();
    const controller = new AbortController();
    const version = ++navigationVersion.current;
    navigationAbort.current = controller;
    setBusy("Working…");
    setError(null);
    try {
      const response = await fetch(`/api/lesson/${encodeURIComponent(name)}`, { signal: controller.signal });
      const body = await response.json() as LessonSnapshot | { error: string } | null;
      if (!response.ok || (body && "error" in body)) {
        throw new Error(body && "error" in body ? body.error : `Request failed (${response.status})`);
      }
      if (!body) throw new Error("No lesson is available");
      if (navigationVersion.current !== version || navigationAbort.current !== controller) return;
      apply(body);
      setActiveWorkspaceTab("code");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
    } finally {
      if (navigationAbort.current === controller) navigationAbort.current = null;
    }
  }

  const save = useCallback(async () => {
    if (!lesson?.isCurrent || code === lesson.code) return;
    try {
      await request("/solution", { method: "POST", body: JSON.stringify({ code }) });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setBusy("");
    }
  }, [code, lesson, request]);

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
        <p className="mt-4 text-muted-foreground">{error ?? busy}</p>
      </main>
    );
  }

  const completed = lesson.result?.complete === true || lesson.state === "completed";
  const thinking = chatStatus === "submitted" || chatStatus === "streaming" || activity.status === "thinking";
  const agentAction = currentAgentAction(activity, chatStatus);
  return (
    <main className="grid h-screen min-h-[42rem] grid-cols-[19rem_minmax(0,1fr)] overflow-hidden bg-background text-foreground">
      <LessonNavigation lesson={lesson} onOpenLesson={viewLesson} />

      <section className="grid min-h-0 min-w-0 grid-cols-[minmax(30rem,1.618fr)_minmax(22rem,1fr)]">
        <ScrollArea className="min-h-0 bg-surface-1" data-testid="lesson-pane">
          <div className="flex flex-col pb-12">
            <div className="order-2 px-8 pt-8">
              <p className={`text-xs font-semibold uppercase tracking-[0.18em] ${lesson.isCurrent ? "text-muted-foreground" : "text-emerald-400"}`}>
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
                    <DialogDescription>
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
                        lineHits={lesson.result?.coverage?.lineHits}
                        key={lesson.kata}
                        onChange={setCode}
                        onUndoReady={(undo) => { undoEditor.current = undo; }}
                        readOnly={!lesson.isCurrent}
                      />
                    </Suspense>
                  </ClientOnly>
                </div>
                <div className="h-full overflow-auto" hidden={activeWorkspaceTab !== "tests"} id="tests-panel" role="tabpanel">
                  {checking
                    ? <RunningTestResults />
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
                  onClick={() => request("/next", { method: "POST" }).catch((cause: Error) => setError(cause.message))}
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

        <aside className="flex min-h-0 flex-col border-l border-dashed bg-surface-2" data-testid="chat-pane">
          <div className="flex items-center justify-between border-b border-dashed px-4 py-3">
            <span className="flex items-center gap-2 font-semibold">
              Sensei
              {lesson.checkpointed && <span className="font-mono text-[10px] font-normal uppercase tracking-wider text-teal-400">Checkpointed</span>}
            </span>
            <div className="flex min-w-0 items-center justify-end gap-3">
              {agentAction && (
                <span
                  className="shimmer-text max-w-32 truncate text-right text-xs"
                  data-testid="agent-current-action"
                >
                  {agentAction.label}
                </span>
              )}
              {lesson.sessionId && (
                <InputCopy
                  className="w-48"
                  data-testid="codex-session"
                  label="Codex session ID"
                  value={lesson.sessionId}
                />
              )}
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1" viewportClassName="scroll-fade p-4">
            <div className="flex min-h-full flex-col gap-4">
              {lesson.transcript.map((message, index) => (
                <ChatMessage
                  data-testid={message.role === "assistant" ? "sensei-message" : "senpai-message"}
                  from={message.role}
                  key={`${message.role}-${message.kind ?? "message"}-${index}`}
                >
                  <MessageContent kind={message.kind} text={message.text} />
                </ChatMessage>
              ))}
              {streamedMessages.map((message) => (
                <StreamedChatMessage key={message.id} message={message} />
              ))}
              {activity.reasoning && (
                <Reasoning
                  className="w-full"
                  data-testid="agent-reasoning"
                  isStreaming={activity.status === "thinking"}
                >
                  <ReasoningTrigger />
                  <ReasoningContent>{activity.reasoning}</ReasoningContent>
                </Reasoning>
              )}
              {activity.questions && (
                <AskUserQuestions
                  className="mt-2"
                  onComplete={(answers) => void answerTool(answers)}
                  questions={activity.questions.map((item) => ({
                    id: item.id,
                    title: item.title,
                    options: item.options,
                    allowOther: item.allowOther,
                    freeText: item.options.length === 0,
                  }))}
                />
              )}
            </div>
          </ScrollArea>
          <div className="border-t border-dashed" data-testid="chat-composer">
              <label className="sr-only" htmlFor="sensei-composer">Message the sensei</label>
              <InputMessage
                disabled={activity.status === "waiting-for-user" || chatStatus !== "ready"}
                history={lesson.transcript.filter((item) => item.role === "user").map((item) => item.text)}
                onSend={(message) => void sendQuestion(message)}
                onValueChange={setQuestion}
                placeholder="Ask about the lesson…"
                sendLabel="Send"
                status={chatStatus === "submitted" || chatStatus === "streaming" ? "streaming" : "idle"}
                textareaProps={{ id: "sensei-composer", "aria-label": "Message the sensei" }}
                value={question}
              />
          </div>
        </aside>
      </section>
    </main>
  );
}

function LessonNavigation({
  lesson,
  onOpenLesson,
}: {
  lesson: LessonSnapshot;
  onOpenLesson: (name: string) => void | Promise<void>;
}) {
  const [expandedLesson, setExpandedLesson] = useState(lesson.kata);
  const openLessonRef = useRef(onOpenLesson);
  openLessonRef.current = onOpenLesson;
  const openLesson = useCallback((name: string) => {
    void openLessonRef.current(name);
  }, []);

  useEffect(() => {
    setExpandedLesson(lesson.kata);
  }, [lesson.kata]);

  return (
    <aside className="flex min-h-0 flex-col border-r border-dashed bg-surface-1" data-testid="lesson-navigation">
      <div className="border-b border-dashed px-5 pb-5 pt-5">
        <img alt="Dojocho wordmark" className="h-3.5 w-auto" src={dojochoWordmark} />
        <h1 className="mt-1.5 text-xl font-semibold">{humanTitle(lesson.dojo)}</h1>
        <h2 className="mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Chapters</h2>
      </div>
      <ScrollArea className="min-h-0 flex-1" data-testid="lesson-scroll" viewportClassName="scroll-fade pb-5">
        <div className="w-full">
          {lesson.lessons.map((item, index) => {
            return (
              <LessonNavigationItem
                currentKata={lesson.kata}
                expanded={expandedLesson === item.name}
                item={item}
                key={item.name}
                last={index === lesson.lessons.length - 1}
                onExpandedChange={setExpandedLesson}
                onOpenLesson={openLesson}
              />
            );
          })}
        </div>
      </ScrollArea>
    </aside>
  );
}

const LessonNavigationItem = memo(function LessonNavigationItem({
  currentKata,
  expanded,
  item,
  last,
  onExpandedChange,
  onOpenLesson,
}: {
  currentKata: string;
  expanded: boolean;
  item: LessonSnapshot["lessons"][number];
  last: boolean;
  onExpandedChange: (name: string) => void;
  onOpenLesson: (name: string) => void;
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
          <AccordionPrimitive.Trigger
            aria-description={!accessible ? "Upcoming lesson; expand to preview its goal" : undefined}
            className={`flex w-full items-center gap-2.5 px-4 py-4 text-left text-[13px] outline-none transition-colors hover:bg-hover focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--focus-ring,#6B97FF)] ${!accessible ? "cursor-default text-muted-foreground/40" : "text-muted-foreground data-[state=open]:text-foreground"}`}
            data-navigation-disabled={!accessible || undefined}
            onClick={() => accessible && item.name !== currentKata && onOpenLesson(item.name)}
          >
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate">{item.title}</span>
            </span>
            <LessonStateIcon completed={item.state === "completed"} current={item.isCurrent} />
          </AccordionPrimitive.Trigger>
        </AccordionPrimitive.Header>
        <LessonAccordionContent>
          <div>
            <p className="leading-5">{item.summary}</p>
            {accessible && item.name !== currentKata && (
              <button className="mt-2 text-xs font-medium text-foreground underline underline-offset-4" onClick={() => onOpenLesson(item.name)} type="button">
                Open lesson
              </button>
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

function StreamedChatMessage({ message }: { message: UIMessage }) {
  return (
    <ChatMessage
      data-testid={message.role === "assistant" ? "sensei-streaming-message" : "senpai-streaming-message"}
      from={message.role === "assistant" ? "assistant" : "user"}
    >
      <div className="w-full space-y-2">
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return <MessageContent key={`${part.type}-${index}`} text={part.text} />;
          }
          if (part.type === "reasoning") {
            return <MessageContent key={`${part.type}-${index}`} kind="reasoning" text={part.text} />;
          }
          return null;
        })}
      </div>
    </ChatMessage>
  );
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

function currentAgentAction(activity: AgentActivity, chatStatus: string): { label: string } | null {
  if (activity.questions) return { label: "Asking" };
  const activeStep = activity.steps.findLast((step) => step.status === "active");
  if (activeStep) return { label: activeStep.label };
  if (chatStatus === "submitted" || chatStatus === "streaming") return { label: "Responding" };
  if (activity.status === "thinking") return { label: "Thinking" };
  return null;
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
    <div className="mt-5 max-w-3xl space-y-2 text-[15px] leading-7 text-foreground/90">
      {markdown.split("\n").map((line, index) => {
        const value = line.trim();
        if (!value) return null;
        if (value.startsWith("### ")) {
          return <h3 className="pt-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground" key={index}>{value.slice(4)}</h3>;
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
    ? <code className="bg-surface-3 px-1 py-0.5 font-mono text-[0.9em]" key={index}>{part.slice(1, -1)}</code>
    : part);
}

function MessageContent({ kind, text }: { kind?: "message" | "commentary" | "reasoning" | "tool" | "checkpoint"; text: string }) {
  if (kind === "reasoning") {
    return (
      <Reasoning className="w-full" defaultOpen={false}>
        <ReasoningTrigger />
        <ReasoningContent>{text}</ReasoningContent>
      </Reasoning>
    );
  }
  if (kind === "commentary") {
    return (
      <div className="w-full border-l border-dashed pl-3 text-sm text-muted-foreground">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider">Agent note</p>
        <MarkdownText text={text} />
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
        return part.trim() ? <MarkdownText key={index} text={part} /> : null;
      })}
    </div>
  );
}

function MarkdownText({ text }: { text: string }) {
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
        <List className={`${ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`} key={`list-${index}`}>
          {items.map((item, itemIndex) => <li key={itemIndex}>{inlineMessage(item)}</li>)}
        </List>,
      );
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      blocks.push(<p className="font-semibold text-foreground" key={`heading-${index}`}>{inlineMessage(heading[2])}</p>);
    } else if (line.startsWith("> ")) {
      blocks.push(<blockquote className="border-l border-dashed pl-3 text-muted-foreground" key={index}>{inlineMessage(line.slice(2))}</blockquote>);
    } else {
      blocks.push(<p className="whitespace-pre-wrap" key={index}>{inlineMessage(line)}</p>);
    }
    index += 1;
  }
  return <>{blocks}</>;
}

function inlineMessage(value: string) {
  return value.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code className="bg-surface-3 px-1 py-0.5 font-mono text-[0.9em]" key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function RunningTestResults() {
  return (
    <section aria-busy="true" aria-live="polite">
      <AiTestResults className="rounded-none border-0 bg-black text-[#ededed]" summary={{ passed: 0, failed: 0, skipped: 0, total: 0 }}>
        <TestResultsHeader>
          <div>
            <h3 className="font-semibold">Test results</h3>
            <p className="mt-1 text-sm text-[#878787]">Running kata tests…</p>
          </div>
        </TestResultsHeader>
        <TestResultsContent>
          <p className="px-1 font-mono text-xs text-[#878787]">Executing the configured test command</p>
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
