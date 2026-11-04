import { useEveAgent } from "@dojofoo/agent/react";
import { activeTurn, openInteractions } from "@dojofoo/agent/events";
import type { SendTurnOptions } from "@dojofoo/agent/client";
import type { Persona } from "@dojofoo/agent-api";
import { eveChatMessages } from "@dojofoo/authoring/eve/messages";
import { agentRow, isAgentId } from "@dojofoo/protocol";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { projectChatTimeline, type AnchoredChatEvent } from "@/lib/chat-timeline";
import type { CodeHighlight } from "@/lib/code-highlight";
import { AuthoringChat, type ChatFailureView } from "./authoring-chat";
import { chatApiError, chatFailure, classifyTurnFailure, type ChatFailure } from "@/lib/chat-failure";
import { chatMessageContent } from "@/lib/chat-files";
import { codingAgents } from "@/lib/coding-agents";
import { Button as UIXButton } from "@dojofoo/uix/components/button";
import { launchFetch } from "@/lib/launch-token";
import { AiBrain01Icon, AiMagicIcon } from "@dojofoo/uix/icons";
import type { ComposerAgent, ComposerModel } from "@dojofoo/uix/containers/assistant-home";

type Session = { id: string; agent: string; model?: string };
/** An open conversation; a read-only one (an ended Kyoshi pick, D32) takes no input */
type Opened = Session & { readOnly?: boolean };
type Agent = { id: string; selected: boolean };
/** What the page shows, as Eve's `clientContext` takes it */
type PageContext = Exclude<NonNullable<SendTurnOptions["clientContext"]>, string | readonly string[]>;
type Page<T> = { data: T[]; pagination: { hasMore: boolean } };
/** A Sensei page's key: the course, and the kata lesson from step 5 */
type ChatPage = { course: string; lesson?: string };
const agentApi = (workspaceId: string, path = "") => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}${path}`;

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await chatApiError(response);
  return response.json() as Promise<T>;
}

/** POST /sessions/default (D29): the page's default conversation, its replacement with `new` and `from`, or with `fresh` a new one that
 *  replaces nothing ("Continue in a new conversation", decision 21). A draft's page (Kyoshi) names no course. */
async function openDefault(workspaceId: string, page: ChatPage | undefined, options: { session?: string; from?: string; fresh?: boolean; signal?: AbortSignal } = {}) {
  const response = await launchFetch(agentApi(workspaceId, "/sessions/default"), {
    method: "POST", signal: options.signal, headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(page ? { course: page.course, ...(page.lesson ? { lesson: page.lesson } : {}) } : {}),
      ...(options.from ? { new: true, from: options.from } : options.fresh ? { new: true } : options.session ? { session: options.session } : {}) }),
  });
  if (!response.ok) throw await chatApiError(response);
  return response.json() as Promise<{ session: Session; rewrite: boolean; notice?: "picked-unavailable" }>;
}

/** The failure as the conversation shows it, with the agent's name and login command for its actions */
function failureView(failure: ChatFailure | undefined, agent?: string): ChatFailureView | undefined {
  if (failure?.kind === "switching") return { message: failure.message, actions: ["try-again"] };
  if (failure?.kind !== "alert") return undefined;
  const row = agent && isAgentId(agent) ? agentRow(agent) : undefined;
  return { ...failure, ...(row ? { agentName: row.name, ...(row.login ? { login: row.login } : {}) } : {}) };
}

/** The status line when a requested conversation can't continue (no alert: the default conversation is open) */
const cantContinue = (agent: string) => `That conversation can't be continued, so the newest one on ${isAgentId(agent) ? agentRow(agent).name : agent} opened instead.`;

/** Every persona uses the same conversation, uploads and session lifecycle, and gets its conversation from POST /sessions/default:
 *  a Sensei page passes `page`, a draft's page (Kyoshi) none. */
export function AgentChat({ workspaceId, persona, sessionId, readOnly = false, onSessionDropped, onOpened, onContinued, onSwitchRequest, embedded, clientContext, agents, onAgentChange, agentChanging, page, controls, hostEvents, fragments, onHighlight }: {
  embedded?: boolean;
  /** The workspace's agent menu (useWorkspaceAgent) */
  agents?: ComposerAgent[];
  onAgentChange?(id: string): void;
  agentChanging?: boolean;
  workspaceId: string;
  persona: Persona;
  /** The conversation to open, from `?session=` or a history pick; the page never writes the default conversation's id. `readOnly`
   *  mounts it without the default lookup (an ended Kyoshi pick) */
  sessionId?: string;
  readOnly?: boolean;
  /** The server did not honour `sessionId`, or a requested conversation failed on open: the page drops `?session=` (replace: true) */
  onSessionDropped?(): void;
  /** The conversation that is open now, for the history menu's mark */
  onOpened?(session: { id: string; agent: string; readOnly: boolean }): void;
  /** "Continue in a new conversation" opened `id`: the page leaves read-only */
  onContinued?(id: string): void;
  /** A picked conversation's agent stopped being selected (409 agent_unavailable): the page asks to switch back (D33) */
  onSwitchRequest?(agentId: string): void;
  /** What the page shows, for every turn: the agent sees it, the conversation doesn't keep it */
  clientContext?: PageContext;
  page?: ChatPage;
  /** Lets the page send a message through the chat (Ask Sensei) */
  controls?: MutableRefObject<{ send(text: string): void } | null>;
  /** Cards the page owns (a kata lesson's check results), placed after the message that was last when each first appeared */
  hostEvents?: AnchoredChatEvent[];
  /** The lesson's authored fragments, for Sensei's dojo_ui_show */
  fragments?: Record<string, string>;
  onHighlight?(highlight: CodeHighlight): void;
}) {
  const current = useRef(sessionId);
  const [session, setSession] = useState<Opened | null>(null);
  /** Each open mounts the conversation afresh, even when the default is the conversation that just failed */
  const [opening, setOpening] = useState(0);
  const [error, setError] = useState<unknown>();
  const [selectedAgent, setSelectedAgent] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<string>();
  const placeholder = persona === "kyoshi" ? "Shape this lesson with Kyoshi…" : "Ask your Sensei…";
  const context: PageContext = { ...clientContext, workspaceId };
  const pageKey = page ? `${page.course}\0${page.lesson ?? ""}` : "";
  /** What the page asked for last; a different request starts with an empty composer */
  const loadKey = `${workspaceId}\0${persona}\0${pageKey}\0${sessionId ?? ""}\0${readOnly}`;
  const requested = useRef({ key: loadKey, session: sessionId });
  /** The requested conversation the server honoured, while the page still asks for it */
  const picked = useRef<string | undefined>(undefined);
  /** The conversation that opened when the page's requested one was dropped */
  const dropped = useRef<string | undefined>(undefined);
  const open = (selected: Opened) => {
    // Bookmark acceptance before reading history so retries reuse this session.
    current.current = selected.id;
    setSession(selected);
    setOpening(count => count + 1);
    onOpened?.({ id: selected.id, agent: selected.agent, readOnly: Boolean(selected.readOnly) });
  };
  /** The requested conversation was not honoured or can't continue: `selected` is open instead, and the page drops `?session=` */
  const drop = (selected: Session, notify: boolean) => {
    dropped.current = selected.id;
    if (notify) setNotice(cantContinue(selected.agent));
    onSessionDropped?.();
  };
  useEffect(() => {
    const previous = requested.current;
    requested.current = { key: loadKey, session: sessionId };
    // The page dropped the session it asked for and the conversation that opened instead is open: nothing loads again (decision 16)
    if (session && sessionId === undefined && previous.session !== undefined && dropped.current === session.id) return;
    if (session && current.current === sessionId && Boolean(session.readOnly) === readOnly) return;
    if (previous.key !== loadKey) { setValue(""); setFiles([]); setNotice(undefined); }
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
        if (!controller.signal.aborted) setSelectedAgent(agent);
        // A read-only pick is read as it is: an ended stream stays readable (D32)
        if (readOnly && sessionId) {
          const saved = await json<Session>(agentApi(workspaceId, `/sessions/${encodeURIComponent(sessionId)}`), { signal: controller.signal });
          if (controller.signal.aborted) return;
          picked.current = undefined;
          open({ ...saved, readOnly: true });
          return;
        }
        const opened = await openDefault(workspaceId, page, { session: sessionId, signal: controller.signal });
        if (controller.signal.aborted) return;
        picked.current = sessionId !== undefined && !opened.rewrite ? opened.session.id : undefined;
        open(opened.session);
        if (sessionId !== undefined && opened.rewrite) drop(opened.session, opened.notice === "picked-unavailable");
      })().catch(cause => { if (!controller.signal.aborted) setError(cause); });
    });
    return () => controller.abort();
  }, [sessionId, readOnly, workspaceId, persona, pageKey, loadAttempt]);
  const status = notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : undefined;
  const loadFailure = error === undefined ? undefined : chatFailure(error, { operation: "load", agentName: selectedAgent });
  // A switch in progress (409 agent_switching): load again once a second; after 30 seconds the failure offers Try again
  const switchingSince = useRef<number | undefined>(undefined);
  const switching = loadFailure?.kind === "switching";
  if (!switching) switchingSince.current = undefined;
  else switchingSince.current ??= Date.now();
  const switchingRetry = switching && Date.now() - switchingSince.current! < 30_000;
  useEffect(() => {
    if (!switchingRetry) return;
    const timer = setTimeout(() => setLoadAttempt(attempt => attempt + 1), 1_000);
    return () => clearTimeout(timer);
  }, [switchingRetry, error]);
  if (!session) return <AuthoringChat embedded={embedded} placeholder={placeholder} messages={[]} status="ready" busy={error === undefined} inputDisabled
    value={value} onValueChange={setValue} files={files} onFilesChange={setFiles} onSend={() => {}} onAnswer={() => {}}
    // A load that can only start over shows "Try again"
    error={loadFailure && (switchingRetry && loadFailure.kind === "switching" ? { message: loadFailure.message, actions: [] } : failureView(loadFailure, selectedAgent)
      ?? { message: error instanceof Error ? error.message : String(error), actions: ["try-again"] })}
    agents={agents} onAgentChange={onAgentChange} agentChanging={agentChanging} notice={status}
    onRetryLoad={error !== undefined ? () => setLoadAttempt(attempt => attempt + 1) : undefined} />;
  return <AgentConversation key={`${session.id}:${opening}`} embedded={embedded} workspaceId={workspaceId} session={session} placeholder={placeholder}
    hostEvents={hostEvents} fragments={fragments} onHighlight={onHighlight} notice={status}
    clientContext={context} agents={agents} onAgentChange={onAgentChange} agentChanging={agentChanging} sensei={persona === "sensei"} controls={controls}
    value={value} onValueChange={setValue} files={files} onFilesChange={setFiles}
    picked={picked.current === session.id} onSwitchRequest={onSwitchRequest}
    onContinue={() => {
      void openDefault(workspaceId, page, { fresh: true }).then(opened => {
        // The page leaves read-only for the conversation open now: nothing loads again
        dropped.current = opened.session.id;
        open(opened.session);
        onContinued?.(opened.session.id);
      }).catch(cause => { setSession(null); setError(cause); });
    }}
    onLeaveReadOnly={() => onSessionDropped?.()}
    onReload={() => { setSession(null); setLoadAttempt(attempt => attempt + 1); }}
    onEnded={() => {
      // A requested conversation that can't continue: the page's newest usable one opens, not a replacement of it (decision 18)
      const requestedOne = picked.current === session.id;
      picked.current = undefined;
      void openDefault(workspaceId, page, requestedOne ? {} : { from: session.id }).then(opened => {
        open(opened.session);
        if (requestedOne) drop(opened.session, true);
      }).catch(cause => { setSession(null); setError(cause); });
    }} />;
}

/** The session is Eve's: its own client resumes it, streams it, and takes messages and answers. */
function AgentConversation({ workspaceId, session, onReload, onEnded, embedded, value, onValueChange, files, onFilesChange, placeholder, clientContext, agents, onAgentChange, agentChanging, sensei, controls, hostEvents, fragments, onHighlight, notice, picked, onSwitchRequest, onContinue, onLeaveReadOnly }: {
  embedded?: boolean; workspaceId: string; session: Opened;
  /** The page asked for this conversation and the server honoured it (a history pick) */
  picked: boolean;
  onSwitchRequest?(agentId: string): void;
  /** Read-only: "Continue in a new conversation" */
  onContinue(): void;
  /** Read-only, once its stream is gone (410): "Open the current conversation" */
  onLeaveReadOnly(): void;
  /** A status line above the composer */
  notice?: ReactNode;
  /** Read the conversation again: the page asks for its default conversation */
  onReload(): void;
  agents?: ComposerAgent[]; onAgentChange?(id: string): void; agentChanging?: boolean;
  /** Eve can't continue this session: an older Eve built it, it ended, or its coding agent isn't selected */
  onEnded(): void;
  value: string; onValueChange(value: string): void; files: File[]; onFilesChange(files: File[]): void;
  placeholder: string;
  clientContext: PageContext;
  /** Sensei's page: the model menu */
  sensei: boolean;
  controls?: MutableRefObject<{ send(text: string): void } | null>;
  hostEvents?: AnchoredChatEvent[];
  fragments?: Record<string, string>;
  onHighlight?(highlight: CodeHighlight): void;
}) {
  const context = useRef(clientContext);
  context.current = clientContext;
  const agent = useEveAgent({
    baseUrl: agentApi(workspaceId, `/sessions/${encodeURIComponent(session.id)}`),
    initialSession: { sessionId: session.id, streamIndex: 0 },
    resume: true,
    prepareSend: input => ({ ...input, clientContext: context.current }),
  });
  const [failure, setFailure] = useState<{ error: unknown; operation: "send" | "cancel" | "answer"; file?: string }>();
  const [model, setModel] = useState(session.model);
  const [models, setModels] = useState<ComposerModel[]>([]);
  const [modelChanging, setModelChanging] = useState(false);
  const transcript = useMemo(() => eveChatMessages(agent.messages), [agent.messages]);
  // A host card stays where it first appeared, after the message that was last then
  const anchors = useRef(new Map<string, string | null>());
  for (const event of hostEvents ?? []) {
    if (!anchors.current.has(event.message.id)) anchors.current.set(event.message.id, event.afterMessageId ?? transcript.at(-1)?.id ?? null);
  }
  const messages = useMemo(() => hostEvents?.length
    ? projectChatTimeline(transcript, hostEvents.map(event => ({ ...event, afterMessageId: anchors.current.get(event.message.id) ?? null })))
    : transcript, [transcript, hostEvents]);
  // Sensei's composer offers the coding agent's models; a change applies from the next turn
  useEffect(() => {
    if (!sensei) return;
    const controller = new AbortController();
    void json<Page<{ id: string; name: string }>>(agentApi(workspaceId, `/agents/${encodeURIComponent(session.agent)}/models?per_page=500`), { signal: controller.signal })
      .then(page => setModels(page.data.map(choice => ({ value: choice.id, name: choice.name, description: "", icon: AiMagicIcon }))), () => {});
    return () => controller.abort();
  }, [sensei, workspaceId, session.agent]);
  async function changeModel(next: string) {
    if (next === model) return;
    setModelChanging(true);
    setFailure(undefined);
    try {
      const saved = await json<Session>(agentApi(workspaceId, `/sessions/${encodeURIComponent(session.id)}`), {
        method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: next }),
      });
      setModel(saved.model);
    } catch (cause) { setFailure({ error: cause, operation: "send" }); }
    finally { setModelChanging(false); }
  }
  async function send(message: string, selected: File[]) {
    if (!message.trim() && !selected.length) return;
    setFailure(undefined);
    // Eve shows the message at once and marks it failed if it isn't accepted; the composer needn't wait
    void agent.send(await chatMessageContent(message, selected))
      .catch(cause => setFailure({ error: cause, operation: "send", file: selected[0]?.name }));
  }
  if (controls) controls.current = { send: text => { void send(text, []); } };
  async function answer(answers: Record<string, AskUserAnswer>) {
    setFailure(undefined);
    try {
      await agent.respond(Object.values(answers).map(item => ({
        interactionId: item.questionId,
        ...(item.selectedIds[0] ? { optionId: item.selectedIds[0] } : {}),
        ...(item.otherText ? { text: item.otherText } : {}),
      })));
    } catch (cause) { setFailure({ error: cause, operation: "answer" }); }
  }
  const selectedAgent = codingAgents.find(choice => choice.value === session.agent)
    ?? { value: session.agent, name: session.agent, icon: AiBrain01Icon };
  // Native crashes in a row: the second also offers another agent
  const crashes = useRef(0);
  const counted = useRef<unknown>(undefined);
  if (agent.error && counted.current !== agent.error) {
    counted.current = agent.error;
    crashes.current = classifyTurnFailure({ code: agent.error.name, message: agent.error.message }) === "native-crash" ? crashes.current + 1 : 0;
  }
  const shown = failure ? chatFailure(failure.error, { operation: failure.operation, file: failure.file, agentName: session.agent, crashes: crashes.current, picked })
    : agent.error ? chatFailure(agent.error, { operation: "send", agentName: session.agent, crashes: crashes.current, picked }) : undefined;
  const readOnly = Boolean(session.readOnly);
  // A conversation Eve can't continue is replaced; a missing one, or one whose agent is no longer selected, opens the default again;
  // a picked one whose agent another tab switched away asks to switch back. A read-only conversation only reads.
  const recovery = !shown || readOnly ? undefined : shown.kind === "replace" ? "ended" : shown.kind === "confirm-switch" ? (onSwitchRequest ? "switch" : "reload")
    : shown.kind === "default-open" ? "reload" : undefined;
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !recovery) return;
    handled.current = true;
    if (recovery === "ended") onEnded();
    else if (recovery === "switch") onSwitchRequest?.(session.agent);
    else onReload();
  }, [recovery]);
  // A read-only conversation ended in Eve; once its stream is gone (410 session_expired) it can't be read either (D33)
  const errorCode = (agent.error as { code?: unknown } | undefined)?.code;
  const expired = readOnly && (errorCode === "session_expired" || (agent.error as { status?: unknown } | undefined)?.status === 410);
  const readOnlyNotice = !readOnly ? null : <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
    <span>{expired ? "This conversation is no longer available." : "This conversation has ended."}</span>
    {expired ? <UIXButton size="sm" variant="secondary" onClick={onLeaveReadOnly}>Open the current conversation</UIXButton>
      : <UIXButton size="sm" variant="secondary" onClick={onContinue}>Continue in a new conversation</UIXButton>}
  </div>;
  // A turn that is working or waiting on the learner keeps its model (D26)
  const turnOpen = activeTurn(agent.view) !== undefined;
  // A typed message answers the first open question (Eve docs tools/human-in-the-loop.md), which the hint says (decision 15)
  const hint = sensei && openInteractions(agent.view).length > 0 ? "Answer Sensei's question above, or type your answer" : placeholder;
  return <AuthoringChat embedded={embedded} agent={selectedAgent} agents={agents} onAgentChange={onAgentChange} agentChanging={agentChanging} placeholder={hint} messages={messages}
    readOnly={readOnly}
    fragments={fragments} onHighlight={onHighlight}
    status={agent.status === "busy" ? "streaming" : "ready"} busy={agent.status === "resuming"}
    // Eve takes no input until the session has caught up
    inputDisabled={agent.status === "resuming"}
    {...(sensei ? { model, models, modelChanging: modelChanging || turnOpen, onModelChange: (next: string) => { void changeModel(next); } } : {})}
    value={value} onValueChange={onValueChange} attachments files={files} onFilesChange={onFilesChange}
    onSend={send} onStop={() => { setFailure(undefined); void agent.cancel().catch(cause => setFailure({ error: cause, operation: "cancel" })); }} onAnswer={answer}
    error={failureView(shown, session.agent)} notice={readOnlyNotice ? <>{notice}{readOnlyNotice}</> : notice}
    onRetryLoad={shown?.kind === "alert" ? () => { setFailure(undefined); onReload(); } : undefined} />;
}
