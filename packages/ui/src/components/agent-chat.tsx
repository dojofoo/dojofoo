import { fetchServerSentEvents, useChat, type UIMessage } from "@tanstack/ai-react";
import type { ChatClientOptions, ConnectionAdapter } from "@tanstack/ai-client";
import type { Persona } from "@dojofoo/agent-api";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthoringChat } from "./authoring-chat";
import { httpError } from "@/lib/http-error";
import { chatMessageContent } from "@/lib/chat-files";

type Snapshot = { sessionId: string; messages: UIMessage[]; initialResumeSnapshot?: ChatClientOptions["initialResumeSnapshot"] };
type Session = { id: string; resume?: { threadId: string; runId: string; pendingInterrupts: unknown[] } };
type Page<T> = { data: T[]; pagination: { hasMore: boolean } };
const agentApi = (workspaceId: string, path = "") => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}${path}`;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await httpError(response);
  return response.json() as Promise<T>;
}

async function readSession(workspaceId: string, sessionId: string, signal: AbortSignal): Promise<Snapshot> {
  const path = agentApi(workspaceId, `/sessions/${encodeURIComponent(sessionId)}`);
  const [session, first] = await Promise.all([
    json<Session>(path, { signal }),
    json<Page<UIMessage>>(`${path}/messages?page=0&per_page=500`, { signal }),
  ]);
  const messages = [...first.data];
  for (let page = 1, hasMore = first.pagination.hasMore; hasMore; page++) {
    const result = await json<Page<UIMessage>>(`${path}/messages?page=${page}&per_page=500`, { signal });
    messages.push(...result.data);
    hasMore = result.pagination.hasMore;
  }
  return {
    sessionId: session.id, messages,
    initialResumeSnapshot: session.resume ? {
      resumeState: { threadId: session.resume.threadId, runId: session.resume.runId },
      pendingInterrupts: session.resume.pendingInterrupts,
    } as ChatClientOptions["initialResumeSnapshot"] : undefined,
  };
}

/** Every persona uses the same conversation, uploads and session lifecycle. */
export function AgentChat({ workspaceId, persona, sessionId, onSession, embedded }: {
  embedded?: boolean;
  workspaceId: string;
  persona: Persona;
  sessionId?: string;
  onSession(id: string): void;
}) {
  const current = useRef(sessionId);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const placeholder = persona === "kyoshi" ? "Shape this lesson with Kyoshi…" : "Ask your Sensei…";
  useEffect(() => {
    if (snapshot && current.current === sessionId) return;
    if (current.current !== sessionId) { setValue(""); setFiles([]); }
    current.current = sessionId;
    setSnapshot(null);
    setError(undefined);
    const controller = new AbortController();
    // React's mount replay must settle before creating a durable conversation.
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void (async () => {
        if (!sessionId) {
          const created = await json<Session>(agentApi(workspaceId, "/sessions"), {
            method: "POST", signal: controller.signal,
            headers: { "content-type": "application/json" }, body: JSON.stringify({ persona }),
          });
          if (controller.signal.aborted) return;
          // Bookmark acceptance before reading history so retries reuse this session.
          current.current = created.id;
          onSession(created.id);
          return;
        }
        const saved = await readSession(workspaceId, sessionId, controller.signal);
        if (!controller.signal.aborted) setSnapshot(saved);
      })().catch(cause => { if (!controller.signal.aborted) setError(String(cause)); });
    });
    return () => controller.abort();
  }, [sessionId, workspaceId, persona, loadAttempt]);
  if (!snapshot) return <AuthoringChat embedded={embedded} placeholder={placeholder} messages={[]} status="ready" busy={!error} inputDisabled
    value={value} onValueChange={setValue} files={files} onFilesChange={setFiles} onSend={() => {}} onAnswer={() => {}} error={error}
    onRetryLoad={error ? () => setLoadAttempt(attempt => attempt + 1) : undefined} />;
  return <AgentConversation key={snapshot.sessionId} embedded={embedded} workspaceId={workspaceId} snapshot={snapshot} placeholder={placeholder}
    value={value} onValueChange={setValue} files={files} onFilesChange={setFiles}
    queueLabel={persona === "kyoshi" ? "Kyoshi is responding" : "Sensei is responding"}
    onReload={() => { setSnapshot(null); setLoadAttempt(attempt => attempt + 1); }} />;
}

function AgentConversation({ workspaceId, snapshot, onReload, embedded, value, onValueChange, files, onFilesChange, placeholder, queueLabel }: {
  embedded?: boolean; workspaceId: string; snapshot: Snapshot; onReload(): void;
  value: string; onValueChange(value: string): void; files: File[]; onFilesChange(files: File[]): void;
  placeholder: string; queueLabel: string;
}) {
  const [error, setError] = useState<string>();
  const path = agentApi(workspaceId, `/sessions/${encodeURIComponent(snapshot.sessionId)}`);
  const reportError = (cause: unknown) => {
    const detail = cause instanceof Error && cause.name === "StreamReadError" && cause.cause instanceof Error ? cause.cause : cause;
    setError(detail instanceof Error ? detail.message : String(detail));
  };
  const connection = useMemo((): ConnectionAdapter => {
    const fetchClient = (async (input, init) => {
      const response = await fetch(input, init);
      if (!response.ok) throw await httpError(response);
      return response;
    }) as typeof fetch;
    const runs = fetchServerSentEvents(`${path}/runs`, { fetchClient });
    const events = fetchServerSentEvents(`${path}/events`, { fetchClient });
    return { connect: runs.connect, joinRun: events.joinRun };
  }, [path]);
  const chat = useChat({
    connection, persistence: false, threadId: snapshot.sessionId,
    initialMessages: snapshot.messages, initialResumeSnapshot: snapshot.initialResumeSnapshot,
    onError: reportError,
  });
  async function send(message: string, selected: File[]) {
    if (!message.trim() && !selected.length) return;
    const content = await chatMessageContent(message, selected);
    setError(undefined);
    void chat.sendMessage(content).catch(reportError);
  }
  async function cancel() {
    const runId = chat.runId;
    if (!runId) return;
    setError(undefined);
    try {
      await json(`${path}/runs/${encodeURIComponent(runId)}`, {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "cancelled" }),
      });
      chat.stop();
    } catch (cause) { setError(String(cause)); }
  }
  function answer(answers: Record<string, AskUserAnswer>) {
    const entries = Object.values(answers).map(value => {
      const interrupt = chat.interrupts.find(item => item.id === value.questionId);
      if (interrupt?.kind !== "generic" || !interrupt.canResolve) throw new Error("This question is no longer available. Reload its session to recover the current state.");
      return { interrupt, payload: { ...(value.selectedIds[0] ? { optionId: value.selectedIds[0] } : {}), ...(value.otherText ? { text: value.otherText } : {}) } };
    });
    for (const { interrupt, payload } of entries) interrupt.resolveInterrupt(payload);
  }
  const active = chat.resuming || chat.status === "submitted" || chat.status === "streaming";
  return <AuthoringChat embedded={embedded} placeholder={placeholder} messages={chat.messages} status={chat.status} busy={chat.resuming}
    value={value} onValueChange={onValueChange} attachments files={files} onFilesChange={onFilesChange}
    queueLabel={chat.interrupts.length > 0 && !chat.resuming ? "Waiting for your answer" : queueLabel}
    queue={chat.queue.map(item => {
      const content = typeof item.content === "string" ? item.content : item.content.content;
      return { id: item.id, text: typeof content === "string" ? content : content.map(part => part.type === "text" ? part.content : (part.metadata as { filename?: string } | undefined)?.filename ?? "Attachment").join("\n") };
    })} onCancelQueued={chat.cancelQueued}
    onSend={send} onStop={() => { void cancel(); }} onAnswer={answer} error={error ?? (active ? undefined : chat.interruptErrors[0]?.message)}
    onRetryLoad={error ? onReload : undefined}
    onRetryAnswer={chat.interruptErrors.some(item => item.retryable) ? () => { setError(undefined); chat.retryInterrupts(); } : undefined} />;
}
