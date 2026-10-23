import { readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { delimiter, join } from "node:path";
import { authoringHarness, type AuthoringHarness } from "./harness.ts";
import { prepareKyoshiApp, prepareKyoshiCommand, prepareKyoshiHarness } from "./prepare.ts";
import { authoringEnvironment } from "./environment.ts";
import { evaluationConfiguration } from "../evaluation/host.ts";
import { resolveRuntimeHarness } from "@dojofoo/config/runtime";

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
  const harnessId = authoringHarness({ ...process.env, DOJOFOO_HARNESS: resolveRuntimeHarness("authoring", courseRoot) }).harnessId;
  const harness = (harnessId === "grok-build" ? "grok" : harnessId) as AuthoringHarness;
  const app = await prepareKyoshiApp(courseRoot);
  const harnessRoot = await prepareKyoshiHarness(courseRoot);
  const runtimePath = app === join(await realpath(courseRoot), ".dojo", "kyoshi")
    ? join(app, ".eve", "dojo-runtime.json") : join(app, "runtime.json");
  let model = options.model;
  if (model === undefined) {
    try {
      const saved: unknown = JSON.parse(await readFile(runtimePath, "utf8"));
      if (saved && typeof saved === "object" && "harness" in saved && saved.harness === harness
        && "model" in saved && typeof saved.model === "string") model = saved.model;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  // Keep Node workers and the coordinator in the same installed package scope.
  const load = createRequire(import.meta.url);
  const { createDevelopmentServer } = await import(load.resolve("@dojofoo/agent/server")) as typeof import("@dojofoo/agent/server");
  const { createLocalSandbox, registerLocalProcessHost, prepareHarnessEnvironment } = await import(load.resolve("@dojofoo/agent/experimental/local")) as typeof import("@dojofoo/agent/experimental/local");
  const server = createDevelopmentServer(app, { host: "127.0.0.1", port: 0, existing: "reject", resume: true });
  let host: ReturnType<typeof registerLocalProcessHost> | undefined;
  let starting: Promise<{ url: string }> | undefined;
  let closing: Promise<void> | undefined;
  const cleanup = async () => {
    // Workers can still be waiting on native process pipes. Close both owners
    // together so server shutdown cannot prevent the process host from stopping.
    const results = await Promise.allSettled([server.close(), host?.close()]);
    const failures = results.filter(result => result.status === "rejected").map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, "Failed to close Kyoshi runtime.");
  };
  return {
    start() {
      if (closing) return Promise.reject(new Error("Kyoshi runtime is closed."));
      return starting ??= (async () => {
        const environment = await prepareHarnessEnvironment(await authoringEnvironment(harness));
        if (process.env.DOJO_CLI) {
          const commands = await prepareKyoshiCommand(harnessRoot, process.env.DOJO_CLI);
          environment.PATH = [commands, environment.PATH].filter(Boolean).join(delimiter);
        }
        host = registerLocalProcessHost(await createLocalSandbox(harnessRoot, { environment }));
        try {
          await writeFile(runtimePath, JSON.stringify({
            courseRoot,
            harnessRoot,
            model,
            harness,
            // A half-configured evaluator must not stop Kyoshi from starting;
            // the evaluation tool then reports "not configured" instead.
            evaluation: (() => { try { return evaluationConfiguration(); } catch { return undefined; } })(),
            connection: host.connection,
          }), { mode: 0o600 });
          const started = await server.start();
          // A bound port is not proof that Eve can load the authored agent.
          // This endpoint resolves the active compiled generation without a model turn.
          const info = await fetch(new URL("eve/v1/info", started.url), {
            signal: AbortSignal.timeout(10_000),
          });
          if (!info.ok) throw new Error(`Kyoshi agent failed readiness (${info.status}): ${await info.text()}`);
          await info.json();
          return started;
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
