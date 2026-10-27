import { AiMagicIcon } from "@dojofoo/uix/icons";
import { useNavigate } from "@tanstack/react-router";
import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentChatWorkspace } from "@dojofoo/uix/containers/learning-workspace";
import { AppShell, Icon } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { Button } from "@dojofoo/uix/components/button";
import { Composer } from "@dojofoo/uix/containers/assistant-home";
import { ComposerSpinner } from "@dojofoo/uix/components/composer";
import { LessonBrief } from "@dojofoo/uix/components/lesson-brief";
import { CourseCard } from "@dojofoo/uix/components/course-card";
import { BackIcon } from "@dojofoo/uix/icons";
import { followLink } from "@dojofoo/uix/lib/link-event";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { CourseContent } from "./course-content";
import { ChatTranscript } from "./chat/assistant-response";
import { StreamedChatMessage } from "./chat/streamed-message";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { chatAcceptsInput } from "@/lib/chat-internal";
import { codingAgents } from "@/lib/coding-agents";
import { lessonResources } from "@/lib/lesson-resources";
import type { InteractiveSnapshot } from "@/server/interactive/service";
import type { InteractiveConversation } from "@/server/interactive/conversation";

function api(workspace?: string, course?: string, path = "") {
  const base = workspace && course
    ? `/api/workspaces/${encodeURIComponent(workspace)}/courses/${encodeURIComponent(course)}/interactive`
    : "/api/interactive";
  return `${base}${path}${!workspace && course ? `?course=${encodeURIComponent(course)}` : ""}`;
}

async function read<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok || body?.error) throw new Error(body?.error ?? `Request failed (${response.status})`);
  return body as T;
}
const json = (value: unknown, method = "POST"): RequestInit => ({ method, headers: { "content-type": "application/json" }, body: JSON.stringify(value) });

export function InteractiveCourse({ workspace: requestedWorkspace, course: requestedCourse }: { workspace?: string; course?: string }) {
  const navigate = useNavigate();
  const { account, toast } = useAccountMenu();
  const [lesson, setLesson] = useState<InteractiveSnapshot | null>(null);
  const [workspace, setWorkspace] = useState("");
  const [question, setQuestion] = useState("");
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
    const selected = requestedWorkspace ?? window.localStorage.getItem("dojofoo.workspace") ?? "";
    setWorkspace(selected);
    setLesson(null);
    setConversation(undefined);
    setAgentChanging(false);
    setModelChanging(false);
    setConversationReady(false);
    setQuestion("");
    setError(undefined);
    const url = requestedCourse ? api(selected, requestedCourse) : `/api/interactive${selected ? `?workspace=${encodeURIComponent(selected)}` : ""}`;
    void read<InteractiveSnapshot>(url)
      .then(value => { if (!cancelled) setLesson(value); })
      .catch(cause => { if (!cancelled) setError(cause.message); });
    return () => { cancelled = true; };
  }, [requestedCourse, requestedWorkspace]);

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
    if (agentChanging || modelChanging || working || (harness === conversation?.harness && conversation?.sessionId)) return;
    const request = ++conversationRequest.current;
    setAgentChanging(true);
    setConversationError(undefined);
    try {
      const value = await read<InteractiveConversation>(api(workspace, lesson?.dojo, "/configuration/harness"), json({ harness }, "PUT"));
      if (request !== conversationRequest.current) return;
      setConversation(value);
      setter.current(value.messages);
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

  const brand = <a href="/" className="flex items-center" aria-label="Dojo dashboard" onClick={event => followLink(event, () => { void navigate({ to: "/" }); })}><BrandLogo className="w-11" /></a>;
  const shell = { ...account, workspace: "Dojo", brand, sidebarWidth: "18rem", showNews: false, showOnboarding: false };
  if (!lesson) return <div style={{ height: "100dvh" }}><AppShell {...shell} navigation={[]}>
    <p role={error ? "alert" : "status"} className="p-8 text-sm text-muted-foreground">{error ?? "Loading your lesson…"}</p>
  </AppShell></div>;

  const current = lesson.current;
  const material = current?.type === "present" ? current.content : current?.prompt ?? "";
  const basePath = current?.type === "present" ? current.contentBase : current?.promptBase ?? null;
  const resources = lessonResources(material, basePath, workspace, lesson.dojo);
  const model = conversation?.model;
  return <div style={{ height: "100dvh" }}><AgentChatWorkspace {...shell}
    navigation={[{ id: "course", heading: "Lessons", before: <div className="lj-course"><CourseCard
        course={{ title: lesson.course?.name ?? lesson.title, version: lesson.course?.version, author: lesson.course?.author,
          repo: lesson.course?.repository, language: lesson.course?.language, lessons: lesson.course?.lessons, art: { hue: 350, glyph: "" } }}
        enrolled={{ version: lesson.course?.version, progress: Math.round(lesson.step / lesson.totalSteps * 100),
          label: `${String(Math.min(lesson.step + 1, lesson.totalSteps)).padStart(2, "0")} · ${lesson.lessonTitle}`, value: current?.title }} />
      </div>, items: [{ id: "current", label: current?.title ?? "Course complete", marker: String(Math.min(lesson.step + 1, lesson.totalSteps)), state: lesson.complete ? "done" : "active" }] }]}
    active="current" navigationKey={`${workspace}:${lesson.dojo}`} navigationTransition={false}
    crumbs={[{ label: "Dashboard", icon: <Icon icon={BackIcon} size={14} />, onClick: () => { void navigate({ to: "/" }); } }, { label: lesson.lessonTitle }]}
    contentKind="material" editor={null} scroller={viewportRef} askAssistant={acceptsInput}
    onCommand={(id, query) => { if (id === "ask" && query) void send(query); }}
    details={<div data-testid="interactive-material">
      <LessonBrief title={current?.title ?? lesson.lessonTitle} resources={resources}>
        <CourseContent basePath={basePath} workspaceId={workspace} courseId={lesson.dojo} diagrams={false}>{material}</CourseContent>
      </LessonBrief>
      {error && <p role="alert" className="mt-4 text-sm text-[var(--destructive)]">{error}</p>}
    </div>}
    header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Sensei</b><span className="ui-as-chat__speaker-note">Teaches this lesson</span></span>}
    composer={<Composer tray={false} attachments={false} dictation={false} plugins={false} agent={codingAgents.find(agent => agent.value === conversation?.harness) ?? { value: conversation?.harness, name: conversation?.harness ?? "Coding agent", icon: AiMagicIcon }}
      agents={codingAgents.filter(agent => conversation?.harnesses?.some(value => value === agent.value)).map(agent => ({ ...agent, description: "Open this agent’s conversation" }))}
      onAgentChange={value => { void changeAgent(value); }} agentChanging={agentChanging} loading={sessionLoading} id="interactive-sensei" label="Message the sensei" placeholder="Ask your Sensei…" value={question} onValueChange={setQuestion}
      disabled={!acceptsInput} busy={working} onStop={stop} onSend={value => { void send(value); }}
      history={messages.filter(message => message.role === "user").map(message => message.parts.flatMap(part => part.type === "text" ? [part.content] : []).join(""))}
      model={model?.currentValue} models={model?.options.map(option => ({ value: option.value, name: option.name, description: option.group ?? "", icon: AiMagicIcon })) ?? []} modelChanging={modelChanging} onModelChange={value => { void changeModel(value); }}
    />}>
    <div data-testid="chat-pane" data-chat-status={status} data-chat-error={chatError?.message} aria-busy={sessionLoading || agentChanging || undefined}>
      {(sessionLoading || agentChanging) && <p role="status" className="flex items-center gap-2 text-sm text-[var(--muted)]">
        <ComposerSpinner />Loading the {codingAgents.find(agent => agent.value === conversation?.harness)?.name ?? "coding agent"} session…
      </p>}
      {!messages.length && conversationReady && <p className="text-sm text-[var(--muted)]">Ask Sensei about this step whenever you need a hand.</p>}
      <ChatTranscript messages={messages} streaming={working} renderMessage={(message, streaming) => <StreamedChatMessage key={message.id} fragments={{}} workspaceId={workspace} message={message} streaming={streaming} onToolAnswer={answerTool} />} />
      {(conversationError || chatError) && <p role="alert" className="mt-4 text-sm text-[var(--destructive)]">{conversationError ?? chatError?.message}</p>}
      {conversationError && !working && <Button variant="secondary" onClick={() => void loadConversation()}>Reload conversation</Button>}
    </div>
  </AgentChatWorkspace>{toast}</div>;
}
