import { defineAgent, defineDynamic } from "@dojofoo/harness";
import { experimental_createHarnessModel, createLocalHarnessSandbox, prepareHarnessEnvironment, agentAdapter } from "@dojofoo/harness/adapters";
import { createHostPortClient } from "@dojofoo/harness/host-port";
import type { HostPortBinding } from "@dojofoo/harness/persona";
import type { AgentId, SessionModelInfo } from "@dojofoo/protocol";
import { delimiter } from "node:path";

export interface KyoshiRuntime {
  courseRoot: string;
  harnessRoot: string;
  harness: AgentId;
  model?: string;
  commandPath?: string;
  /** Where the lifecycle hook reports, with this start's secret; absent when no UI server hosts it */
  hostPort?: HostPortBinding;
  /** Where the sandbox records native process groups, so the next host start reaps them after a crash */
  processRecord?: string;
}

/** Read the live coordinator at each step, including after a server restart. */
export function createKyoshiAgent(runtime: () => Promise<KyoshiRuntime>) {
  return defineAgent({
    // Native adapters load their bridge assets relative to their package files.
    build: { externalDependencies: ["@dojofoo/harness", "@dojofoo/agents", "@ai-sdk/harness",
      "@ai-sdk/harness-claude-code", "@ai-sdk/harness-codex", "@ai-sdk/harness-cursor", "@ai-sdk/harness-fx",
      "@ai-sdk/harness-grok-build", "@ai-sdk/harness-opencode", "@ai-sdk/harness-pi"] },
    // Ended sessions stay readable after a host restart (open risk 11)
    experimental: { workflow: { retention: "default" } },
    // Before every model call, as the harness may have restarted
    model: defineDynamic(async ctx => {
      const settings = await runtime();
      // The conversation's model and effort, read once per turn: a change applies from the next turn (D26)
      const port = settings.hostPort ? createHostPortClient(settings.hostPort) : undefined;
      const session = port && await ctx.memo(["kyoshi-model", ctx.turn?.id ?? "none"], () => port.call<SessionModelInfo>("session", ctx.session.id, {}));
      const environment = await prepareHarnessEnvironment();
      if (settings.commandPath) environment.PATH = [settings.commandPath, environment.PATH].filter(Boolean).join(delimiter);
      // Production Eve is a separate process. The native SDK owns execution
      // here, where its model runs, rather than using a launcher thread handle.
      const sandbox = createLocalHarnessSandbox(settings.harnessRoot, { environment, processRecord: settings.processRecord, providerId: "dojo-authoring-local" });
      return {
        model: experimental_createHarnessModel({
          sandbox,
          sandboxConfig: { workDir: "course" },
          harness: await agentAdapter(settings.harness, { mode: "full", ...(session?.effort ? { effort: session.effort } : {}) }),
          model: session?.model ?? settings.model,
        // Kyoshi writes the course; eveSessionId lets the lifecycle hook evict its detached turns
        }, { mode: "full", agent: settings.harness, eveSessionId: ctx.session.id }).model,
        // A conservative Eve compaction budget, not a claimed model capacity.
        // The native harness retains its own model selection and compaction.
        modelContextWindowTokens: 32000,
      };
    }),
  });
}
