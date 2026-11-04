import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { firstMessageOf, type SessionLifecycle, type SessionRecord } from "@dojofoo/agent/api";
import { afterDelivery, beforeDelivery, transition } from "./lifecycle";
import { readRecords, saveRecord } from "./records";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const at = "2026-11-04T00:00:01.000Z";
const record = (lifecycle?: Partial<SessionLifecycle>): SessionRecord => ({
  id: "s1", agent: "opencode", persona: "sensei", createdAt: "2026-11-04T00:00:00.000Z", revision: 0,
  ...(lifecycle ? { lifecycle: { status: "idle", updatedAt: "2026-11-04T00:00:00.000Z", ...lifecycle } } : {}),
});

describe("session lifecycle", () => {
  it("pre-delivery: idle and paused become working", () => {
    expect(transition(record(), { type: "pre-delivery" }, at).lifecycle).toEqual({ status: "working", updatedAt: at });
    expect(transition(record({ status: "paused", turnId: "t1" }), { type: "pre-delivery" }, at).lifecycle).toMatchObject({ status: "working", turnId: "t1" });
  });

  it("delivery answered non-2xx: working returns to the status before", () => {
    expect(transition(record({ status: "working" }), { type: "delivery-rejected", before: "paused" }, at).lifecycle).toMatchObject({ status: "paused" });
    expect(transition(record({ status: "idle" }), { type: "delivery-rejected", before: "paused" }, at).lifecycle).toMatchObject({ status: "idle" });
  });

  it("turn.paused: working becomes paused with its turn", () => {
    expect(transition(record({ status: "working" }), { type: "turn.paused", turnId: "turn_3" }, at).lifecycle).toEqual({ status: "paused", turnId: "turn_3", updatedAt: at });
  });

  it("turn.settled: working and paused become idle, clearing the turn and the pending begin", () => {
    for (const status of ["working", "paused"] as const) {
      expect(transition(record({ status, turnId: "t1", beginPending: { idempotencyKey: "begin:s1:0", sentAt: at } }), { type: "turn.settled" }, at).lifecycle)
        .toEqual({ status: "idle", updatedAt: at });
    }
  });

  it("session.ended: any status becomes idle, with endedAt", () => {
    for (const status of ["idle", "working", "paused"] as const) {
      const ended = transition(record({ status }), { type: "session.ended" }, at);
      expect(ended).toMatchObject({ endedAt: at, lifecycle: { status: "idle" } });
    }
  });

  it("resume.failed: the status stays and resumeFailedAt marks the record unusable", () => {
    expect(transition(record({ status: "working" }), { type: "resume.failed" }, at).lifecycle).toEqual({ status: "working", resumeFailedAt: at, updatedAt: at });
  });

  it("host ready, reconcile: working and paused without an open turn become idle, keeping a pending begin for the next open", () => {
    expect(transition(record({ status: "paused", turnId: "t1" }), { type: "reconcile" }, at).lifecycle).toEqual({ status: "idle", updatedAt: at });
    expect(transition(record({ status: "working", beginPending: { idempotencyKey: "begin:s1:0", sentAt: at } }), { type: "reconcile" }, at).lifecycle)
      .toEqual({ status: "idle", beginPending: { idempotencyKey: "begin:s1:0", sentAt: at }, updatedAt: at });
    expect(transition(record({ status: "idle" }), { type: "reconcile" }, at).lifecycle).toMatchObject({ status: "idle", updatedAt: "2026-11-04T00:00:00.000Z" });
  });

  it("pre-delivery: an interrupted conversation continues, clearing interruptedAt but keeping its interrupted turn", () => {
    expect(transition(record({ status: "interrupted", interruptedAt: at, interruptedTurnId: "t1" }), { type: "pre-delivery" }, at).lifecycle)
      .toEqual({ status: "working", interruptedTurnId: "t1", updatedAt: at });
  });

  it("turn.settled: an interrupted record stays interrupted", () => {
    const interrupted = record({ status: "interrupted", interruptedAt: at, interruptedTurnId: "t1" });
    expect(transition(interrupted, { type: "turn.settled", outcome: "failed" }, at)).toBe(interrupted);
  });

  it("turn.settled: a begin cancelled after a leave keeps beginPending; any other settle clears it", () => {
    const begin = { idempotencyKey: "begin:s1:0", sentAt: at, attempt: 0, cancelledAt: at };
    expect(transition(record({ status: "working", beginPending: begin }), { type: "turn.settled", outcome: "cancelled" }, at).lifecycle)
      .toEqual({ status: "idle", beginPending: begin, updatedAt: at });
    expect(transition(record({ status: "working", beginPending: begin }), { type: "turn.settled", outcome: "completed" }, at).lifecycle).toEqual({ status: "idle", updatedAt: at });
    expect(transition(record({ status: "working", beginPending: { idempotencyKey: "begin:s1:0", sentAt: at } }), { type: "turn.settled", outcome: "cancelled" }, at).lifecycle)
      .toEqual({ status: "idle", updatedAt: at });
  });

  it("session.ended drops a held report", () => {
    expect(transition(record({ status: "working", heldReport: { observationId: "o1", text: "[dojo:check] Ran lesson checks.", heldAt: at } }), { type: "session.ended" }, at).lifecycle)
      .toEqual({ status: "idle", updatedAt: at });
  });

  it("leave: a paused turn or a working begin drops its held report; a begin is marked cancelled; the status waits for the settle", () => {
    const held = { observationId: "o1", text: "report", heldAt: at };
    expect(transition(record({ status: "paused", turnId: "t1", heldReport: held }), { type: "leave" }, at).lifecycle).toEqual({ status: "paused", turnId: "t1", updatedAt: at });
    expect(transition(record({ status: "working", beginPending: { idempotencyKey: "begin:s1:0", sentAt: at, attempt: 0 } }), { type: "leave" }, at).lifecycle)
      .toEqual({ status: "working", beginPending: { idempotencyKey: "begin:s1:0", sentAt: at, attempt: 0, cancelledAt: at }, updatedAt: at });
    const working = record({ status: "working", heldReport: held });
    expect(transition(working, { type: "leave" }, at)).toBe(working);
  });

  it("switch-timeout: a working or paused turn becomes interrupted with its turn id", () => {
    expect(transition(record({ status: "working" }), { type: "switch-timeout", turnId: "t9" }, at).lifecycle).toEqual({ status: "interrupted", interruptedAt: at, interruptedTurnId: "t9", updatedAt: at });
    expect(transition(record({ status: "paused", turnId: "t2" }), { type: "switch-timeout" }, at).lifecycle).toMatchObject({ status: "interrupted", interruptedTurnId: "t2" });
    const idle = record({ status: "idle" });
    expect(transition(idle, { type: "switch-timeout", turnId: "t9" }, at)).toBe(idle);
  });

  it("report-held, report-sent, report-seen and report-dropped keep the status and move the report fields", () => {
    const held = transition(record({ status: "working" }), { type: "report-held", observationId: "o1", text: "report" }, at);
    expect(held.lifecycle).toEqual({ status: "working", heldReport: { observationId: "o1", text: "report", heldAt: at }, updatedAt: at });
    expect(transition(held, { type: "report-dropped" }, at).lifecycle).toEqual({ status: "working", updatedAt: at });
    const sent = transition(held, { type: "report-sent", observationId: "o1", deliveryId: "d1" }, at);
    expect(sent.lifecycle).toEqual({ status: "working", sentReport: { observationId: "o1", deliveryId: "d1", sentAt: at }, updatedAt: at });
    expect(transition(sent, { type: "report-seen", deliveryId: "d1" }, at).lifecycle?.sentReport).toEqual({ observationId: "o1", deliveryId: "d1", sentAt: at, seenAt: at });
    expect(transition(sent, { type: "report-seen", deliveryId: "other" }, at)).toBe(sent);
    // A context read of the held report's check sees it and drops it
    expect(transition(held, { type: "report-seen", observationId: "o1" }, at).lifecycle).toEqual({ status: "working", updatedAt: at });
  });

  it("a rejected delivery restores the status before it", async () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-lifecycle-"));
    roots.push(root);
    await saveRecord(root, record({ status: "paused", turnId: "turn_1" }));
    const handle = await beforeDelivery(root, "s1");
    expect(handle).toBe("paused");
    expect((await readRecords(root))[0]?.lifecycle).toMatchObject({ status: "working" });
    await afterDelivery(root, "s1", handle, 409);
    expect((await readRecords(root))[0]?.lifecycle).toMatchObject({ status: "paused", turnId: "turn_1" });
    // An accepted delivery stays working until its turn reports
    await afterDelivery(root, "s1", await beforeDelivery(root, "s1"), 202);
    expect((await readRecords(root))[0]?.lifecycle).toMatchObject({ status: "working" });
  });

  it("the first untagged message is kept as firstMessage, at most 80 characters including the ellipsis; tagged turns are skipped; a later message does not replace it", async () => {
    const root = mkdtempSync(join(tmpdir(), "dojo-lifecycle-"));
    roots.push(root);
    await saveRecord(root, record());
    const first = async () => (await readRecords(root))[0]?.firstMessage;
    await beforeDelivery(root, "s1");
    await beforeDelivery(root, "s1", { kind: "message", text: "[dojo:begin] Begin the lesson." });
    await beforeDelivery(root, "s1", { kind: "answer" });
    expect(await first()).toBeUndefined();
    const long = `Outline   a course\n about ${"recursion ".repeat(12)}`;
    await beforeDelivery(root, "s1", { kind: "message", text: long });
    const kept = await first();
    expect(kept).toBe("Outline a course about recursion recursion recursion recursion recursion…");
    expect(kept!.length).toBeLessThanOrEqual(80);
    expect(long.replace(/\s+/gu, " ").startsWith(kept!.slice(0, -1))).toBe(true);
    await beforeDelivery(root, "s1", { kind: "message", text: "Something else" });
    expect(await first()).toBe(kept);
    expect(firstMessageOf("  Short one.  ")).toBe("Short one.");
    expect(firstMessageOf("   ")).toBeUndefined();
  });
});
