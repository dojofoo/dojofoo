import type { AgentId, Persona } from "@dojofoo/protocol";
import { defineHook, type HookDefinition } from "eve/hooks";
import { evictHarnessSession } from "./harness-sessions.js";
import { createHostPortClient } from "./host-port/client.js";
import { removeReadOnlyHome } from "./read-only.js";

export const lifecycleHookSlug = "dojofoo-lifecycle";

/** Where a persona host reports its lifecycle: the UI server's host port, with this start's secret. */
export interface HostPortBinding {
  url: string;
  workspaceId: string;
  persona: Persona;
  secret: string;
  /** A read-only persona's coding agent and state directory, so a per-session private home (Grok's) goes with its session */
  readOnly?: { agent: AgentId; stateDirectory: string };
}

type Data = Record<string, unknown>;
const record = (value: unknown): Data => (value && typeof value === "object" ? value as Data : {});
const failure = (value: unknown) => {
  const error = record(value);
  if (!Object.keys(error).length) return undefined;
  return { ...(typeof error.code === "string" ? { code: error.code } : {}), message: typeof error.message === "string" ? error.message : "The turn failed.",
    ...(typeof error.id === "string" ? { id: error.id } : {}) };
};

/** The hook's handlers, apart from Eve's definition, so tests can call them with a fake context. */
export function lifecycleHandlers(binding: () => Promise<HostPortBinding | undefined>) {
  const report = async (method: string, sessionId: string, input: unknown, key: string) => {
    const bound = await binding();
    if (!bound) return;
    await createHostPortClient(bound).call(method, sessionId, input, key);
  };
  // Optional reporting never fails the turn
  const guarded = (name: string, run: () => Promise<void>) => run().catch(error => {
    console.warn(`dojofoo lifecycle hook: ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  return {
    async "turn.paused"(event: { data: unknown }, ctx: { session: { id: string } }) {
      const data = record(event.data);
      const turnId = String(data.turnId ?? "");
      const awaiting = (Array.isArray(data.awaiting) ? data.awaiting : []).map(entry => String(record(entry).interactionId ?? entry));
      await guarded("turn.paused", () => report("turn.paused", ctx.session.id, { turnId, awaiting }, `${ctx.session.id}:${turnId}:paused:${awaiting.join(",")}`));
    },
    async "turn.settled"(event: { data: unknown }, ctx: { session: { id: string } }) {
      const data = record(event.data);
      const turnId = String(data.turnId ?? "");
      const outcome = data.outcome === "failed" || data.outcome === "cancelled" ? data.outcome : "completed";
      // A cancelled or failed turn leaves its native processes parked; evict them before anyone reads the outcome
      if (outcome !== "completed") await guarded("eviction", async () => { await evictHarnessSession(ctx.session.id); });
      const error = failure(data.error);
      await guarded("turn.settled", () => report("turn.settled", ctx.session.id, { turnId, outcome, ...(error ? { error } : {}) }, `${ctx.session.id}:${turnId}:settled`));
    },
    async "session.ended"(event: { data: unknown }, ctx: { session: { id: string } }) {
      const data = record(event.data);
      await guarded("eviction", async () => { await evictHarnessSession(ctx.session.id); });
      const error = failure(data.error);
      await guarded("session.ended", () => report("session.ended", ctx.session.id,
        { outcome: data.outcome === "failed" ? "failed" : "completed", ...(error ? { error } : {}) }, `${ctx.session.id}:ended`));
      await guarded("private home", async () => {
        const readOnly = (await binding())?.readOnly;
        if (readOnly) await removeReadOnlyHome(readOnly.agent, { stateDirectory: readOnly.stateDirectory, eveSessionId: ctx.session.id });
      });
    },
  };
}

/** An Eve hook for every persona host: reports turn.paused/settled and session.ended to the host port, evicting first when a turn
 *  settles cancelled or failed or the session ends. Catches and logs its own errors. Without a binding it only evicts. */
export function createLifecycleHook(binding: () => Promise<HostPortBinding | undefined>): HookDefinition {
  return defineHook({ events: lifecycleHandlers(binding) }) as HookDefinition;
}
