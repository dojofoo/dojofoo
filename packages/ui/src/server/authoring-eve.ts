import { realpathSync } from "node:fs";
import { Client } from "@dojofoo/agent/client";
import { createEveAuthoringRoutes } from "@dojofoo/authoring/eve/server";
import type { Hono, MiddlewareHandler } from "hono";

/** An explicitly configured Eve host belongs to one course workspace. */
export function mountEveAuthoring(app: Hono, options: {
  host?: string;
  runtime?: () => Promise<{ start(): Promise<{ url: string }>; close(): Promise<void> }>;
  root(): string;
  resolveWorkspace(request: Request): string;
}) {
  if (!options.host && !options.runtime) {
    app.get("/backend", c => c.json({ backend: "acp" }));
    return async () => {};
  }
  const root = realpathSync(options.root());
  let runtime: Awaited<ReturnType<NonNullable<typeof options.runtime>>> | undefined;
  let client: Promise<Client> | undefined;
  let closing: Promise<void> | undefined;
  let closed = false;
  const getClient = () => {
    if (closed) return Promise.reject(new Error("Authoring runtime is shutting down"));
    return client ??= (async () => {
      if (options.host) return new Client({ host: options.host });
      runtime = await options.runtime!();
      const { url } = await runtime.start();
      return new Client({ host: url });
    })();
  };
  const scope: MiddlewareHandler = async (c, next) => {
    if (realpathSync(options.resolveWorkspace(c.req.raw)) !== root) {
      return c.json({ error: "This Eve host belongs to a different authoring workspace." }, 403);
    }
    try { await getClient(); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 503); }
    await next();
  };
  app.use("/backend", scope);
  app.use("/eve/*", scope);
  app.get("/backend", c => c.json({ backend: "eve" }));
  app.route("/eve", createEveAuthoringRoutes(getClient));
  return () => closing ??= (async () => {
    closed = true;
    await client?.catch(() => {});
    await runtime?.close();
  })();
}
