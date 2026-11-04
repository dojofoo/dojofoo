import { firstMessageOf, type EveDelivery, type LifecycleStatus, type SessionLifecycle, type SessionRecord } from "@dojofoo/agent/api";
import { updateRecord } from "./records";

export type TurnOutcome = "completed" | "failed" | "cancelled";
/** What moves a session's lifecycle (design, "Session lifecycle"; step-5 plan, "Lifecycle"). */
export type LifecycleEvent =
  | { type: "pre-delivery" }
  | { type: "delivery-rejected"; before: LifecycleStatus }
  | { type: "turn.paused"; turnId: string }
  | { type: "turn.settled"; outcome?: TurnOutcome }
  | { type: "session.ended" }
  | { type: "resume.failed" }
  /** The host became ready and Eve has no open turn for a working or paused record; a pending begin stays for the next open */
  | { type: "reconcile" }
  /** D19: the page was left while its turn was paused, or its begin still working; the caller sends Eve's cancel after this */
  | { type: "leave" }
  /** An agent switch did not see this turn settle in time (CUJ 3) */
  | { type: "switch-timeout"; turnId?: string }
  | { type: "report-held"; observationId: string; text: string }
  | { type: "report-sent"; observationId: string; deliveryId?: string }
  | { type: "report-seen"; observationId?: string; deliveryId?: string }
  | { type: "report-dropped" };

const statusOf = (record: SessionRecord): LifecycleStatus => record.lifecycle?.status ?? "idle";
const without = <K extends keyof SessionLifecycle>(lifecycle: SessionLifecycle, ...keys: K[]): SessionLifecycle => {
  const copy = { ...lifecycle };
  for (const key of keys) delete copy[key];
  return copy;
};

/** One transition; anything a row does not name leaves the record as it is. */
export function transition(record: SessionRecord, event: LifecycleEvent, now = new Date().toISOString()): SessionRecord {
  const current: SessionLifecycle = record.lifecycle ?? { status: "idle", updatedAt: now };
  const status = statusOf(record);
  const next = (lifecycle: SessionLifecycle): SessionRecord => ({ ...record, lifecycle: { ...lifecycle, updatedAt: now } });
  switch (event.type) {
    case "pre-delivery":
      // A delivery continues an interrupted conversation; its interrupted turn stays refused (turn.check)
      return status === "idle" || status === "paused" || status === "interrupted"
        ? next({ ...without(current, "interruptedAt"), status: "working" }) : record;
    case "delivery-rejected":
      return status === "working" ? next({ ...current, status: event.before }) : record;
    case "turn.paused":
      return status === "working" ? next({ ...current, status: "paused", turnId: event.turnId }) : record;
    case "turn.settled": {
      if (status === "interrupted") return record;
      if (status !== "working" && status !== "paused" && !current.beginPending) return record;
      // A begin a leave cancelled stays pending, so the next open resends it with a new key (D29)
      const keepBegin = event.outcome === "cancelled" && current.beginPending?.cancelledAt;
      return next({ ...(keepBegin ? without(current, "turnId") : without(current, "turnId", "beginPending")), status: "idle" });
    }
    case "session.ended":
      return { ...next({ ...without(current, "turnId", "beginPending", "heldReport"), status: "idle" }), endedAt: record.endedAt ?? now };
    case "resume.failed":
      return next({ ...current, resumeFailedAt: current.resumeFailedAt ?? now });
    case "reconcile":
      if (status !== "working" && status !== "paused") return record;
      // A begin left pending may never have reached Eve; the next open resends it with the same key, which Eve answers once
      return next({ ...without(current, "turnId"), status: "idle" });
    case "leave": {
      if (!(status === "paused" || (status === "working" && current.beginPending))) return record;
      const dropped = without(current, "heldReport");
      return next(current.beginPending ? { ...dropped, beginPending: { ...current.beginPending, cancelledAt: current.beginPending.cancelledAt ?? now } } : dropped);
    }
    case "switch-timeout": {
      if (status !== "working" && status !== "paused") return record;
      const interruptedTurnId = event.turnId ?? current.turnId;
      return next({ ...current, status: "interrupted", interruptedAt: now, ...(interruptedTurnId ? { interruptedTurnId } : {}) });
    }
    case "report-held":
      return next({ ...current, heldReport: { observationId: event.observationId, text: event.text, heldAt: now } });
    case "report-sent": {
      const base = current.heldReport?.observationId === event.observationId ? without(current, "heldReport") : current;
      return next({ ...base, sentReport: { observationId: event.observationId, ...(event.deliveryId ? { deliveryId: event.deliveryId } : {}), sentAt: now } });
    }
    case "report-seen": {
      const sent = current.sentReport;
      const matches = Boolean(sent && !sent.seenAt && ((event.deliveryId && sent.deliveryId === event.deliveryId)
        || (event.observationId && sent.observationId === event.observationId)));
      const held = Boolean(event.observationId && current.heldReport?.observationId === event.observationId);
      if (!matches && !held) return record;
      return next({ ...(held ? without(current, "heldReport") : current), ...(matches ? { sentReport: { ...sent!, seenAt: now } } : {}) });
    }
    case "report-dropped":
      return current.heldReport ? next(without(current, "heldReport")) : record;
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

/** Pre-delivery: the status before is the handle a rejected delivery restores. A learner's or author's message (server turns pass
 *  none) also names the conversation once, as its `firstMessage`. */
export async function beforeDelivery(path: string, sessionId: string, delivery?: EveDelivery): Promise<LifecycleStatus> {
  let before: LifecycleStatus = "idle";
  await updateRecord(path, sessionId, record => {
    before = statusOf(record);
    const first = delivery?.kind === "message" && !record.firstMessage ? firstMessageOf(delivery.text) : undefined;
    return transition(first ? { ...record, firstMessage: first } : record, { type: "pre-delivery" });
  }).catch(error => { if ((error as { code?: unknown }).code !== "session_not_found") throw error; });
  return before;
}

/** A non-2xx answer restores the status before; returns the record when it changed. */
export async function afterDelivery(path: string, sessionId: string, handle: unknown, status: number): Promise<SessionRecord | undefined> {
  if (status >= 200 && status < 300) return undefined;
  const before = handle === "idle" || handle === "working" || handle === "paused" || handle === "interrupted" ? handle : "idle";
  return applyLifecycle(path, sessionId, { type: "delivery-rejected", before });
}
