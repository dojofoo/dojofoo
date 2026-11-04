import type { Persona } from "@dojofoo/protocol";

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

/** What the API remembers about a session; Eve keeps its history and state. */
export interface SessionRecord {
  id: string;
  /** Coding agent id */
  agent: string;
  persona: Persona;
  createdAt: string;
}

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
  /** The persona's first message when a session starts without one */
  greeting(persona: Persona): string;
  /** From the workspace's kind: a draft runs Kyoshi; a learner workspace or an evaluation trial runs Sensei. */
  persona(workspaceId: string): Promise<Persona>;
  sessions: {
    list(workspaceId: string): Promise<SessionRecord[]>;
    get(workspaceId: string, sessionId: string): Promise<SessionRecord | undefined>;
    save(workspaceId: string, session: SessionRecord): Promise<void>;
  };
}

/** An error with a stable code, sent as `{ error, message }` like the public API. */
export class AgentApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "AgentApiError";
  }
}
