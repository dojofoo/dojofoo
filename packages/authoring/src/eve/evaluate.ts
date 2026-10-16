import { defineTool } from "@dojofoo/agent/tools";
import { z } from "zod";
import { MaterialFailure } from "../evaluation/failure.ts";
import { evaluateFromAuthoring, type EvaluationConfiguration } from "../evaluation/host.ts";
import { configuredEvaluation, readEvaluationSettings } from "../evaluation/settings.ts";

export function createKyoshiEvaluationTool(runtime: () => Promise<{ courseRoot: string; evaluation?: EvaluationConfiguration }>) {
  return defineTool({
    description: "Trial authored lessons with an isolated production Sensei and two independent judges. Uses paid model calls within a host-owned three-attempt allowance. Evaluate the current lesson; include its predecessor to check continuity. After a material or teaching failure, revise the named issues and call again. Stop on infrastructure failure or exhausted allowance. Never claim a pass without this report.",
    inputSchema: z.object({ lessonIds: z.array(z.string().min(1)).min(1).max(2) }).strict(),
    label: { start: () => "Evaluating teaching" },
    execute: async ({ lessonIds }, context) => {
      const settings = await runtime();
      let config: EvaluationConfiguration | undefined;
      let result;
      try {
        const configured = await readEvaluationSettings(settings.courseRoot);
        config = configured ? await configuredEvaluation(settings.courseRoot) : settings.evaluation;
        result = await evaluateFromAuthoring({ root: settings.courseRoot, config, lessonIds, callId: context.callId, signal: context.abortSignal });
      } catch (error) {
        // Expected outcomes are results for Kyoshi to act on, not tool crashes.
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof MaterialFailure) return { status: "preflight-failed", error: message, next: "Fix these findings and call again; no attempt was used." };
        if (!config) return { status: "not-configured", error: message, next: "Tell the author once and stop; do not choose models." };
        if (message.includes("not in this course") || message.includes("Evaluate one lesson")) return { status: "invalid-request", error: message, next: "Use lesson IDs from dojo.yaml: the lesson, optionally preceded by its predecessor." };
        if (message.includes("allowance exhausted")) return { status: "allowance-exhausted", error: message, next: "Report the remaining issue to the author; do not retry." };
        throw error;
      }
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
