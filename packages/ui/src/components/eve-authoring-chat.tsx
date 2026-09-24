import { fetchServerSentEvents, useChat, type UIMessage } from "@tanstack/ai-react";
import type { ChatClientOptions } from "@tanstack/ai-client";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthoringChat } from "./authoring-chat";

type Snapshot = { session?: { sessionId: string }; messages: UIMessage[]; initialResumeSnapshot?: ChatClientOptions["initialResumeSnapshot"] };

export function EveAuthoringChat({ sessionId, api, onSession }: {
  sessionId?: string;
  api(path: string): string;
  onSession(id: string): void;
}) {
  const current = useRef(sessionId);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string>();
  useEffect(() => {
    // Updating the URL for our newly created session must not restart its stream.
    if (snapshot && current.current === sessionId) return;
    current.current = sessionId;
    setSnapshot(null);
    setError(undefined);
    const controller = new AbortController();
    if (!sessionId) setSnapshot({ messages: [] });
    else void fetch(api(`/api/authoring/eve/sessions/${encodeURIComponent(sessionId)}`), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(await response.text());
        return response.json() as Promise<Snapshot>;
      }).then(value => { if (!controller.signal.aborted) setSnapshot(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(String(cause)); });
    return () => controller.abort();
  }, [sessionId, api]);
  if (!snapshot) return <AuthoringChat messages={[]} status="ready" busy={!error} value="" onValueChange={() => {}} onSend={() => {}} onAnswer={() => {}} error={error} />;
  return <EveConversation key={snapshot.session?.sessionId ?? "new"} snapshot={snapshot} api={api} onSession={id => {
    current.current = id;
    onSession(id);
  }} />;
}

function EveConversation({ snapshot, api, onSession }: { snapshot: Snapshot; api(path: string): string; onSession(id: string): void }) {
  const session = useRef(snapshot.session?.sessionId);
  const started = useRef(false);
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
  useEffect(() => {
    let disposed = false;
    // React may clean up and replay mount effects. Do not begin an irreversible
    // session creation until that effect cycle settles; no timer or retry.
    queueMicrotask(() => {
      if (disposed || snapshot.session || started.current) return;
      started.current = true;
      void send("Help me author this course.");
    });
    return () => { disposed = true; };
  }, []);
  function answer(answers: Record<string, AskUserAnswer>) {
    const entries = Object.values(answers).map(value => {
      const interrupt = chat.interrupts.find(item => item.id === value.questionId);
      if (interrupt?.kind !== "generic" || !interrupt.canResolve) throw new Error("This question is no longer available. Reload its session to recover the current state.");
      return { interrupt, payload: { ...(value.selectedIds[0] ? { optionId: value.selectedIds[0] } : {}), ...(value.otherText ? { text: value.otherText } : {}) } };
    });
    for (const { interrupt, payload } of entries) interrupt.resolveInterrupt(payload);
  }
  return <AuthoringChat messages={chat.messages} status={chat.status} busy={chat.resuming} value={value} onValueChange={setValue}
    onSend={message => { void send(message); }} onAnswer={answer} error={error ?? chat.interruptErrors[0]?.message}
    onRetryAnswer={chat.interruptErrors.some(item => item.retryable) ? () => {
      setError(undefined);
      chat.retryInterrupts();
    } : undefined} />;
}
