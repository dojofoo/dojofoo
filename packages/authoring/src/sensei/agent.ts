import { defineAgent, defineDynamic } from "@dojofoo/agent";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
import { createLocalHarnessSandbox, prepareHarnessEnvironment } from "@dojofoo/agent/experimental/local";
import { agentAdapter } from "@dojofoo/agent/adapters";
import { createHostPortClient } from "@dojofoo/agent/host-port";
import type { HostPortBinding } from "@dojofoo/agent/lifecycle";
import { readOnlyEnvironment } from "@dojofoo/agent/read-only";
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
}

/** The host port for this start, or undefined when the host runs without a UI server. */
export function senseiHostPort(settings: Pick<SenseiRuntime, "hostPort">) {
  return settings.hostPort ? createHostPortClient(settings.hostPort) : undefined;
}

/** Sensei is read-only (D18, D34): native reads only, its own two tools, and none of the user's configuration. */
export function createSenseiAgent(runtime: () => Promise<SenseiRuntime>) {
  return defineAgent({
    // Native adapters load their bridge assets relative to their package files.
    build: { externalDependencies: ["@dojofoo/agent", "@dojofoo/authoring", "@ai-sdk/harness",
      "@ai-sdk/harness-claude-code", "@ai-sdk/harness-codex", "@ai-sdk/harness-cursor", "@ai-sdk/harness-fx",
      "@ai-sdk/harness-grok-build", "@ai-sdk/harness-opencode", "@ai-sdk/harness-pi"] },
    // Only ask_question and dojo_context: no bash, file writes, web or subagents
    defaultTools: false,
    // A learner's conversation never times out or runs out of budget, and stays readable after it ends (open risk 11)
    limits: { sessionTimeoutMs: false, sessionUsage: false },
    experimental: { workflow: { retention: "default" } },
    // Before every model call, as the host may have restarted
    model: defineDynamic(async ctx => {
      const settings = await runtime();
      const port = senseiHostPort(settings);
      // Per turn, so a model change applies from the next turn a delivery starts, never on a paused turn's resume (D26)
      const session = port ? await ctx.memo(["sensei-model", ctx.turn?.id ?? "none"],
        () => port.call<SenseiSessionInfo>("session", ctx.session.id, {})) : undefined;
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
