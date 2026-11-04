import { Link } from "@tanstack/react-router";
import { AiMagicIcon } from "@dojofoo/uix/icons";
import { useNavigate } from "@tanstack/react-router";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentChatWorkspace } from "@dojofoo/uix/containers/learning-workspace";
import { Icon } from "@dojofoo/uix/components/app-shell";
import { WorkspaceSkeleton } from "@dojofoo/uix/components/workspace-skeleton";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { Button } from "@dojofoo/uix/components/button";
import { Composer } from "@dojofoo/uix/containers/assistant-home";
import { Spinner } from "@mynaui/icons-react";
import { InteractiveLesson } from "@dojofoo/uix/components/interactive-lesson";
import { SlideDeck } from "@dojofoo/uix/components/slide-deck";
import { LessonBrief } from "@dojofoo/uix/components/lesson-brief";
import { courseAssetUrl } from "@/lib/course-asset-url";
import { CourseCard } from "@dojofoo/uix/components/course-card";
import { courseArt } from "@/lib/course-color";
import { BackIcon } from "@dojofoo/uix/icons";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { CourseContent } from "./course-content";
import { ChatTranscript } from "./chat/assistant-response";
import { StreamedChatMessage } from "./chat/streamed-message";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { useWorkspaceAgent } from "@/hooks/use-workspace-agent";
import { chatAcceptsInput } from "@/lib/chat-internal";
import { codingAgents } from "@/lib/coding-agents";
import { lessonResources } from "@/lib/lesson-resources";
import type { InteractiveSnapshot } from "@/server/interactive/service";
import type { InteractiveConversation } from "@/server/interactive/conversation";

function api(workspace: string, course?: string, path = "") {
  return workspace && course ? `/api/workspaces/${encodeURIComponent(workspace)}/courses/${encodeURIComponent(course)}/interactive${path}` : "/api/unavailable";
}

async function read<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok || body?.error) throw new Error(body?.error ?? `Request failed (${response.status})`);
  return body as T;
}
const json = (value: unknown, method = "POST"): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

export function InteractiveCourse({ workspace: requestedWorkspace, course: requestedCourse, initialLesson }: { workspace: string; course: string; initialLesson?: InteractiveSnapshot }) {
  const navigate = useNavigate();
  const { account, toast } = useAccountMenu({ preserveWorkspace: true });
  const [lesson, setLesson] = useState<InteractiveSnapshot | null>(initialLesson ?? null);
  const [workspace, setWorkspace] = useState(requestedWorkspace);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [stepBusy, setStepBusy] = useState(false);
  const stepRequest = useRef<AbortController | null>(null);
  const [error, setError] = useState<string>();
  const [conversation, setConversation] = useState<InteractiveConversation>();
  const [conversationError, setConversationError] = useState<string>();
  const [conversationReady, setConversationReady] = useState(false);
  const [modelChanging, setModelChanging] = useState(false);
  const [agentChanging, setAgentChanging] = useState(false);
  const apiBase = api(workspace, lesson?.dojo);
  const connection = useMemo(() => fetchServerSentEvents(api(workspace, lesson?.dojo, "/messages")), [apiBase]);
  const { messages, setMessages, sendMessage, stop, status, error: chatError } = useChat({ connection, threadId: apiBase, persistence: false });
  const setter = useRef(setMessages);
  setter.current = setMessages;
  const conversationRequest = useRef(0);
  const { viewportRef, scrollToBottom } = useChatScroll();
  const working = status === "submitted" || status === "streaming";
  const acceptsInput = Boolean(lesson) && conversationReady && !agentChanging && !modelChanging && chatAcceptsInput(status);
  // The agent's (ACP) session is still loading: on opening the lesson, and while switching agents
  const sessionLoading = Boolean(lesson) && !conversationReady && !conversationError;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    stepRequest.current = controller;
    const selected = requestedWorkspace;
    setWorkspace(selected);
    setLesson(initialLesson ?? null);
    setConversation(undefined);
    setAgentChanging(false);
    setModelChanging(false);
    setConversationReady(false);
    setQuestion("");
    setAnswer("");
    setStepBusy(false);
    setError(undefined);
    const url = api(selected, requestedCourse);
    if (!initialLesson) void read<InteractiveSnapshot>(url)
      .then(value => { if (!cancelled) { setLesson(value); if (value.workspaceId) setWorkspace(value.workspaceId); } })
      .catch(cause => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; controller.abort(); };
  }, [requestedCourse, requestedWorkspace]);
  // The router can refresh the course after the page shows (a hovered link's preload); the conversation stays
  useEffect(() => { if (initialLesson) setLesson(initialLesson); }, [initialLesson]);

  async function updateStep(action: "answer" | "next", submittedAnswer = answer) {
    if (!lesson?.current || stepBusy) return;
    const signal = stepRequest.current?.signal;
    setStepBusy(true);
    setError(undefined);
    const path = action === "answer" ? api(workspace, lesson.dojo, "/answer")
      : `/api/workspaces/${encodeURIComponent(workspace)}/courses/${encodeURIComponent(lesson.dojo)}/lessons/${encodeURIComponent(lesson.current.id)}/progressions`;
    try {
      const next = await read<InteractiveSnapshot>(path, { ...json(action === "answer" ? { answer: submittedAnswer } : {}), signal });
      if (!signal?.aborted) { setLesson(next); setAnswer(""); }
    } catch (cause) {
      if (!signal?.aborted) setError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (!signal?.aborted) setStepBusy(false); }
  }

  async function selectMaterial(selection: { lessonId?: string; slideId?: string }) {
    if (!lesson || stepBusy) return;
    setStepBusy(true); setError(undefined);
    try {
      const next = await read<InteractiveSnapshot>(api(workspace, lesson.dojo, "/material"), json(selection, "PUT"));
      setLesson(next); setAnswer("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setStepBusy(false); }
  }

  const loadConversation = useCallback(async () => {
    const request = ++conversationRequest.current;
    setConversationReady(false);
    setConversationError(undefined);
    try {
      const value = await read<InteractiveConversation>(api(workspace, lesson?.dojo, "/conversation"));
      if (request !== conversationRequest.current) return;
      setConversation(value);
      setter.current(value.messages);
      setConversationReady(true);
    } catch (cause) {
      if (request === conversationRequest.current) setConversationError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [apiBase]);

  useEffect(() => {
    if (lesson) void loadConversation();
    return () => { conversationRequest.current += 1; };
  }, [lesson?.dojo, loadConversation]);
  // After a switch the course reads the new agent's own conversation
  const workspaceAgent = useWorkspaceAgent({ workspaceId: workspace, persona: "sensei", onSwitched: () => { void loadConversation(); } });

  async function send(value: string) {
    if (!acceptsInput || !value.trim()) return;
    const request = conversationRequest.current;
    setQuestion("");
    scrollToBottom();
    setConversationError(undefined);
    try {
      await sendMessage(value);
      const next = await read<InteractiveConversation>(api(workspace, lesson?.dojo, "/conversation"));
      if (request === conversationRequest.current) setConversation(next);
    } catch (cause) { if (request === conversationRequest.current) setConversationError(cause instanceof Error ? cause.message : String(cause)); }
  }
  async function answerTool(answers: Record<string, AskUserAnswer>) {
    try {
      await read(api(workspace, lesson?.dojo, "/messages"), json({ answers: Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, [...answer.selectedIds, ...(answer.otherText ? [answer.otherText] : [])]])) }));
    } catch (cause) { setConversationError(cause instanceof Error ? cause.message : String(cause)); }
  }
  async function changeAgent(harness: string) {
    if (agentChanging || modelChanging || working) return;
    if (harness === conversation?.harness && conversation?.sessionId) return conversation;
    const request = ++conversationRequest.current;
    setAgentChanging(true);
    setConversationError(undefined);
    try {
      const value = await read<InteractiveConversation>(api(workspace, lesson?.dojo, "/configuration/harness"), json({ harness }, "PUT"));
      if (request !== conversationRequest.current) return;
      setConversation(value);
      setter.current(value.messages);
      return value;
    } catch (cause) {
      if (request === conversationRequest.current) setConversationError(cause instanceof Error ? cause.message : String(cause));
    } finally { if (request === conversationRequest.current) setAgentChanging(false); }
  }
  async function changeModel(value: string) {
    if (!conversation || agentChanging || modelChanging || working) return;
    const request = ++conversationRequest.current;
    setModelChanging(true);
    setConversationError(undefined);
    try {
      const model = await read<NonNullable<InteractiveConversation["model"]>>(api(workspace, lesson?.dojo, "/configuration/model"), json({ value }, "PUT"));
      if (request === conversationRequest.current) setConversation(current => current ? { ...current, model } : current);
    } catch (cause) { if (request === conversationRequest.current) setConversationError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (request === conversationRequest.current) setModelChanging(false); }
  }

  const brand = <Link to="/" className="flex items-center" aria-label="Dojo dashboard"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></Link>;
  const shell = { ...account, workspace: "Dojo", brand, sidebarWidth: "18rem", showNews: false, showOnboarding: false };
  if (!lesson) return <div style={{ height: "100dvh" }}><AgentChatWorkspace {...shell}
    navigation={[{ id: "course", heading: "Lessons", items: [], before: !error && <WorkspaceSkeleton label="Loading lessons" rows={4} /> }]}
    crumbs={[{ label: "Dashboard", icon: <Icon icon={BackIcon} size={14} />, onClick: () => { void navigate({ to: "/" }); } }]}
    contentKind="material" askAssistant={false}
    editor={error ? <p role="alert" className="p-5 text-sm text-destructive">{error}</p> : <WorkspaceSkeleton />}
    header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Sensei</b></span>}
    composer={<Composer tray={false} disabled models={[]} attachments="unavailable" dictation={false} plugins={false}
      agent={{ name: "Coding agent", icon: AiMagicIcon }} placeholder="Ask your Sensei…" />} />{toast}</div>;

  const current = lesson.current;
  const material = current?.type === "present" ? current.content : current?.type === "question" ? current.prompt : "";
  const basePath = current?.type === "present" ? current.contentBase : current?.type === "question" ? current.promptBase : null;
  const resources = [...new Map(lesson.references.flatMap(reference => lessonResources(reference.source, reference.basePath, workspace, lesson.dojo)).map(resource => [resource.href, resource])).values()];
  const model = conversation?.model;
  const deck = lesson.deck && <SlideDeck testId="interactive-material" src={`${courseAssetUrl(lesson.deck, null, workspace, lesson.dojo)}&embedded=true#1`} title={`${lesson.title} slides`}
    course={{ state: { ...lesson, busy: stepBusy, error }, onAction: (action, value) => {
      if (action === "exit") { void navigate({ to: "/" }); return; }
      if (action === "previous") { const previous = lesson.slides[lesson.step - 1]; if (previous) void selectMaterial({ slideId: previous.id }); return; }
      void updateStep(action, value);
    } }} />;
  return <div style={{ height: "100dvh" }}><AgentChatWorkspace {...shell}
    navigation={[{ id: "course", heading: "Lessons", layout: "lessons", before: <div className="lj-course"><CourseCard
        course={{ title: lesson.title, version: lesson.course?.version, author: lesson.course?.author,
          repo: lesson.course?.repository, language: lesson.course?.language, lessons: lesson.course?.lessons, art: courseArt(lesson.dojo, lesson.course?.appearance), shader: lesson.course?.appearance?.shader }}
        enrolled={{ version: lesson.course?.version, progress: Math.round(lesson.completedLessons / lesson.lessons.length * 100),
          label: `${lesson.lessons.length} lessons`, value: lesson.complete ? "Completed" : "In progress" }} />
      </div>, items: lesson.lessons.map((item, index) => ({ id: item.id, label: item.title, marker: String(index + 1).padStart(2, "0"), state: item.state })) }]}
    active={lesson.lessonId} navigationKey={lesson.dojo} navigationTransition={false}
    onNavigate={id => { void selectMaterial({ lessonId: id }); }}
    crumbs={[{ label: "Dashboard", icon: <Icon icon={BackIcon} size={14} />, onClick: () => { void navigate({ to: "/" }); } }, { label: lesson.title }]}
    contentKind={lesson.deck ? "slides" : "material"} editor={deck || null} scroller={viewportRef} askAssistant={acceptsInput}
    onCommand={(id, query) => { if (id === "ask" && query) void send(query); }}
    details={lesson.deck ? <LessonBrief title={lesson.title} lead={lesson.course?.intro ? undefined : lesson.course?.description} resources={resources}>
      {lesson.course?.intro && <CourseContent basePath={null} workspaceId={workspace} courseId={lesson.dojo}>{lesson.course.intro.content.replace(/^# .+\r?\n+/, "")}</CourseContent>}
    </LessonBrief> : <div data-testid="interactive-material">
      <InteractiveLesson title={lesson.title} lead={lesson.course?.description} slideTitle={current?.title ?? lesson.lessonTitle} slideId={current?.id ?? "complete"} resources={resources}
        step={lesson.step} totalSteps={lesson.totalSteps} complete={lesson.complete && !current} question={current?.type === "question"} unlockedStep={lesson.unlockedStep}
        onPrevious={() => { const previous = lesson.slides[lesson.step - 1]; if (previous) void selectMaterial({ slideId: previous.id }); }}
        response={lesson.response} answer={answer} onAnswerChange={setAnswer} busy={stepBusy}
        onAnswer={() => { void updateStep("answer"); }} onNext={() => { void updateStep("next"); }}
        explanation={current?.type === "question" ? <CourseContent basePath={current.explanationBase} workspaceId={workspace} courseId={lesson.dojo} diagrams={false}>{current.explanation}</CourseContent> : undefined}>
        <CourseContent basePath={basePath} workspaceId={workspace} courseId={lesson.dojo} diagrams={false}>{material}</CourseContent>
      </InteractiveLesson>
      {error && <p role="alert" className="mt-4 text-sm text-[var(--destructive)]">{error}</p>}
    </div>}
    header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Sensei</b><span className="ui-as-chat__speaker-note">Teaches this lesson</span></span>}
    composer={<Composer tray={false} attachments="unavailable" dictation={false} plugins={false} agent={codingAgents.find(agent => agent.value === conversation?.harness) ?? { value: conversation?.harness, name: conversation?.harness ?? "Coding agent", icon: AiMagicIcon }}
      agents={workspaceAgent.agents} onAgentChange={workspaceAgent.request}
      agentChanging={workspaceAgent.switching || agentChanging || sessionLoading} id="interactive-sensei" label="Message the sensei" placeholder="Ask your Sensei…" value={question} onValueChange={setQuestion}
      disabled={!acceptsInput} busy={working} onStop={stop} onSend={value => { void send(value); }}
      history={messages.filter(message => message.role === "user").map(message => message.parts.flatMap(part => part.type === "text" ? [part.content] : []).join(""))}
      model={model?.currentValue} models={model?.options.map(option => ({ value: option.value, name: option.name, description: option.group ?? "", icon: AiMagicIcon })) ?? []} modelChanging={modelChanging} onModelChange={value => { void changeModel(value); }}
      onModelPrepare={async () => { if (!conversation?.harness) return false; return Boolean((await changeAgent(conversation.harness))?.model?.options.length); }}
    />}>
    <div data-testid="chat-pane" className="ui-as-chat__turns" data-chat-status={status} data-chat-error={chatError?.message} aria-busy={sessionLoading || agentChanging || undefined}>
      {(sessionLoading || agentChanging) && <p role="status" className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <Spinner className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />Loading the {codingAgents.find(agent => agent.value === conversation?.harness)?.name ?? "coding agent"} session…
      </p>}
      {!messages.length && conversationReady && <p className="text-sm text-[var(--muted)]">Ask Sensei about this lesson whenever you need a hand.</p>}
      <ChatTranscript messages={messages} streaming={working} renderMessage={(message, streaming) => <StreamedChatMessage key={message.id} fragments={{}} workspaceId={workspace} message={message} streaming={streaming} onToolAnswer={answerTool} />} />
      {(conversationError || chatError) && <p role="alert" className="mt-4 text-sm text-[var(--destructive)]">{conversationError ?? chatError?.message}</p>}
      {conversationError && !working && <Button variant="secondary" onClick={() => void loadConversation()}>Reload conversation</Button>}
      {workspaceAgent.notice}
      {workspaceAgent.dialog}
    </div>
  </AgentChatWorkspace>{toast}</div>;
}
