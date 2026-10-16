import { fetchServerSentEvents, useChat, type UIMessage } from "@tanstack/ai-react";
import type { ChatClientOptions } from "@tanstack/ai-client";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthoringChat } from "./authoring-chat";
import { httpError } from "@/lib/http-error";

type Snapshot = { session?: { sessionId: string }; messages: UIMessage[]; initialResumeSnapshot?: ChatClientOptions["initialResumeSnapshot"] };

export function EveAuthoringChat({ sessionId, api, onSession }: {
  sessionId?: string;
  api(path: string): string;
  onSession(id: string): void;
}) {
  const current = useRef(sessionId);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  useEffect(() => {
    // Updating the URL for our newly created session must not restart its stream.
    if (snapshot && current.current === sessionId) return;
    current.current = sessionId;
    setSnapshot(null);
    setError(undefined);
    const controller = new AbortController();
    // Delay the irreversible start until React's mount replay has settled.
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void (async () => {
        let id = sessionId;
        if (!id) {
          const start = await fetch(api("/api/authoring/eve/sessions/start"), { method: "POST", signal: controller.signal });
          if (!start.ok) throw await httpError(start);
          id = (await start.json() as { sessionId: string }).sessionId;
          // Acceptance already created a durable conversation. Persist its URL
          // before reading history, so a failed read cannot orphan it and a
          // refresh cannot start another paid turn. The route loads its history.
          if (controller.signal.aborted) return;
          current.current = id;
          onSession(id);
          return;
        }
        const response = await fetch(api(`/api/authoring/eve/sessions/${encodeURIComponent(id)}`), { signal: controller.signal });
        if (!response.ok) throw await httpError(response);
        const value = await response.json() as Snapshot;
        if (controller.signal.aborted) return;
        current.current = id;
        setSnapshot(value);
      })().catch(cause => { if (!controller.signal.aborted) setError(String(cause)); });
    });
    return () => controller.abort();
  }, [sessionId, api, loadAttempt]);
  if (!snapshot) return <AuthoringChat messages={[]} status="ready" busy={!error} inputDisabled value="" onValueChange={() => {}} onSend={() => {}} onAnswer={() => {}} error={error}
    onRetryLoad={sessionId ? () => setLoadAttempt(attempt => attempt + 1) : undefined} />;
  return <EveConversation key={snapshot.session?.sessionId ?? "new"} snapshot={snapshot} api={api} onSession={id => {
    current.current = id;
    onSession(id);
  }} onReload={() => {
    // Re-read the durable session; Eve keeps running turns server-side.
    setSnapshot(null);
    setLoadAttempt(attempt => attempt + 1);
  }} />;
}

function EveConversation({ snapshot, api, onSession, onReload }: { snapshot: Snapshot; api(path: string): string; onSession(id: string): void; onReload(): void }) {
  const session = useRef(snapshot.session?.sessionId);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();
  const connection = useMemo(() => fetchServerSentEvents(
    () => api(session.current ? `/api/authoring/eve/sessions/${encodeURIComponent(session.current)}/messages` : "/api/authoring/eve/sessions"),
  ), [api]);
  const chat = useChat({
    connection, persistence: false, threadId: snapshot.session?.sessionId ?? "new-authoring",
    initialMessages: snapshot.messages, initialResumeSnapshot: snapshot.initialResumeSnapshot,
    onChunk(chunk) {
      if (chunk.type === "RUN_STARTED" && session.current !== chunk.threadId) {
        session.current = chunk.threadId;
        onSession(chunk.threadId);
      }
    },
    onError(cause) { setError(cause.message); },
  });
  async function send(message: string) {
    if (!message.trim()) return;
    setValue("");
    setError(undefined);
    try { await chat.sendMessage(message); } catch (cause) { setError(String(cause)); }
  }
  function answer(answers: Record<string, AskUserAnswer>) {
    const entries = Object.values(answers).map(value => {
      const interrupt = chat.interrupts.find(item => item.id === value.questionId);
      if (interrupt?.kind !== "generic" || !interrupt.canResolve) throw new Error("This question is no longer available. Reload its session to recover the current state.");
      return { interrupt, payload: { ...(value.selectedIds[0] ? { optionId: value.selectedIds[0] } : {}), ...(value.otherText ? { text: value.otherText } : {}) } };
    });
    for (const { interrupt, payload } of entries) interrupt.resolveInterrupt(payload);
  }
  return <AuthoringChat messages={chat.messages} status={chat.status} busy={chat.resuming} value={value} onValueChange={setValue}
    queueLabel={chat.interrupts.length > 0 && !chat.resuming ? "Waiting for your answer" : undefined}
    queue={chat.queue.map(item => {
      const content = typeof item.content === "string" ? item.content : item.content.content;
      return { id: item.id, text: typeof content === "string" ? content : content.flatMap(part => part.type === "text" ? [part.content] : []).join("") };
    })} onCancelQueued={chat.cancelQueued}
    onSend={message => { void send(message); }} onAnswer={answer} error={error ?? chat.interruptErrors[0]?.message}
    onRetryLoad={error && session.current ? onReload : undefined}
    onRetryAnswer={chat.interruptErrors.some(item => item.retryable) ? () => {
      setError(undefined);
      chat.retryInterrupts();
    } : undefined} />;
}
