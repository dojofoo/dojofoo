import { defineAgent, defineDynamic } from "@dojofoo/agent";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
import { createLocalHarnessSandbox, prepareHarnessEnvironment } from "@dojofoo/agent/experimental/local";
import { authoringHarness, type AuthoringHarness } from "./harness.ts";
import { authoringEnvironment } from "./environment.ts";
import { delimiter } from "node:path";

export interface KyoshiRuntime {
  courseRoot: string;
  harnessRoot: string;
  harness: AuthoringHarness;
  model?: string;
  commandPath?: string;
}

/** Read the live coordinator at each step, including after a server restart. */
export function createKyoshiAgent(runtime: () => Promise<KyoshiRuntime>) {
  return defineAgent({
    // Native adapters load their bridge assets relative to their package files.
    build: { externalDependencies: ["@dojofoo/agent", "@dojofoo/authoring", "@ai-sdk/harness",
      "@ai-sdk/harness-codex", "@ai-sdk/harness-cursor", "@ai-sdk/harness-fx",
      "@ai-sdk/harness-grok-build", "@ai-sdk/harness-opencode", "@ai-sdk/harness-pi"] },
    model: defineDynamic({ events: {
      "step.started": async () => {
        const settings = await runtime();
        const environment = await prepareHarnessEnvironment(await authoringEnvironment(settings.harness));
        if (settings.commandPath) environment.PATH = [settings.commandPath, environment.PATH].filter(Boolean).join(delimiter);
        // Production Eve is a separate process. The native SDK owns execution
        // here, where its model runs, rather than using a launcher thread handle.
        const sandbox = createLocalHarnessSandbox(settings.harnessRoot, { environment, providerId: "dojo-authoring-local" });
        return {
          model: experimental_createHarnessModel({
            sandbox,
            sandboxConfig: { workDir: "course" },
            harness: await authoringHarness({ DOJOFOO_HARNESS: settings.harness }),
            model: settings.model,
          }).model,
          // A conservative Eve compaction budget, not a claimed model capacity.
          // The native harness retains its own model selection and compaction.
          modelContextWindowTokens: 32000,
        };
      },
    } }),
  });
}
