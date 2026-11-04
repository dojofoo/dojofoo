import type { ModelChoice, Persona } from "@dojofoo/protocol";

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

export type LifecycleStatus = "idle" | "working" | "paused" | "interrupted";   // "interrupted" is written from step 5
export interface SessionLifecycle {
  status: LifecycleStatus;
  /** The turn the last turn.paused named; cleared at turn.settled */
  turnId?: string;
  /** Set while the begin turn has not settled; resent with the same key on the next open (D29) */
  beginPending?: { idempotencyKey: string; sentAt: string };
  /** The harness reported a failed resume (resume.failed); the record is unusable once that turn settles */
  resumeFailedAt?: string;
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
  /** Raised by every model change; a missing value reads as 0 */
  revision: number;
  endedAt?: string;
  replacedBy?: string;
  lifecycle?: SessionLifecycle;
}

export interface SessionPatch { model: string }

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
  /** Starts (or keeps) the coding agent without waiting for it to be ready */
  start(workspaceId: string, agentId: string): Promise<Agent>;
  stop(workspaceId: string, agentId: string): Promise<Agent>;
  /** Saves the workspace's coding agent after cancelling the old agent's turns and stopping its host.
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
    /** PATCH /sessions/{id}: writes `model`, raises `revision`, and saves the model as the workspace's last for that agent (D26) */
    patch(workspaceId: string, sessionId: string, patch: SessionPatch): Promise<SessionRecord>;
  };
}

/** An error with a stable code, sent as `{ error, message }` like the public API. */
export class AgentApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AgentApiError";
  }
}
