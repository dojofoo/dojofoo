import { setTimeout as delay } from "node:timers/promises";
import { dojoTags, type AgentId, type Persona } from "@dojofoo/protocol";
import { defineHook, type HookDefinition } from "eve/hooks";
import { evictHarnessSession } from "./harness-sessions.js";
import { createHostPortClient, HostPortError } from "./host-port/client.js";
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

/** The hook's handlers, apart from Eve's definition, so tests can call them with a fake context. A report the host port did not
 *  take (a timeout, an unreachable server, a 5xx) is retried after each of `retryDelaysMs`: Eve never runs the hook again, and the
 *  host port keeps a report's result per key, so a retry is never applied twice. */
export function lifecycleHandlers(binding: () => Promise<HostPortBinding | undefined>, options: { retryDelaysMs?: readonly number[] } = {}) {
  const retryDelaysMs = options.retryDelaysMs ?? [250, 1_000, 2_000];
  const report = async (method: string, sessionId: string, input: unknown, key: string) => {
    const bound = await binding();
    if (!bound) return;
    const client = createHostPortClient(bound);
    for (let attempt = 0; ; attempt++) {
      try {
        await client.call(method, sessionId, input, key);
        return;
      } catch (error) {
        // A refusal (4xx) would answer the same again
        if (!(error instanceof HostPortError && error.status >= 500) || attempt >= retryDelaysMs.length) throw error;
        await delay(retryDelaysMs[attempt]);
      }
    }
  };
  // Optional reporting never fails the turn
  const guarded = (name: string, run: () => Promise<void>) => run().catch(error => {
    console.warn(`dojofoo lifecycle hook: ${name} failed: ${error instanceof Error ? error.message : String(error)}`);
  });
  return {
    // Only a check report's consumption matters to the UI server (D16), so ordinary messages cost no host-port call
    async "delivery.consumed"(event: { data: unknown }, ctx: { session: { id: string } }) {
      const data = record(event.data);
      const first = (Array.isArray(data.parts) ? data.parts : []).map(record).find(part => part.kind === "text");
      if (typeof first?.text !== "string" || !first.text.startsWith(dojoTags.check)) return;
      const deliveryId = String(data.deliveryId ?? "");
      await guarded("delivery.consumed", () => report("delivery.consumed", ctx.session.id, { deliveryId }, `${ctx.session.id}:${deliveryId}:consumed`));
    },
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

/** An Eve hook for every persona host: reports a check report's delivery.consumed, turn.paused/settled and session.ended to the host port, evicting first when a turn
 *  settles cancelled or failed or the session ends. Catches and logs its own errors. Without a binding it only evicts. */
export function createLifecycleHook(binding: () => Promise<HostPortBinding | undefined>): HookDefinition {
  return defineHook({ events: lifecycleHandlers(binding) }) as HookDefinition;
}
