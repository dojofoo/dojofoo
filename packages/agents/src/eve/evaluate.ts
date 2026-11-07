import { setTimeout as delay } from "node:timers/promises";
import { defineTool } from "@dojofoo/harness/tools";
import { createHostPortClient } from "@dojofoo/harness/host-port";
import type { EvaluationFailureCode, EvaluationTrialStatus } from "@dojofoo/protocol";
import { z } from "zod";
import type { EvaluationReceipt } from "../evaluation/run";
import type { KyoshiRuntime } from "./agent.ts";

/** What Kyoshi is told for each refusal: its status and the next step (the teaching-evals skill's stop rules name them). */
const refusals: Record<EvaluationFailureCode, { status: string; next: string }> = {
  not_enabled: { status: "not-configured", next: "Tell the author once that teaching evaluations are off for this draft, and stop." },
  invalid_request: { status: "invalid-request", next: "Use lesson IDs from dojo.yaml: the lesson, optionally preceded by its predecessor." },
  preflight_failed: { status: "preflight-failed", next: "Fix these findings and call again; no attempt was used." },
  allowance_exhausted: { status: "allowance-exhausted", next: "Report the remaining issue to the author; do not retry." },
  evaluation_running: { status: "already-running", next: "Wait for the running evaluation; do not start another." },
  agent_not_offered: { status: "agent-unavailable", next: "Tell the author once; this draft's coding agent can't teach yet." },
};

/** Kyoshi's evaluate tool: the UI server runs the evaluation (host-port `evaluation.start`), the tool polls `evaluation.status` every
 *  5 seconds and cancels the trial with `evaluation.cancel` when it is aborted. `pollMs` is for tests. */
export function createKyoshiEvaluationTool(runtime: () => Promise<Pick<KyoshiRuntime, "hostPort">>, options: { pollMs?: number } = {}) {
  return defineTool({
    description: "Trial authored lessons with an isolated production Sensei and two independent judges. Uses paid model calls within a host-owned three-attempt allowance. Evaluate the current lesson; include its predecessor to check continuity. After a material or teaching failure, revise the named issues and call again. Stop on infrastructure failure or exhausted allowance. Never claim a pass without this report.",
    inputSchema: z.object({ lessonIds: z.array(z.string().min(1)).min(1).max(2) }).strict(),
    label: { start: () => "Evaluating teaching" },
    execute: async ({ lessonIds }, context) => {
      const { hostPort } = await runtime();
      if (!hostPort) return { status: "not-configured", error: "Evaluations run in the dojofoo UI.", next: "Tell the author once that evaluations run in the dojofoo UI, and stop." };
      const port = createHostPortClient(hostPort);
      const key = `${context.session.id}:${context.callId}`;
      const { trialId } = await port.call<{ trialId: string }>("evaluation.start", context.session.id, { lessonIds }, key);
      let trial: EvaluationTrialStatus;
      try {
        for (;;) {
          trial = await port.call<EvaluationTrialStatus>("evaluation.status", context.session.id, { trialId });
          if (trial.status !== "running") break;
          await delay(options.pollMs ?? 5_000, undefined, { signal: context.abortSignal });
        }
      } catch (error) {
        if (context.abortSignal?.aborted) await port.call("evaluation.cancel", context.session.id, { trialId }, `${key}:cancel`).catch(() => {});
        throw error;
      }
      if (trial.status === "failed") {
        // Expected outcomes are results for Kyoshi to act on, not tool crashes.
        const refusal = trial.code ? refusals[trial.code] : undefined;
        if (!refusal) throw new Error(trial.error);
        return { status: refusal.status, error: trial.error, next: refusal.next };
      }
      const result = trial.result as EvaluationReceipt;
      return {
        attempt: result.attempt, remaining: result.remaining,
        status: result.report.status, stage: result.report.stage,
        reportDirectory: result.report.directory, error: result.report.error,
        // Keep both raw verdicts: a consensus summary cannot clear a strict failure.
        decisions: result.report.decisions,
        material: result.report.material?.map(({ judge, verdict }) => ({ judge, verdict })),
        teaching: result.report.teaching?.map(({ judge, verdict }) => ({ judge, verdict })),
      };
    },
  });
}
