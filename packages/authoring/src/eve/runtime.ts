import { readFile, realpath, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { authoringHarness, type AuthoringHarness } from "./harness.ts";
import { prepareKyoshiApp, prepareKyoshiCommand, prepareKyoshiHarness, prepareKyoshiOutput } from "./prepare.ts";
import { evaluationConfiguration } from "../evaluation/host.ts";
import { resolveRuntimeHarness } from "@dojofoo/config/runtime";
import { configuredHarnessModel } from "./models.ts";

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

export async function acquireKyoshiRuntime(courseRoot: string) {
  const root = await realpath(courseRoot);
  let runtime = runtimes.get(root);
  if (!runtime) {
    runtime = createKyoshiRuntime(root).then(server => ({
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

/** Owns infrastructure, never the course files or the harness credentials. */
export async function createKyoshiRuntime(courseRoot: string, options: { model?: string } = {}) {
  const harnessId = (await authoringHarness({ ...process.env, DOJOFOO_HARNESS: resolveRuntimeHarness("authoring", courseRoot) })).harnessId;
  const harness = (harnessId === "grok-build" ? "grok" : harnessId) as AuthoringHarness;
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
  // Keep Node workers and the coordinator in the same installed package scope.
  const load = createRequire(import.meta.url);
  const { startProductionServer } = await import(load.resolve("@dojofoo/agent/server/production")) as typeof import("@dojofoo/agent/server/production");
  const { Client } = await import(load.resolve("@dojofoo/agent/client")) as typeof import("@dojofoo/agent/client");
  const auth = { basic: { username: "dojo-host", password: randomBytes(32).toString("hex") } };
  let production: Awaited<ReturnType<typeof startProductionServer>> | undefined;
  const server = {
      async start() {
        await prepareKyoshiOutput(app);
        production = await startProductionServer(app, { host: "127.0.0.1", port: 0 });
        return production;
      },
      async close() { await production?.close(); },
    };
  let starting: Promise<{ url: string; auth: typeof auth }> | undefined;
  let closing: Promise<void> | undefined;
  const cleanup = async () => {
    await server.close();
  };
  return {
    start() {
      if (closing) return Promise.reject(new Error("Kyoshi runtime is closed."));
      return starting ??= (async () => {
        const commandPath = process.env.DOJO_CLI ? await prepareKyoshiCommand(harnessRoot, process.env.DOJO_CLI) : undefined;
        try {
          await writeFile(runtimePath, JSON.stringify({
            courseRoot,
            auth: auth?.basic,
            harnessRoot,
            model,
            modelSource: selectedModel === undefined && model !== undefined ? "native" : undefined,
            harness,
            // A half-configured evaluator must not stop Kyoshi from starting;
            // the evaluation tool then reports "not configured" instead.
            evaluation: (() => { try { return evaluationConfiguration(); } catch { return undefined; } })(),
            commandPath,
          }), { mode: 0o600 });
          const started = await server.start();
          // A bound port is not proof that Eve can load the authored agent.
          // This endpoint resolves the active compiled generation without a model turn.
          await new Client({ host: started.url, auth }).info({
            signal: AbortSignal.timeout(10_000),
          });
          return { url: started.url, auth };
        } catch (error) {
          await cleanup();
          throw error;
        }
      })();
    },
    close() {
      return closing ??= (async () => {
        await starting?.catch(() => {});
        await cleanup();
      })();
    },
  };
}
