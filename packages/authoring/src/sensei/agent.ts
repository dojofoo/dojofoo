import { defineAgent, defineDynamic, type DynamicModelContext } from "@dojofoo/agent";
import { experimental_createHarnessModel, createLocalHarnessSandbox, prepareHarnessEnvironment, agentAdapter } from "@dojofoo/agent/adapters";
import { createHostPortClient, HostPortError, type HostPortClient } from "@dojofoo/agent/host-port";
import { type HostPortBinding, readOnlyEnvironment } from "@dojofoo/agent/persona";
import type { AgentId, SenseiSessionInfo } from "@dojofoo/protocol";

/** What the Sensei host writes to its app folder's runtime.json before every start. */
export interface SenseiRuntime {
  workspaceRoot: string;
  workspaceId: string;
  /** `$DOJOFOO_HOME/state/sensei/<workspaceId>`, outside the workspace, with an empty `scratch/` */
  harnessRoot: string;
  /** `$DOJOFOO_HOME/state`: private homes and process records */
  stateDirectory: string;
  harness: AgentId;
  /** The model when the session record names none (the conformance host driver runs without a UI server) */
  model?: string;
  /** Where the lifecycle hook and the context reads go, with this start's secret */
  hostPort?: HostPortBinding;
  processRecord?: string;
  /** An evaluation trial's ceiling; a learner's host has none */
  usageCeiling?: UsageCeiling;
}

/** Per-session spend at which an evaluation trial's Sensei stops (design, "Evaluation"). */
export interface UsageCeiling {
  newInputTokens: number;
  outputTokens: number;
}

/** The host port for this start, or undefined when the host runs without a UI server. */
export function senseiHostPort(settings: Pick<SenseiRuntime, "hostPort">) {
  return settings.hostPort ? createHostPortClient(settings.hostPort) : undefined;
}

/** Before every model call: the un-memoised turn check (step-5 plan, decision 6), then the session read memoised per turn, so a model
 *  change applies from the next turn a delivery starts, never on a paused turn's resume (D26). A turn an agent switch interrupted, or
 *  another agent's session, fails here before any native agent starts; without a status code, so Eve does not retry it. */
export async function sessionForModelCall(port: HostPortClient | undefined, ctx: Pick<DynamicModelContext, "session" | "turn" | "memo">): Promise<SenseiSessionInfo | undefined> {
  if (!port) return undefined;
  try { await port.call("turn.check", ctx.session.id, { turnId: ctx.turn?.id ?? null }); }
  catch (error) {
    if (error instanceof HostPortError && error.code === "turn_interrupted") throw new Error("This turn was interrupted by an agent switch.");
    throw error;
  }
  return ctx.memo(["sensei-model", ctx.turn?.id ?? "none"], () => port.call<SenseiSessionInfo>("session", ctx.session.id, {}));
}

/** Sensei is read-only (D18, D34): native reads only, its own two tools, and none of the user's configuration. `usageCeiling` is
 *  read synchronously, because Eve calls `sessionUsage` without awaiting it. */
export function createSenseiAgent(runtime: () => Promise<SenseiRuntime>, usageCeiling: () => UsageCeiling | undefined = () => undefined) {
  return defineAgent({
    // Native adapters load their bridge assets relative to their package files.
    build: { externalDependencies: ["@dojofoo/agent", "@dojofoo/authoring", "@ai-sdk/harness",
      "@ai-sdk/harness-claude-code", "@ai-sdk/harness-codex", "@ai-sdk/harness-cursor", "@ai-sdk/harness-fx",
      "@ai-sdk/harness-grok-build", "@ai-sdk/harness-opencode", "@ai-sdk/harness-pi"] },
    // Only ask_question and dojo_context: no bash, file writes, web or subagents
    defaultTools: false,
    // A learner's conversation never times out or runs out of budget, and stays readable after it ends (open risk 11); an
    // evaluation trial's host stops at its ceiling with Eve's budget prompt
    limits: {
      sessionTimeoutMs: false,
      sessionUsage: ({ total }) => {
        const ceiling = usageCeiling();
        return ceiling ? total.inputTokens - total.cacheReadTokens >= ceiling.newInputTokens || total.outputTokens >= ceiling.outputTokens : false;
      },
    },
    experimental: { workflow: { retention: "default" } },
    // Before every model call, as the host may have restarted
    model: defineDynamic(async ctx => {
      const settings = await runtime();
      const port = senseiHostPort(settings);
      const session = await sessionForModelCall(port, ctx);
      const environment = await readOnlyEnvironment(settings.harness, await prepareHarnessEnvironment(),
        { stateDirectory: settings.stateDirectory, eveSessionId: ctx.session.id });
      const sandbox = createLocalHarnessSandbox(settings.harnessRoot, { environment, processRecord: settings.processRecord, providerId: "dojo-sensei-local" });
      return {
        model: experimental_createHarnessModel({
          sandbox,
          sandboxConfig: { workDir: "scratch" },
          harness: await agentAdapter(settings.harness, { mode: "read-only" }),
          model: session?.model ?? settings.model,
        }, {
          mode: "read-only", agent: settings.harness, eveSessionId: ctx.session.id,
          onResumeFailure: async failure => { await port?.call("resume.failed", ctx.session.id, failure, `${ctx.session.id}:resume-failed:${failure.at}`); },
        }).model,
        // A conservative Eve compaction budget, not a claimed model capacity.
        modelContextWindowTokens: 32000,
      };
    }),
  });
}
