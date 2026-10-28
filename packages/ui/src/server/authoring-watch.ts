import { realpathSync } from "node:fs";
import { relative, sep } from "node:path";
import { watch } from "chokidar";
import { buildCourseKyoshi } from "@dojofoo/authoring/eve/build";

type Notice = { method: "workspace.changed" } | { method: "workspace.watch.error"; error: string };
type Listener = (notice: Notice) => void;
const ignoredDirectories = new Set([".git", ".dojo", ".pnpm-store", "node_modules", "dist", "coverage"]);
const evaluationReport = /^\.dojo\/evaluations\/run-[^/]+\/report\.json$/u;
const agentDefinition = /^\.dojo\/kyoshi(?:\/|$)/u;

/** One watcher per viewed workspace, shared across tabs; never follows external links. */
export function createAuthoringWatchers(prepareAgent: (root: string) => Promise<void> = buildCourseKyoshi) {
  const entries = new Map<string, { listeners: Set<Listener>; close(): Promise<void>; ready: boolean }>();
  return {
    subscribe(path: string, listener: Listener) {
      const root = realpathSync(path);
      let entry = entries.get(root);
      if (!entry) {
        const listeners = new Set<Listener>();
        let timer: ReturnType<typeof setTimeout> | undefined;
        let pendingAgent = false;
        let preparation = Promise.resolve();
        const notify = (notice: Notice) => { for (const callback of listeners) callback(notice); };
        const flush = () => {
          const prepare = pendingAgent;
          pendingAgent = false;
          notify({ method: "workspace.changed" });
          if (!prepare) return;
          preparation = preparation.then(async () => {
            await prepareAgent(root);
            notify({ method: "workspace.changed" });
          }).catch(error => notify({ method: "workspace.watch.error", error: String(error) }));
        };
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
              if (parts[1] === "kyoshi") return parts.slice(2).some(segment =>
                ignoredDirectories.has(segment) || segment === ".eve" || segment === ".output"
                || segment === "runtime.json" || segment === ".env" || segment.startsWith(".env."));
              return !(parts.length === 1 || (parts[1] === "evaluations" && (
                parts.length === 2 || (parts.length === 3 && parts[2]!.startsWith("run-"))
                || evaluationReport.test(parts.join("/"))
              )));
            }
            return parts.some(segment => ignoredDirectories.has(segment) || segment === ".env" || segment.startsWith(".env."));
          },
        });
        entry = { listeners, ready: false, async close() {
          clearTimeout(timer);
          await watcher.close();
          if (pendingAgent) flush();
          await preparation;
        } };
        const current = entry;
        watcher.on("ready", () => {
          current.ready = true;
          notify({ method: "workspace.changed" });
        });
        watcher.on("all", (_event, path) => {
          const local = relative(root, path).split(sep).join("/");
          if ((local === ".dojo" || local.startsWith(".dojo/")) && !evaluationReport.test(local) && !agentDefinition.test(local)) return;
          pendingAgent ||= agentDefinition.test(local);
          clearTimeout(timer);
          timer = setTimeout(flush, 100);
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
