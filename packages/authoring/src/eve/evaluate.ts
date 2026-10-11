import { defineTool } from "@dojofoo/agent/tools";
import { z } from "zod";
import { evaluateFromAuthoring, type EvaluationConfiguration } from "../evaluation/host.ts";

export function createKyoshiEvaluationTool(runtime: () => Promise<{ courseRoot: string; evaluation?: EvaluationConfiguration }>) {
  return defineTool({
    description: "Trial authored lessons with an isolated production Sensei and two independent judges. Uses paid model calls within a host-owned three-attempt allowance. Evaluate the current lesson; include its predecessor to check continuity. After a material or teaching failure, revise the named issues and call again. Stop on infrastructure failure or exhausted allowance. Never claim a pass without this report.",
    inputSchema: z.object({ lessonIds: z.array(z.string().min(1)).min(1).max(2) }).strict(),
    label: { start: () => "Evaluating teaching" },
    execute: async ({ lessonIds }, context) => {
      const settings = await runtime();
      const result = await evaluateFromAuthoring({ root: settings.courseRoot, config: settings.evaluation, lessonIds, callId: context.callId, signal: context.abortSignal });
      return {
        attempt: result.attempt, remaining: result.remaining,
        status: result.report.status, stage: result.report.stage,
        reportDirectory: result.report.directory, error: result.report.error,
        // Fix `blocking`; `disputed` (one judge only) are optional refinements.
        decisions: result.report.decisions,
        material: result.report.material?.map(({ judge, verdict }) => ({ judge, verdict })),
        teaching: result.report.teaching?.map(({ judge, verdict }) => ({ judge, verdict })),
      };
    },
  });
}
