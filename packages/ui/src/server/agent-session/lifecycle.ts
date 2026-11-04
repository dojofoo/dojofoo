import type { LifecycleStatus, SessionRecord } from "@dojofoo/agent-api";
import { updateRecord } from "./records";

/** What moves a session's lifecycle in step 4 (the design's table without the guard, held reports, leave and switch rows). */
export type LifecycleEvent =
  | { type: "pre-delivery" }
  | { type: "delivery-rejected"; before: LifecycleStatus }
  | { type: "turn.paused"; turnId: string }
  | { type: "turn.settled" }
  | { type: "session.ended" }
  | { type: "resume.failed" }
  /** The host became ready and Eve has no open turn for a working or paused record; a pending begin stays for the next open */
  | { type: "reconcile" };

const statusOf = (record: SessionRecord): LifecycleStatus => record.lifecycle?.status ?? "idle";

/** One transition; anything a row does not name leaves the record as it is. */
export function transition(record: SessionRecord, event: LifecycleEvent, now = new Date().toISOString()): SessionRecord {
  const current = record.lifecycle ?? { status: "idle" as const, updatedAt: now };
  const status = statusOf(record);
  const settled = () => {
    const { turnId: _turnId, beginPending: _beginPending, ...rest } = current;
    return { ...record, lifecycle: { ...rest, status: "idle" as const, updatedAt: now } };
  };
  switch (event.type) {
    case "pre-delivery":
      return status === "idle" || status === "paused" ? { ...record, lifecycle: { ...current, status: "working", updatedAt: now } } : record;
    case "delivery-rejected":
      return status === "working" ? { ...record, lifecycle: { ...current, status: event.before, updatedAt: now } } : record;
    case "turn.paused":
      return status === "working" ? { ...record, lifecycle: { ...current, status: "paused", turnId: event.turnId, updatedAt: now } } : record;
    case "turn.settled":
      return status === "working" || status === "paused" || current.beginPending ? settled() : record;
    case "session.ended":
      return { ...settled(), endedAt: record.endedAt ?? now };
    case "resume.failed":
      return { ...record, lifecycle: { ...current, resumeFailedAt: current.resumeFailedAt ?? now, updatedAt: now } };
    case "reconcile": {
      if (status !== "working" && status !== "paused") return record;
      // A begin left pending may never have reached Eve; the next open resends it with the same key, which Eve answers once
      const { turnId: _turnId, ...rest } = current;
      return { ...record, lifecycle: { ...rest, status: "idle", updatedAt: now } };
    }
  }
}

/** Applies one transition through the record store's write queue. A record that no longer exists is left alone. */
export async function applyLifecycle(path: string, sessionId: string, event: LifecycleEvent): Promise<SessionRecord | undefined> {
  try { return await updateRecord(path, sessionId, record => transition(record, event)); }
  catch (error) {
    if ((error as { code?: unknown }).code === "session_not_found") return undefined;
    throw error;
  }
}

/** Pre-delivery: the status before is the handle a rejected delivery restores. */
export async function beforeDelivery(path: string, sessionId: string): Promise<LifecycleStatus> {
  let before: LifecycleStatus = "idle";
  await updateRecord(path, sessionId, record => {
    before = statusOf(record);
    return transition(record, { type: "pre-delivery" });
  }).catch(error => { if ((error as { code?: unknown }).code !== "session_not_found") throw error; });
  return before;
}

export async function afterDelivery(path: string, sessionId: string, handle: unknown, status: number): Promise<void> {
  if (status >= 200 && status < 300) return;
  const before = handle === "idle" || handle === "working" || handle === "paused" || handle === "interrupted" ? handle : "idle";
  await applyLifecycle(path, sessionId, { type: "delivery-rejected", before });
}
