import { useEveAgent } from "@dojofoo/agent/react";
import { ClientError, SessionNotActiveError, type SendTurnOptions } from "@dojofoo/agent/client";
import type { Persona } from "@dojofoo/agent-api";
import { eveChatMessages } from "@dojofoo/authoring/eve/messages";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthoringChat } from "./authoring-chat";
import { httpError } from "@/lib/http-error";
import { chatMessageContent } from "@/lib/chat-files";
import { codingAgents } from "@/lib/coding-agents";
import { AiBrain01Icon } from "@dojofoo/uix/icons";

type Session = { id: string; agent: string };
type Agent = { id: string; selected: boolean };
/** What the page shows, as Eve's `clientContext` takes it */
type PageContext = Exclude<NonNullable<SendTurnOptions["clientContext"]>, string | readonly string[]>;
type Page<T> = { data: T[]; pagination: { hasMore: boolean } };
const agentApi = (workspaceId: string, path = "") => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}${path}`;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await httpError(response);
  return response.json() as Promise<T>;
}

/** Every persona uses the same conversation, uploads and session lifecycle. */
export function AgentChat({ workspaceId, persona, sessionId, onSession, embedded, clientContext }: {
  embedded?: boolean;
  workspaceId: string;
  persona: Persona;
  sessionId?: string;
  onSession(id: string): void;
  /** What the page shows, for every turn: the agent sees it, the conversation doesn't keep it */
  clientContext?: PageContext;
}) {
  const current = useRef(sessionId);
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const placeholder = persona === "kyoshi" ? "Shape this lesson with Kyoshi…" : "Ask your Sensei…";
  const context: PageContext = { ...clientContext, workspaceId };
  const create = (signal: AbortSignal) => json<Session>(agentApi(workspaceId, "/sessions"), {
    method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ persona, clientContext: context }),
  });
  /** Open a conversation, as the URL's or the newest on the selected agent, or a new one */
  const open = (selected: Session) => {
    // Bookmark acceptance before reading history so retries reuse this session.
    current.current = selected.id;
    setSession(selected);
    onSession(selected.id);
  };
  useEffect(() => {
    if (session && current.current === sessionId) return;
    if (current.current !== sessionId) { setValue(""); setFiles([]); }
    current.current = sessionId;
    setSession(null);
    setError(undefined);
    const controller = new AbortController();
    // React's mount replay must settle before creating a durable conversation.
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void (async () => {
        // A session runs on the coding agent it started with
        const agents = await json<Page<Agent>>(agentApi(workspaceId, "/agents"), { signal: controller.signal });
        const agent = agents.data.find(item => item.selected)?.id ?? "";
        if (sessionId) {
          const saved = await json<Session>(agentApi(workspaceId, `/sessions/${encodeURIComponent(sessionId)}`), { signal: controller.signal });
          if (controller.signal.aborted) return;
          if (saved.agent === agent) { setSession(saved); return; }
          // One on another agent can't continue here: open the selected agent's conversation instead
        }
        const existing = await json<Page<Session>>(agentApi(workspaceId, `/sessions?persona=${persona}&agent=${encodeURIComponent(agent)}&per_page=1`), { signal: controller.signal });
        if (controller.signal.aborted) return;
        const selected = existing.data[0] ?? await create(controller.signal);
        if (!controller.signal.aborted) open(selected);
      })().catch(cause => { if (!controller.signal.aborted) setError(String(cause)); });
    });
    return () => controller.abort();
  }, [sessionId, workspaceId, persona, loadAttempt]);
  if (!session) return <AuthoringChat embedded={embedded} placeholder={placeholder} messages={[]} status="ready" busy={!error} inputDisabled
    value={value} onValueChange={setValue} files={files} onFilesChange={setFiles} onSend={() => {}} onAnswer={() => {}} error={error}
    onRetryLoad={error ? () => setLoadAttempt(attempt => attempt + 1) : undefined} />;
  return <AgentConversation key={session.id} embedded={embedded} workspaceId={workspaceId} session={session} placeholder={placeholder}
    clientContext={context}
    value={value} onValueChange={setValue} files={files} onFilesChange={setFiles}
    onReload={() => { setSession(null); setLoadAttempt(attempt => attempt + 1); }}
    onEnded={() => { void create(new AbortController().signal).then(open, cause => setError(String(cause))); }} />;
}

/** The session is Eve's: its own client resumes it, streams it, and takes messages and answers. */
function AgentConversation({ workspaceId, session, onReload, onEnded, embedded, value, onValueChange, files, onFilesChange, placeholder, clientContext }: {
  embedded?: boolean; workspaceId: string; session: Session; onReload(): void;
  /** Eve can't continue this session: an older Eve built it, it ended, or its coding agent isn't selected */
  onEnded(): void;
  value: string; onValueChange(value: string): void; files: File[]; onFilesChange(files: File[]): void;
  placeholder: string;
  clientContext: PageContext;
}) {
  const context = useRef(clientContext);
  context.current = clientContext;
  const agent = useEveAgent({
    baseUrl: agentApi(workspaceId, `/sessions/${encodeURIComponent(session.id)}`),
    initialSession: { sessionId: session.id, streamIndex: 0 },
    resume: true,
    prepareSend: input => ({ ...input, clientContext: context.current }),
  });
  const [error, setError] = useState<string>();
  const messages = useMemo(() => eveChatMessages(agent.messages), [agent.messages]);
  async function send(message: string, selected: File[]) {
    if (!message.trim() && !selected.length) return;
    setError(undefined);
    // Eve shows the message at once and marks it failed if it isn't accepted; the composer needn't wait
    void agent.send(await chatMessageContent(message, selected))
      .catch(cause => setError(cause instanceof Error ? cause.message : String(cause)));
  }
  async function answer(answers: Record<string, AskUserAnswer>) {
    setError(undefined);
    try {
      await agent.respond(Object.values(answers).map(item => ({
        interactionId: item.questionId,
        ...(item.selectedIds[0] ? { optionId: item.selectedIds[0] } : {}),
        ...(item.otherText ? { text: item.otherText } : {}),
      })));
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
  }
  const selectedAgent = codingAgents.find(choice => choice.value === session.agent)
    ?? { value: session.agent, name: session.agent, icon: AiBrain01Icon };
  const ended = (SessionNotActiveError.is(agent.error) && !agent.error.retryable)
    || (ClientError.is(agent.error) && agent.error.status === 409
      && ["session_stranded", "session_expired", "session_version_unsupported", "agent_unavailable"].includes(agent.error.code));
  const replaced = useRef(false);
  useEffect(() => {
    if (!ended || replaced.current) return;
    replaced.current = true;
    onEnded();
  }, [ended]);
  const failure = error ?? agent.error?.message;
  return <AuthoringChat embedded={embedded} agent={selectedAgent} placeholder={placeholder} messages={messages}
    status={agent.status === "busy" ? "streaming" : "ready"} busy={agent.status === "resuming"}
    // Eve takes no input until the session has caught up
    inputDisabled={agent.status === "resuming"}
    value={value} onValueChange={onValueChange} attachments files={files} onFilesChange={onFilesChange}
    onSend={send} onStop={() => { setError(undefined); void agent.cancel().catch(cause => setError(String(cause))); }} onAnswer={answer} error={failure}
    onRetryLoad={failure ? onReload : undefined} />;
}
