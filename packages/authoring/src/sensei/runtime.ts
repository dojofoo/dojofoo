import { mkdir, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { agentAdapter } from "@dojofoo/agent/adapters";
import { resolveAgent } from "@dojofoo/config/runtime";
import { localStateDirectory, workspaceIdFor } from "@dojofoo/config/local-state";
import type { AgentId } from "@dojofoo/protocol";
import { preparePersonaApp, preparePersonaOutput } from "../eve/prepare.ts";
import type { PersonaRuntimeTarget } from "../eve/runtime.ts";

// Native Node module lifetime, as Kyoshi's runtimes (eve/runtime.ts)
const runtimes = new Map<string, Promise<Awaited<ReturnType<typeof createSenseiRuntime>>>>();

export async function closeSenseiRuntimes(): Promise<void> {
  const results = await Promise.allSettled([...runtimes.values()].map(async owner => (await owner).close()));
  const failures = results.filter(result => result.status === "rejected").map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, "Failed to close Sensei runtimes.");
}

export async function acquireSenseiRuntime(workspaceRoot: string, target: PersonaRuntimeTarget = {}) {
  const root = await realpath(workspaceRoot);
  let runtime = runtimes.get(root);
  if (!runtime) {
    runtime = createSenseiRuntime(root, target).then(server => ({
      start: server.start,
      async close() {
        try { await server.close(); }
        finally { if (runtimes.get(root) === runtime) runtimes.delete(root); }
      },
    })).catch(error => {
      if (runtimes.get(root) === runtime) runtimes.delete(root);
      throw error;
    });
    runtimes.set(root, runtime);
  }
  return runtime;
}

/** Sensei's native working directory: `$DOJOFOO_HOME/state/sensei/<workspaceId>` with an empty `scratch/`, outside the workspace
 *  (design, "Write prevention"). The Eve app and its World stay in `<workspace>/.dojo/sensei-app`. */
export async function prepareSenseiHarness(workspaceId: string): Promise<string> {
  const root = join(localStateDirectory(), "sensei", workspaceId);
  const scratch = join(root, "scratch");
  await mkdir(scratch, { recursive: true });
  return root;
}

/** Owns infrastructure, never the learner's files or the harness credentials. An explicit agent and model are for the
 *  conformance host driver; every other caller uses the workspace's selection and the session's model. */
export async function createSenseiRuntime(workspaceRoot: string, options: { agent?: AgentId; model?: string } & PersonaRuntimeTarget = {}) {
  const harness = options.agent ?? resolveAgent(workspaceRoot);
  // An unsupported agent fails here, before anything is prepared
  await agentAdapter(harness, { mode: "read-only" });
  const workspaceId = options.workspaceId ?? workspaceIdFor(workspaceRoot);
  const app = await preparePersonaApp(workspaceRoot, "sensei");
  const stateDirectory = localStateDirectory();
  const load = createRequire(import.meta.url);
  const { createPersonaHost } = await import(load.resolve("@dojofoo/agent/persona-host")) as typeof import("@dojofoo/agent/persona-host");
  const { lifecycleHookSlug } = await import(load.resolve("@dojofoo/agent/lifecycle")) as typeof import("@dojofoo/agent/lifecycle");
  return createPersonaHost({
    appDir: app,
    processRecord: join(stateDirectory, "processes", `${workspaceId}.sensei.jsonl`),
    async runtimeConfig({ secret, processRecord }) {
      await preparePersonaOutput(app, "sensei");
      return {
        workspaceRoot,
        workspaceId,
        harnessRoot: await prepareSenseiHarness(workspaceId),
        stateDirectory,
        harness,
        model: options.model,
        processRecord,
        ...(options.hostPortUrl ? { hostPort: { url: options.hostPortUrl, workspaceId, persona: "sensei", secret,
          readOnly: { agent: harness, stateDirectory } } } : {}),
      };
    },
    verify(info) {
      if (!info.hooks.some(hook => hook.slug === lifecycleHookSlug)) throw new Error("The prepared Sensei build lacks dojofoo's lifecycle hook. Reinstall Dojofoo.");
    },
  });
}
