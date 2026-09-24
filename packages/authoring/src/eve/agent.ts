import { defineAgent, defineDynamic } from "@dojofoo/agent";
import { experimental_createHarnessModel } from "@dojofoo/agent/experimental";
import { createLocalSandbox, requestLocalProcessHost } from "@dojofoo/agent/experimental/local";
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
        const acquire = (sessionId?: string) => createLocalSandbox(settings.harnessRoot, { id: sessionId, processHost });
        const sandbox = {
          specificationVersion: "harness-sandbox-v1" as const,
          providerId: "dojo-authoring-local",
          async createSession(options?: {
            sessionId?: string;
            abortSignal?: AbortSignal;
            onFirstCreate?: (session: Awaited<ReturnType<typeof acquire>>, options: { abortSignal?: AbortSignal }) => Promise<void>;
          }) {
            options?.abortSignal?.throwIfAborted();
            const session = await acquire(options?.sessionId);
            await options?.onFirstCreate?.(session, { abortSignal: options.abortSignal });
            return session;
          },
          resumeSession: ({ sessionId, abortSignal }: { sessionId: string; abortSignal?: AbortSignal }) => {
            abortSignal?.throwIfAborted();
            return acquire(sessionId);
          },
        };
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
