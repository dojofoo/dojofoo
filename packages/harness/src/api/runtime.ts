import { isTaggedTurn, type ModelChoice, type Persona } from "@dojofoo/protocol";

/** Who the conversation is with: the same chat, with that persona's prompts and tools. */
export { personas, type Persona } from "@dojofoo/protocol";

export type AgentStatus = "stopped" | "starting" | "migrating" | "ready" | "failed";

/** A coding agent (Codex, OpenCode, Pi, …) as one workspace can run it. */
export interface Agent {
  /** Coding agent id, e.g. `codex` */
  id: string;
  name: string;
  /** The workspace's selected coding agent; only this one can be started today */
  selected: boolean;
  status: AgentStatus;
  /** Why the last start failed */
  message?: string;
}

export type { ModelChoice } from "@dojofoo/protocol";

export type LifecycleStatus = "idle" | "working" | "paused" | "interrupted";
export interface SessionLifecycle {
  status: LifecycleStatus;
  /** The turn the last turn.paused named; cleared at turn.settled */
  turnId?: string;
  /** Set while the begin turn has not settled; resent on the next open (D29). `attempt` names the key `begin:<id>:<attempt>`;
   *  `cancelledAt` is set when a leave cancelled the begin, so the next open resends with attempt + 1. A step-4 record reads as attempt 0.
   *  `deliveryId` is Eve's receipt for the key (a repeat gets the same one), by which the next open finds how the begin ended. */
  beginPending?: { idempotencyKey: string; sentAt: string; attempt?: number; cancelledAt?: string; deliveryId?: string };
  /** The harness reported a failed resume (resume.failed); the record is unusable once that turn settles */
  resumeFailedAt?: string;
  /** D16: the latest check report waiting for this session to become idle */
  heldReport?: { observationId: string; text: string; heldAt: string };
  /** The last report sent, until Sensei has seen it (delivery.consumed or a context read) */
  sentReport?: { observationId: string; deliveryId?: string; sentAt: string; seenAt?: string };
  /** An agent switch timed out on this session's turn (CUJ 3); the next delivery clears `interruptedAt`, never `interruptedTurnId` */
  interruptedAt?: string;
  /** The turn that was open when the switch timed out; no host may run a model call for it again */
  interruptedTurnId?: string;
  updatedAt: string;
}

/** What the API remembers about a session; Eve keeps its history and state. */
export interface SessionRecord {
  id: string;
  /** Coding agent id */
  agent: string;
  persona: Persona;
  createdAt: string;
  courseId?: string;
  lessonId?: string;
  model?: string;
  /** The model's effort (a level the agent lists for it); the model's own default when absent */
  effort?: string;
  /** Raised by every model or effort change; a missing value reads as 0 */
  revision: number;
  endedAt?: string;
  replacedBy?: string;
  /** The opening of the first untagged learner or author message, written once by the pre-delivery hook ({@link firstMessageOf}) */
  firstMessage?: string;
  /** Set with `endedAt` when opening found the conversation stranded or its data gone (404, 410, 409 session_stranded); never for a
   *  conversation that ended in Eve. The history menu shows it as "no longer available". */
  unavailable?: true;
  lifecycle?: SessionLifecycle;
}

/** A record's `firstMessage`: whitespace collapsed, at most 80 characters including a trailing "…", cut at the last space before the
 *  limit when longer; undefined for a hidden tagged turn or empty text. */
export function firstMessageOf(text: string): string | undefined {
  const collapsed = text.replace(/\s+/gu, " ").trim();
  if (!collapsed || isTaggedTurn(collapsed)) return undefined;
  if (collapsed.length <= 80) return collapsed;
  const cut = collapsed.slice(0, 79);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** At least one of the two; `effort: null` clears the effort, so the model runs at its default */
export interface SessionPatch { model?: string; effort?: string | null }

export interface DefaultSessionRequest {
  /** Sensei pages only; a draft's page key is (draft, Kyoshi). A draft request with course or lesson, or a Sensei request without
   *  course, is 400 invalid_request. */
  course?: string;
  /** Kata lessons only (step 5); an interactive course has no lesson */
  lesson?: string;
  /** From the URL or a history pick: honoured only if it belongs to the page key, the workspace and the selected agent, and is usable */
  session?: string;
  /** Skip the lookup and create a new conversation */
  new?: true;
  /** With `new`: the session this one replaces. `replacedBy` is recorded on it, the new one is seeded from learner evidence (Sensei),
   *  and a second request with the same `from` returns the same replacement instead of making another (D28). */
  from?: string;
}
export interface DefaultSessionResponse {
  session: SessionRecord;
  /** The browser must put this session in the URL (or drop the one it sent) */
  rewrite: boolean;
  /** "picked-unavailable": the requested session could not be continued and the default opened instead */
  notice?: "picked-unavailable";
}

/** A request that starts or continues a turn: a message, or answers to a pending question. */
export type EveDelivery = { kind: "message"; text: string; idempotencyKey?: string } | { kind: "answer"; idempotencyKey?: string };

/** Where an Eve host serves its routes (`/eve/v1/*`), and the credentials it takes. */
export interface AgentEndpoint {
  baseUrl: string;
  headers?: Record<string, string>;
}

/**
 * Where agents run. `dojofoo ui` implements it with local Eve processes; a hosted
 * server implements the same contract with cloud sandboxes. Errors meant for the
 * client are thrown as {@link AgentApiError}.
 */
export interface AgentRuntime {
  /** Fails with `workspace_not_found` for an unknown workspace */
  agents(workspaceId: string): Promise<Agent[]>;
  /** Starts (or keeps) the coding agent without waiting for it to be ready. While an agent switch holds the workspace's lock, this and
   *  `connect`, `openDefault` and `deliveries.before` wait at most the switch's bound, then fail with 409 agent_switching. */
  start(workspaceId: string, agentId: string): Promise<Agent>;
  stop(workspaceId: string, agentId: string): Promise<Agent>;
  /** Saves the workspace's coding agent after cancelling the old agent's turns and stopping its host. A turn that does not settle
   *  within the bound is marked `interrupted`; a host refuses its model calls with the host-port code turn_interrupted.
   *  404 workspace_not_found | agent_not_found; 409 agent_not_offered. Selecting the current agent changes nothing. */
  select(workspaceId: string, agentId: string): Promise<Agent>;
  /** The Eve host serving this persona on this coding agent; starts it when needed */
  connect(workspaceId: string, target: { agent: string; persona: Persona }): Promise<AgentEndpoint>;
  /** From the workspace's kind: a draft runs Kyoshi; a learner workspace or an evaluation trial runs Sensei. */
  persona(workspaceId: string): Promise<Persona>;
  /** The coding agent's models (D7). 404 agent_not_found; 502 models_unavailable. */
  models(workspaceId: string, agentId: string): Promise<ModelChoice[]>;
  sessions: {
    list(workspaceId: string): Promise<SessionRecord[]>;
    get(workspaceId: string, sessionId: string): Promise<SessionRecord | undefined>;
    save(workspaceId: string, session: SessionRecord): Promise<void>;
    /** One serialised read-modify-write of one record (the store's write queue); 404 session_not_found */
    update(workspaceId: string, sessionId: string, change: (record: SessionRecord) => SessionRecord): Promise<SessionRecord>;
    /** POST /sessions/default (D29): a Sensei page's (course, lesson) or a draft's Kyoshi conversation. 400 invalid_request for a
     *  draft request with a course or lesson, or a Sensei request without one. */
    openDefault(workspaceId: string, request: DefaultSessionRequest): Promise<DefaultSessionResponse>;
    /** PATCH /sessions/{id}: writes `model` and/or `effort`, raises `revision`, and saves them as the workspace's last for that agent (D26) */
    patch(workspaceId: string, sessionId: string, patch: SessionPatch): Promise<SessionRecord>;
  };
  /** Called by the session API before it forwards a message or answer, and after Eve answers it */
  deliveries?: {
    before(workspaceId: string, session: SessionRecord, delivery: EveDelivery): Promise<unknown>;
    after(workspaceId: string, session: SessionRecord, delivery: EveDelivery, outcome: { handle: unknown; status: number; deliveryId?: string }): Promise<void>;
  };
  /** Sends Eve's cancel to a session's running host (with `turnId` for a paused turn, without one for a working begin); nothing when
   *  no host runs. The leave rules call it after the `leave` transition (D19). */
  cancelTurn?(workspaceId: string, sessionId: string, turnId?: string): Promise<void>;
  /** Presence for idle stop: every proxied request, and each open stream until it closes. Returns the release. */
  activity?(workspaceId: string, kind: "request" | "stream"): () => void;
}

/** An error with a stable code, sent as `{ error, message }` like the public API. */
export class AgentApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AgentApiError";
  }
}
