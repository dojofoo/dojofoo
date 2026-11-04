import type { AgentId } from "./agents.js";

/** One model a coding agent offers (D7). */
export interface ModelChoice {
  id: string;
  name: string;
  efforts: string[];
  defaultEffort?: string;
}

/** The harness could not resume a session from its checkpoint (D28). */
export interface ResumeFailure {
  sessionId: string;
  agent: AgentId;
  message: string;
  at: string;
}

/** Body of `POST /api/host-port/{workspaceId}/{persona}/{method}`. */
export interface HostPortRequest {
  sessionId: string;
  idempotencyKey: string;
  input: unknown;
}

export type HostPortErrorCode =
  | "host_port_unauthorized"
  | "host_port_method_unknown"
  | "idempotency_key_reused"
  | "invalid_request"
  | "host_port_failed"
  | "host_port_timeout";

/** Sensei's host-port `session` result, read from the session record. */
export interface SenseiSessionInfo {
  courseId: string;
  lessonId?: string;
  mode: "katas" | "interactive";
  model?: string;
  revision: number;
}

/** Sensei's host-port `context` result for an interactive course: the lesson snapshot (without references) and DOJO.md. */
export interface InteractiveContext {
  kind: "interactive";
  hash: string;
  course: { id: string; title: string };
  guidance: string;
  lesson: Record<string, unknown>;
}
