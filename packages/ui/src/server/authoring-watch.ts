import { realpathSync } from "node:fs";
import { relative, sep } from "node:path";
import { watch } from "chokidar";

type Notice = { method: "workspace.changed" } | { method: "workspace.watch.error"; error: string };
type Listener = (notice: Notice) => void;
const ignoredDirectories = new Set([".git", ".dojo", ".pnpm-store", "node_modules", "dist", "coverage"]);

/** One watcher per viewed workspace, shared across tabs; never follows external links. */
export function createAuthoringWatchers() {
  const entries = new Map<string, { listeners: Set<Listener>; close(): Promise<void>; ready: boolean }>();
  return {
    subscribe(path: string, listener: Listener) {
      const root = realpathSync(path);
      let entry = entries.get(root);
      if (!entry) {
        const listeners = new Set<Listener>();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const watcher = watch(root, {
          ignoreInitial: true,
          followSymlinks: false,
          atomic: true,
          awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
          ignored: path => relative(root, path).split(sep).some(segment =>
            ignoredDirectories.has(segment) || segment === ".env" || segment.startsWith(".env.")),
        });
        entry = { listeners, ready: false, async close() { clearTimeout(timer); await watcher.close(); } };
        const current = entry;
        const notify = (notice: Notice) => { for (const callback of listeners) callback(notice); };
        watcher.on("ready", () => {
          current.ready = true;
          notify({ method: "workspace.changed" });
        });
        watcher.on("all", () => {
          clearTimeout(timer);
          timer = setTimeout(() => notify({ method: "workspace.changed" }), 100);
        });
        watcher.on("error", error => notify({ method: "workspace.watch.error", error: String(error) }));
        entries.set(root, entry);
      }
      entry.listeners.add(listener);
      if (entry.ready) listener({ method: "workspace.changed" });
      const subscribed = entry;
      return async () => {
        subscribed.listeners.delete(listener);
        if (!subscribed.listeners.size && entries.get(root) === subscribed) {
          entries.delete(root);
          await subscribed.close();
        }
      };
    },
    async close() {
      const active = [...entries.values()];
      entries.clear();
      await Promise.all(active.map(entry => entry.close()));
    },
  };
}

export const authoringWatchers = createAuthoringWatchers();
