import { realpathSync } from "node:fs";
import { Hono, type Context } from "hono";
import { mountEveAuthoring } from "./authoring-eve";

type OwnedRuntime = { start(): Promise<{ url: string }>; close(): Promise<void> };

/** Route each local workspace through its own existing fixed-owner Eve mount. */
export function mountLocalEveAuthoring(app: Hono, options: {
  runtime(root: string): Promise<OwnedRuntime>;
  resolveWorkspace(request: Request): string;
}) {
  const mounts = new Map<string, { app: Hono; close(): Promise<void> }>();
  let closed = false;
  let closing: Promise<void> | undefined;
  const dispatch = async (c: Context, path: string) => {
    if (closed) return c.json({ error: "Authoring runtime is shutting down" }, 503);
    const root = realpathSync(options.resolveWorkspace(c.req.raw));
    let mount = mounts.get(root);
    if (!mount) {
      const child = new Hono();
      const close = mountEveAuthoring(child, { root: () => root, resolveWorkspace: options.resolveWorkspace, runtime: () => options.runtime(root) });
      mount = { app: child, close };
      mounts.set(root, mount);
    }
    const url = new URL(c.req.url);
    url.pathname = path;
    return mount.app.fetch(new Request(url, c.req.raw));
  };
  app.all("/backend", c => dispatch(c, "/backend"));
  app.all("/eve/*", c => {
    // Hono includes the parent mount in routePath; leave opaque session IDs and queries intact.
    const prefix = c.req.routePath.slice(0, -"/eve/*".length);
    return dispatch(c, new URL(c.req.url).pathname.slice(prefix.length));
  });
  return () => closing ??= (async () => {
    closed = true;
    const results = await Promise.allSettled([...mounts.values()].map(mount => mount.close()));
    const errors = results.filter(result => result.status === "rejected").map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, "Could not close every authoring runtime");
  })();
}
