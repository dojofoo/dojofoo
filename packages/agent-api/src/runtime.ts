import type { Client, SendTurnOptions } from "@dojofoo/agent/client";

/** Who the conversation is with: the same chat, with that persona's prompts and tools. */
export const personas = ["sensei", "kyoshi"] as const;
export type Persona = (typeof personas)[number];

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
  /** The Eve client serving this persona on this coding agent; starts it when needed */
  connect(workspaceId: string, target: { agent: string; persona: Persona }): Promise<Client>;
  /** The persona's first message when a session starts without one */
  greeting(persona: Persona): string;
  /** Course context passed with every message; forwardedProps is already parsed page state. */
  context?(workspaceId: string, request: Request, forwardedProps?: unknown): Promise<SendTurnOptions["clientContext"]>;
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
