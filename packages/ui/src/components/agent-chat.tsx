import { useEveAgent } from "@dojofoo/agent/react";
import { activeTurn, openInteractions } from "@dojofoo/agent/events";
import type { SendTurnOptions } from "@dojofoo/agent/client";
import type { Persona } from "@dojofoo/agent-api";
import { KYOSHI_START } from "@dojofoo/authoring/eve/bootstrap";
import { eveChatMessages } from "@dojofoo/authoring/eve/messages";
import { agentRow, isAgentId } from "@dojofoo/protocol";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { projectChatTimeline, type AnchoredChatEvent } from "@/lib/chat-timeline";
import type { CodeHighlight } from "@/lib/code-highlight";
import { AuthoringChat, type ChatFailureView } from "./authoring-chat";
import { chatApiError, chatFailure, classifyTurnFailure, type ChatFailure } from "@/lib/chat-failure";
import { chatMessageContent } from "@/lib/chat-files";
import { codingAgents } from "@/lib/coding-agents";
import { launchFetch } from "@/lib/launch-token";
import { AiBrain01Icon, AiMagicIcon } from "@dojofoo/uix/icons";
import type { ComposerAgent, ComposerModel } from "@dojofoo/uix/containers/assistant-home";

type Session = { id: string; agent: string; model?: string };
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

/** POST /sessions/default (D29): the page's default conversation, or its replacement with `new` and `from` */
async function openDefault(workspaceId: string, page: ChatPage, options: { session?: string; from?: string; signal?: AbortSignal } = {}) {
  const response = await launchFetch(agentApi(workspaceId, "/sessions/default"), {
    method: "POST", signal: options.signal, headers: { "content-type": "application/json" },
    body: JSON.stringify({ course: page.course, ...(page.lesson ? { lesson: page.lesson } : {}),
      ...(options.from ? { new: true, from: options.from } : options.session ? { session: options.session } : {}) }),
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

/** Every persona uses the same conversation, uploads and session lifecycle. A Sensei page passes `page`, and its
 *  conversation comes from POST /sessions/default; Kyoshi keeps its own lookup until step 6. */
export function AgentChat({ workspaceId, persona, sessionId, onSession, embedded, clientContext, agents, onAgentChange, agentChanging, page, controls, hostEvents, fragments, onHighlight }: {
  embedded?: boolean;
  /** The workspace's agent menu (useWorkspaceAgent) */
  agents?: ComposerAgent[];
  onAgentChange?(id: string): void;
  agentChanging?: boolean;
  workspaceId: string;
  persona: Persona;
  sessionId?: string;
  /** Called with a session the page should put in its URL */
  onSession?(id: string): void;
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
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<unknown>();
  const [selectedAgent, setSelectedAgent] = useState<string>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const placeholder = persona === "kyoshi" ? "Shape this lesson with Kyoshi…" : "Ask your Sensei…";
  const context: PageContext = { ...clientContext, workspaceId };
  const pageKey = page ? `${page.course}\0${page.lesson ?? ""}` : "";
  const create = (signal: AbortSignal) => json<Session>(agentApi(workspaceId, "/sessions"), {
    // Kyoshi is the only caller of POST /sessions until step 6; its hidden first turn starts the conversation
    method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ message: KYOSHI_START, clientContext: context }),
  });
  /** Open a conversation, as the URL's or the newest on the selected agent, or a new one */
  const open = (selected: Session, rewrite = true) => {
    // Bookmark acceptance before reading history so retries reuse this session.
    current.current = selected.id;
    setSession(selected);
    if (rewrite) onSession?.(selected.id);
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
        if (!controller.signal.aborted) setSelectedAgent(agent);
        if (page) {
          const opened = await openDefault(workspaceId, page, { session: sessionId, signal: controller.signal });
          if (!controller.signal.aborted) open(opened.session, opened.rewrite);
          return;
        }
        if (sessionId) {
          const response = await fetch(agentApi(workspaceId, `/sessions/${encodeURIComponent(sessionId)}`), { signal: controller.signal });
          // One that no longer exists, or that runs on another agent, can't continue here:
          // open the selected agent's conversation instead
          if (response.status !== 404) {
            if (!response.ok) throw await chatApiError(response);
            const saved = await response.json() as Session;
            if (controller.signal.aborted) return;
            if (saved.agent === agent) { setSession(saved); return; }
          }
        }
        const existing = await json<Page<Session>>(agentApi(workspaceId, `/sessions?persona=${persona}&agent=${encodeURIComponent(agent)}&per_page=1`), { signal: controller.signal });
        if (controller.signal.aborted) return;
        const selected = existing.data[0] ?? await create(controller.signal);
        if (!controller.signal.aborted) open(selected);
      })().catch(cause => { if (!controller.signal.aborted) setError(cause); });
    });
    return () => controller.abort();
  }, [sessionId, workspaceId, persona, pageKey, loadAttempt]);
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
    agents={agents} onAgentChange={onAgentChange} agentChanging={agentChanging}
    onRetryLoad={error !== undefined ? () => setLoadAttempt(attempt => attempt + 1) : undefined} />;
  return <AgentConversation key={session.id} embedded={embedded} workspaceId={workspaceId} session={session} placeholder={placeholder}
    hostEvents={hostEvents} fragments={fragments} onHighlight={onHighlight}
    clientContext={context} agents={agents} onAgentChange={onAgentChange} agentChanging={agentChanging} sensei={Boolean(page)} controls={controls}
    value={value} onValueChange={setValue} files={files} onFilesChange={setFiles}
    onReload={() => { setSession(null); setLoadAttempt(attempt => attempt + 1); }}
    onEnded={() => {
      const replace = page ? openDefault(workspaceId, page, { from: session.id }).then(opened => open(opened.session, true))
        : create(new AbortController().signal).then(selected => open(selected));
      void replace.catch(cause => { setSession(null); setError(cause); });
    }} />;
}

/** The session is Eve's: its own client resumes it, streams it, and takes messages and answers. */
function AgentConversation({ workspaceId, session, onReload, onEnded, embedded, value, onValueChange, files, onFilesChange, placeholder, clientContext, agents, onAgentChange, agentChanging, sensei, controls, hostEvents, fragments, onHighlight }: {
  embedded?: boolean; workspaceId: string; session: Session;
  /** Read the conversation again: Sensei's page asks for its default conversation */
  onReload(): void;
  agents?: ComposerAgent[]; onAgentChange?(id: string): void; agentChanging?: boolean;
  /** Eve can't continue this session: an older Eve built it, it ended, or its coding agent isn't selected */
  onEnded(): void;
  value: string; onValueChange(value: string): void; files: File[]; onFilesChange(files: File[]): void;
  placeholder: string;
  clientContext: PageContext;
  /** Sensei's page: the model menu, and replacement through the default route */
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
  const shown = failure ? chatFailure(failure.error, { operation: failure.operation, file: failure.file, agentName: session.agent, crashes: crashes.current })
    : agent.error ? chatFailure(agent.error, { operation: "send", agentName: session.agent, crashes: crashes.current }) : undefined;
  const code = (failure?.error ?? agent.error) as { code?: unknown } | undefined;
  // Kyoshi keeps today's recovery: a session it can't continue (or an agent no longer selected) starts another; a missing one reloads
  const recovery = !shown ? undefined : shown.kind === "replace" ? "ended"
    : shown.kind === "default-open" ? (sensei ? "reload" : code?.code === "agent_unavailable" ? "ended" : "reload") : undefined;
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !recovery) return;
    handled.current = true;
    if (recovery === "ended") onEnded();
    else onReload();
  }, [recovery]);
  // A turn that is working or waiting on the learner keeps its model (D26)
  const turnOpen = activeTurn(agent.view) !== undefined;
  // A typed message answers the first open question (Eve docs tools/human-in-the-loop.md), which the hint says (decision 15)
  const hint = sensei && openInteractions(agent.view).length > 0 ? "Answer Sensei's question above, or type your answer" : placeholder;
  return <AuthoringChat embedded={embedded} agent={selectedAgent} agents={agents} onAgentChange={onAgentChange} agentChanging={agentChanging} placeholder={hint} messages={messages}
    fragments={fragments} onHighlight={onHighlight}
    status={agent.status === "busy" ? "streaming" : "ready"} busy={agent.status === "resuming"}
    // Eve takes no input until the session has caught up
    inputDisabled={agent.status === "resuming"}
    {...(sensei ? { model, models, modelChanging: modelChanging || turnOpen, onModelChange: (next: string) => { void changeModel(next); } } : {})}
    value={value} onValueChange={onValueChange} attachments files={files} onFilesChange={onFilesChange}
    onSend={send} onStop={() => { setFailure(undefined); void agent.cancel().catch(cause => setFailure({ error: cause, operation: "cancel" })); }} onAnswer={answer}
    error={failureView(shown, session.agent)}
    onRetryLoad={shown?.kind === "alert" ? () => { setFailure(undefined); onReload(); } : undefined} />;
}
