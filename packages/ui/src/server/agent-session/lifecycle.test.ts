import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { SessionLifecycle, SessionRecord } from "@dojofoo/agent-api";
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
});
