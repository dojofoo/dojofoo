import { defineAgent, defineDynamic } from "@dojofoo/agent";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
import { createLocalHarnessSandbox, requestLocalProcessHost } from "@dojofoo/agent/experimental/local";
import { authoringHarness, type AuthoringHarness } from "./harness.ts";

export interface KyoshiRuntime {
  courseRoot: string;
  harnessRoot: string;
  harness: AuthoringHarness;
  model?: string;
  connection: Parameters<typeof requestLocalProcessHost>[0];
}

/** Read the live coordinator at each step, including after a server restart. */
export function createKyoshiAgent(runtime: () => Promise<KyoshiRuntime>) {
  return defineAgent({
    build: { externalDependencies: ["@dojofoo/agent", "@dojofoo/authoring"] },
    model: defineDynamic({ events: {
      "step.started": async () => {
        const settings = await runtime();
        const processHost = await requestLocalProcessHost(settings.connection);
        const sandbox = createLocalHarnessSandbox(settings.harnessRoot, { processHost, providerId: "dojo-authoring-local" });
        return {
          model: experimental_createHarnessModel({
            sandbox,
            sandboxConfig: { workDir: "course" },
            harness: authoringHarness({ DOJOFOO_HARNESS: settings.harness }),
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
