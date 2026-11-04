import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { agentAdapter } from "@dojofoo/harness/adapters";
import { prepareKyoshiApp, prepareKyoshiCommand, prepareKyoshiHarness, prepareKyoshiOutput } from "./prepare.ts";
import { resolveAgent } from "@dojofoo/config/runtime";
import { localStateDirectory, workspaceIdFor } from "@dojofoo/config/local-state";
import type { AgentId } from "@dojofoo/protocol";
import { configuredHarnessModel } from "./models.ts";
import { closeSenseiRuntimes } from "../sensei/runtime.ts";

/** Which host a composition root asks for: the workspace it serves and where its host port listens. */
export interface PersonaRuntimeTarget {
  workspaceId?: string;
  hostPortUrl?: string;
  /** An evaluation trial's Sensei ceiling (Sensei only) */
  usageCeiling?: { newInputTokens: number; outputTokens: number };
}

// Native Node module lifetime, not Vite's reloadable route-module lifetime.
// These are owned process resources. Eve remains the only session/history owner.
const runtimes = new Map<string, Promise<Awaited<ReturnType<typeof createKyoshiRuntime>>>>();

/** Route modules may be duplicated by the dev runner; this native registry owns
 * their resources. Finish every close before returning a shutdown failure. */
export async function closeKyoshiRuntimes(): Promise<void> {
  const results = await Promise.allSettled([...runtimes.values()].map(async owner => (await owner).close()));
  const failures = results.filter(result => result.status === "rejected").map(result => result.reason);
  if (failures.length) throw new AggregateError(failures, "Failed to close authoring runtimes.");
}

/** Every persona host this process owns (the Nitro close hook). */
export async function closePersonaRuntimes(): Promise<void> {
  const results = await Promise.allSettled([closeKyoshiRuntimes(), closeSenseiRuntimes()]);
  const failures = results.flatMap(result => result.status === "rejected" ? [result.reason] : []);
  if (failures.length) throw new AggregateError(failures, "Failed to close persona runtimes.");
}

/** Close only this course's owned runtime before its files are removed. */
export async function closeKyoshiRuntime(courseRoot: string): Promise<void> {
  const root = await realpath(courseRoot);
  const owner = runtimes.get(root);
  if (owner) await (await owner).close();
}

export async function acquireKyoshiRuntime(courseRoot: string, target: PersonaRuntimeTarget = {}) {
  const root = await realpath(courseRoot);
  let runtime = runtimes.get(root);
  if (!runtime) {
    runtime = createKyoshiRuntime(root, target).then(server => ({
      start: server.start,
      async close() {
        try { await server.close(); }
        finally { if (runtimes.get(root) === runtime) runtimes.delete(root); }
      },
    })).catch(error => {
      // A failed acquisition owns no runtime. A later explicit request may retry
      // after the caller repairs the course; never retry implicitly.
      if (runtimes.get(root) === runtime) runtimes.delete(root);
      throw error;
    });
    runtimes.set(root, runtime);
  }
  return runtime;
}

/** Owns infrastructure, never the course files or the harness credentials. An explicit agent is for the
 * conformance host driver only (scripts/conformance-host.mjs); every other caller uses the workspace's selection. */
export async function createKyoshiRuntime(courseRoot: string, options: { model?: string; agent?: AgentId } & PersonaRuntimeTarget = {}) {
  const harness = options.agent ?? resolveAgent(courseRoot);
  // An unsupported agent fails here, before anything is prepared
  await agentAdapter(harness, { mode: "full" });
  const app = await prepareKyoshiApp(courseRoot);
  const harnessRoot = await prepareKyoshiHarness(courseRoot);
  const runtimePath = join(app, "runtime.json");
  let model = options.model;
  try {
    const saved: unknown = JSON.parse(await readFile(runtimePath, "utf8"));
    if (model === undefined && saved && typeof saved === "object" && "harness" in saved && saved.harness === harness
      && !("modelSource" in saved && saved.modelSource === "native")
      && "model" in saved && typeof saved.model === "string") model = saved.model;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const selectedModel = model;
  model ??= await configuredHarnessModel(harness);
  const workspaceId = options.workspaceId ?? workspaceIdFor(courseRoot);
  // Keep Node workers and the coordinator in the same installed package scope.
  const load = createRequire(import.meta.url);
  const { createPersonaHost, lifecycleHookSlug } = await import(load.resolve("@dojofoo/harness/persona")) as typeof import("@dojofoo/harness/persona");
  return createPersonaHost({
    appDir: app,
    processRecord: join(localStateDirectory(), "processes", `${workspaceId}.kyoshi.jsonl`),
    async runtimeConfig({ secret, processRecord }) {
      await prepareKyoshiOutput(app);
      const commandPath = process.env.DOJO_CLI ? await prepareKyoshiCommand(harnessRoot, process.env.DOJO_CLI) : undefined;
      return {
        courseRoot,
        harnessRoot,
        model,
        modelSource: selectedModel === undefined && model !== undefined ? "native" : undefined,
        harness,
        commandPath,
        processRecord,
        ...(options.hostPortUrl ? { hostPort: { url: options.hostPortUrl, workspaceId, persona: "kyoshi", secret } } : {}),
      };
    },
    verify(info) {
      if (!info.hooks.some(hook => hook.slug === lifecycleHookSlug)) throw new Error("The prepared Kyoshi build lacks dojofoo's lifecycle hook. Reinstall Dojofoo.");
    },
  });
}
