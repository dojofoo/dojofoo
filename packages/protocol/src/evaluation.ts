/** Why the UI server refused or stopped a course evaluation; Kyoshi's tool maps each to its status. */
export type EvaluationFailureCode =
  | "not_enabled" | "invalid_request" | "preflight_failed" | "allowance_exhausted" | "evaluation_running" | "agent_not_offered";

/** host-port `evaluation.status` */
export type EvaluationTrialStatus =
  | { status: "running" }
  | { status: "finished"; result: unknown /* EvaluationReceipt, owned by @dojofoo/agents */ }
  | { status: "failed"; error: string; code?: EvaluationFailureCode };
