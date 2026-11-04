import { realpathSync } from "node:fs";
import { relative, sep } from "node:path";
import { watch } from "chokidar";

type Notice = { method: "workspace.changed" } | { method: "workspace.watch.error"; error: string };
type Listener = (notice: Notice) => void;
const ignoredDirectories = new Set([".git", ".dojo", ".pnpm-store", "node_modules", "dist", "coverage"]);
const evaluationReport = /^\.dojo\/evaluations\/run-[^/]+\/report\.json$/u;

/** One watcher per viewed workspace, shared across tabs; never follows external links. A draft whose last authoring socket closed
 *  without another opening within `leaveAfterMs` (30 seconds) is left: the `onLeft` listeners run with its folder (Kyoshi's leave rule). */
export function createAuthoringWatchers(options: { leaveAfterMs?: number } = {}) {
  const entries = new Map<string, { listeners: Set<Listener>; close(): Promise<void>; ready: boolean }>();
  const leaving = new Map<string, ReturnType<typeof setTimeout>>();
  const leftListeners = new Set<(path: string) => unknown>();
  const stopLeaving = (root: string) => {
    clearTimeout(leaving.get(root));
    leaving.delete(root);
  };
  return {
    onLeft(listener: (path: string) => unknown) {
      leftListeners.add(listener);
      return () => { leftListeners.delete(listener); };
    },
    subscribe(path: string, listener: Listener) {
      const root = realpathSync(path);
      stopLeaving(root);
      let entry = entries.get(root);
      if (!entry) {
        const listeners = new Set<Listener>();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const watcher = watch(root, {
          ignoreInitial: true,
          followSymlinks: false,
          atomic: true,
          awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
          ignored: path => {
            const parts = relative(root, path).split(sep);
            // Traverse only the report branch of managed state. Never watch
            // runtime credentials, harness history or evaluation evidence.
            if (parts[0] === ".dojo") {
              return !(parts.length === 1 || (parts[1] === "evaluations" && (
                parts.length === 2 || (parts.length === 3 && parts[2]!.startsWith("run-"))
                || evaluationReport.test(parts.join("/"))
              )));
            }
            return parts.some(segment => ignoredDirectories.has(segment) || segment === ".env" || segment.startsWith(".env."));
          },
        });
        entry = { listeners, ready: false, async close() { clearTimeout(timer); await watcher.close(); } };
        const current = entry;
        const notify = (notice: Notice) => { for (const callback of listeners) callback(notice); };
        watcher.on("ready", () => {
          current.ready = true;
          notify({ method: "workspace.changed" });
        });
        watcher.on("all", (_event, path) => {
          const local = relative(root, path).split(sep).join("/");
          if ((local === ".dojo" || local.startsWith(".dojo/")) && !evaluationReport.test(local)) return;
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
          stopLeaving(root);
          const timer = setTimeout(() => {
            leaving.delete(root);
            for (const left of leftListeners) Promise.resolve().then(() => left(root)).catch(error => console.warn(`Could not leave ${root}: ${error instanceof Error ? error.message : String(error)}`));
          }, options.leaveAfterMs ?? 30_000);
          timer.unref?.();
          leaving.set(root, timer);
          await subscribed.close();
        }
      };
    },
    /** Whether a page is watching this workspace (idle stop keeps its host) */
    watching(path: string): boolean {
      try { return entries.has(realpathSync(path)); } catch { return false; }
    },
    async close() {
      const active = [...entries.values()];
      entries.clear();
      for (const root of [...leaving.keys()]) stopLeaving(root);
      await Promise.all(active.map(entry => entry.close()));
    },
  };
}

export const authoringWatchers = createAuthoringWatchers();
