import type { AgentId } from "./agents.js";
import type { DojoLessonContext } from "./index.js";

/** One model a coding agent offers (D7). */
export interface ModelChoice {
  id: string;
  /** The agent's own name for it, with its version where the agent gives one ("Opus 5.5") */
  name: string;
  /** The agent's one-line description, where it gives one */
  description?: string;
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
  | "host_port_timeout"
  | "turn_interrupted"
  | "lesson_incomplete";

/** Sensei's host-port `session` result, read from the session record. */
export interface SenseiSessionInfo {
  courseId: string;
  lessonId?: string;
  mode: "katas" | "interactive";
  model?: string;
  /** The effort the conversation's model runs at; the model's own default when absent */
  effort?: string;
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

/** Sensei's kata material, from host-port `context` */
export interface KataContext {
  kind: "kata";
  hash: string;
  course: { id: string; title: string };
  guidance: string;
  /** The lesson's SENSEI.md and its fragment ids, for the per-session instructions */
  lesson: { id: string; source: string; fragmentIds: string[] };
  /** `learner.file.content` is "" with `fileUnchanged: true` when the file is unchanged since this session's last read */
  context: DojoLessonContext;
  fileUnchanged?: true;
}

export type SenseiContext = InteractiveContext | KataContext;

/** Sensei's host-port `check` result; `report` is the UI server's TestReport. */
export interface LessonCheck {
  observationId: string;
  report: unknown;
}

/** Where a kata lesson's navigation went (host-port `navigate`, socket `lesson.navigated`). */
export interface LessonNavigation {
  courseId: string;
  lessonId: string;
}
