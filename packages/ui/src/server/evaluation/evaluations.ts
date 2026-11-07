import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { parse } from "yaml";
import { localStateDirectory } from "@dojofoo/config/local-state";
import { readAgentModel, resolveAgent } from "@dojofoo/config/runtime";
import type { EvaluationReceipt, evaluateAuthoredCourse } from "@dojofoo/agents/evaluation/run";
import { senseiEvaluationPolicy } from "@dojofoo/agents/sensei/instructions";
import { agentRow, isAgentId, offeredAgents, type AgentId, type EvaluationFailureCode, type EvaluationTrialStatus } from "@dojofoo/protocol";
import { withAllowance } from "./allowance";
import { trialTimeLimitMs } from "./limits";
import { oneShotRoles } from "./roles";
import { runTrial } from "./trial";

// Outside Vite's module graph, as host-port.ts loaded the evaluation: one copy of authoring's evaluation, whose classes trial.ts shares
const load = createRequire(import.meta.url);
const run = () => load("@dojofoo/agents/evaluation/run") as typeof import("@dojofoo/agents/evaluation/run");
const failures = () => load("@dojofoo/agents/evaluation/failure") as typeof import("@dojofoo/agents/evaluation/failure");
const preflight = () => load("@dojofoo/agents/evaluation/preflight") as typeof import("@dojofoo/agents/evaluation/preflight");
const settings = () => load("@dojofoo/agents/evaluation/settings") as typeof import("@dojofoo/agents/evaluation/settings");

type EvaluationHost = { stop(workspaceId: string, agent: AgentId): Promise<unknown> };
type Trial = { status: EvaluationTrialStatus; controller: AbortController };
type State = { host?: EvaluationHost; running: Set<string>; trials: Map<string, Trial> };
// Process-global: route modules may be loaded twice, and the route and Kyoshi's tool must see the same running trial (decision 12)
const state = ((globalThis as Record<symbol, unknown>)[Symbol.for("dojofoo.evaluations")] ??= { running: new Set(), trials: new Map() }) as State;

/** agent-api.ts registers its runtime's stop once the runtime exists, so these modules do not import it (decision 40). */
export function registerEvaluationHost(host: EvaluationHost): void {
  state.host = host;
}

/** The parts a run composes; replaceable for tests, because authoring loads through Node's require, which Vitest's mocks do not reach. */
export const evaluationRunner = {
  course: (input: Parameters<typeof evaluateAuthoredCourse>[0]) => run().evaluateAuthoredCourse(input),
  roles: oneShotRoles,
  trial: runTrial,
};

/** The code a refusal or a material failure carries to Kyoshi's tool; none for an unexpected error. */
export function failureCode(error: unknown): EvaluationFailureCode | undefined {
  const { EvaluationRefused, MaterialFailure } = failures();
  if (error instanceof EvaluationRefused) return error.code;
  if (error instanceof MaterialFailure) return "preflight_failed";
  return undefined;
}

async function evaluate(input: { root: string; lessonIds: string[]; callId: string; signal: AbortSignal }): Promise<EvaluationReceipt> {
  const failure = failures();
  const root = realpathSync(resolve(input.root));
  if (state.running.has(root)) throw new failure.EvaluationRefused("evaluation_running", "An evaluation of this draft is already running. Wait for it; do not start another.");
  state.running.add(root);
  try {
    input.signal.throwIfAborted();
    if (!(await settings().readEvaluationSettings(root))?.enabled) {
      throw new failure.EvaluationRefused("not_enabled", "Teaching evaluations are not allowed for this draft.");
    }
    // The saved agent as written: resolveAgent would fall back from one that is not offered (Cursor) to another agent
    const saved = await readFile(resolve(root, ".dojo/runtimes.json"), "utf8").then(text => (JSON.parse(text) as { agent?: unknown }).agent, () => undefined);
    if (saved !== undefined && !offeredAgents().some(row => row.id === saved)) {
      const name = isAgentId(saved) ? agentRow(saved).name : String(saved);
      throw new failure.EvaluationRefused("agent_not_offered", `${name} can't teach yet, so this draft can't be evaluated. Switch the draft to another coding agent.`);
    }
    const agent = resolveAgent(root);
    if (!input.callId) throw new failure.EvaluationRefused("invalid_request", "Evaluate one lesson or two distinct lessons for continuity");
    await preflight().checkEvaluationRequest(root, input.lessonIds);
    const manifest = parse(await readFile(resolve(root, "dojo.yaml"), "utf8")) as { mode?: string };
    const stopHost = async (workspaceId: string, trialAgent: AgentId) => { await state.host?.stop(workspaceId, trialAgent); };
    return await withAllowance(root, input.lessonIds, input.callId, async signal => {
      // The roles' and the trial's evidence share one folder, made before the material panel (decision 34)
      await mkdir(resolve(root, ".dojo/handoffs"), { recursive: true });
      const evidenceRoot = await mkdtemp(resolve(root, ".dojo/handoffs/run-"));
      const roles = evaluationRunner.roles({ agent, ...(readAgentModel(root, agent) ? { model: readAgentModel(root, agent) } : {}), evidenceRoot, stateDirectory: localStateDirectory() });
      return evaluationRunner.course({
        root, lessonIds: input.lessonIds, signal: AbortSignal.any([signal, AbortSignal.timeout(trialTimeLimitMs)]),
        teachingPolicy: senseiEvaluationPolicy(manifest.mode === "interactive" ? "interactive" : "katas"),
        priorLessons: "seed-completion", judge: roles.judge,
        trial: signal => evaluationRunner.trial({ draftRoot: root, lessonIds: input.lessonIds, signal, roles, evidenceRoot, stopHost }),
      });
    }, input.signal);
  } finally {
    state.running.delete(root);
  }
}

/** The UI server's course evaluations: one per draft, keyed by the draft's resolved folder. */
export const evaluations = {
  /** Consent, the agent offered, checkEvaluationRequest, one per draft, the allowance, then evaluateAuthoredCourse */
  run: evaluate,
  start(input: { root: string; lessonIds: string[]; callId: string }): { trialId: string } {
    const trialId = randomUUID();
    const trial: Trial = { status: { status: "running" }, controller: new AbortController() };
    state.trials.set(trialId, trial);
    void evaluate({ ...input, signal: trial.controller.signal }).then(
      result => { trial.status = { status: "finished", result }; },
      error => {
        const code = failureCode(error);
        trial.status = { status: "failed", error: error instanceof Error ? error.message : String(error), ...(code ? { code } : {}) };
      });
    return { trialId };
  },
  status(trialId: string): EvaluationTrialStatus | undefined {
    return state.trials.get(trialId)?.status;
  },
  cancel(trialId: string): boolean {
    const trial = state.trials.get(trialId);
    if (!trial) return false;
    trial.controller.abort(new Error("The evaluation was cancelled before it finished."));
    return true;
  },
};
