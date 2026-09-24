import { readFile, realpath, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import { authoringHarness, type AuthoringHarness } from "./harness.ts";
import { prepareKyoshiApp, prepareKyoshiHarness } from "./prepare.ts";
import { authoringEnvironment } from "./environment.ts";

// Native Node module lifetime, not Vite's reloadable route-module lifetime.
// These are owned process resources. Eve remains the only session/history owner.
const runtimes = new Map<string, Promise<Awaited<ReturnType<typeof createKyoshiRuntime>>>>();

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
  const harnessId = authoringHarness().harnessId;
  const harness = (harnessId === "grok-build" ? "grok" : harnessId) as AuthoringHarness;
  const app = await prepareKyoshiApp(courseRoot);
  const harnessRoot = await prepareKyoshiHarness(courseRoot);
  const runtimePath = join(app, "runtime.json");
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
  const load = createRequire(join(app, "package.json"));
  const { createDevelopmentServer } = load("@dojofoo/agent/server") as typeof import("@dojofoo/agent/server");
  const { createLocalSandbox, registerLocalProcessHost, prepareHarnessEnvironment } = load("@dojofoo/agent/experimental/local") as typeof import("@dojofoo/agent/experimental/local");
  const server = createDevelopmentServer(app, { host: "127.0.0.1", port: 0, existing: "reject" });
  let host: ReturnType<typeof registerLocalProcessHost> | undefined;
  let starting: Promise<{ url: string }> | undefined;
  let closing: Promise<void> | undefined;
  const cleanup = async () => {
    try { await server.close(); }
    finally { await host?.close(); }
  };
  return {
    start() {
      if (closing) return Promise.reject(new Error("Kyoshi runtime is closed."));
      return starting ??= (async () => {
        const environment = await prepareHarnessEnvironment(await authoringEnvironment(harness));
        host = registerLocalProcessHost(await createLocalSandbox(harnessRoot, { environment }));
        try {
          await writeFile(runtimePath, JSON.stringify({
            courseRoot,
            harnessRoot,
            model,
            harness,
            connection: host.connection,
          }), { mode: 0o600 });
          return await server.start();
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
