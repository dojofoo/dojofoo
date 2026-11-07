import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@dojofoo/harness/client";
import { startEve } from "@dojofoo/harness/api/fixtures";
import type { SessionLifecycle } from "@dojofoo/harness/api";
import { hostPortServer } from "../host-port";
import type { CheckObservation } from "../lesson/service";
import { dropHeld, offerCheckReport } from "./check-reports";
import { readRecords, saveRecord } from "./records";
import { kataWorkspace, removeRoots } from "./test-kata.fixture";

let eve: Awaited<ReturnType<typeof startEve>>;
beforeAll(async () => { eve = await startEve(); }, 120_000);
afterAll(async () => { await eve?.close(); }, 60_000);
const roots: string[] = [];
const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  removeRoots(roots);
});

const observation = (id: string): CheckObservation => ({ id, attempt: 1, codeChanged: true, diff: "+ export const answer = 1;",
  report: { passed: 0, failed: 1, skipped: 0, total: 1, complete: false, tests: [{ name: "answers", suite: [], status: "failed", failureMessages: ["expected 42"] }] } });
const network = globalThis.fetch;
/** The report POSTs the UI server sends to the Eve host */
function watchReports() {
  const sent: Array<{ url: string; body: { message: string; idempotencyKey: string; turnPolicy?: string } }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    if (request.method === "POST" && /\/eve\/v1\/session\/[^/]+$/u.test(new URL(request.url).pathname)) {
      const body = JSON.parse(await request.clone().text());
      if (String(body.message).startsWith("[dojo:check]")) sent.push({ url: request.url, body });
    }
    return network(request);
  });
  return sent;
}

async function setup() {
  const workspace = kataWorkspace(roots, eve);
  cleanups.push(workspace.cleanup);
  // Starts the fixture host, which registers its secret and get-or-create with the host port
  await workspace.local.connect(workspace.workspaceId, { agent: "codex", persona: "sensei" });
  const target = { path: workspace.root, workspaceId: workspace.workspaceId };
  const session = async (lifecycle: Partial<SessionLifecycle> = {}) => {
    const { session: created } = await new Client({ baseUrl: eve.baseUrl }).sessions.create();
    const record = workspace.record({ id: created.id, lifecycle: { status: "idle", updatedAt: new Date().toISOString(), ...lifecycle } });
    await saveRecord(workspace.root, record);
    return record;
  };
  const lifecycleOf = async (id: string) => (await readRecords(workspace.root)).find(record => record.id === id)?.lifecycle;
  const cards = () => workspace.messages.filter(entry => entry.message.method === "lesson.check.report").map(entry => entry.message.params);
  return { ...workspace, target, session, lifecycleOf, cards };
}

describe("check reports", () => {
  it("a report is sent with turnPolicy queue and its own idempotency key when idle", async () => {
    const { local, target, session, lifecycleOf, cards } = await setup();
    const record = await session();
    const sent = watchReports();
    expect(await offerCheckReport(local, target, "starter", "001-first", observation("obs-1"))).toBe("sent");
    // A bodyless create may answer 409 session_not_ready first; every retry keeps the key
    expect(new Set(sent.map(entry => entry.body.idempotencyKey))).toEqual(new Set([`check:${record.id}:obs-1`]));
    expect(sent[0]!.body).toMatchObject({ idempotencyKey: `check:${record.id}:obs-1`, turnPolicy: "queue" });
    expect(sent[0]!.body.message).toMatch(/^\[dojo:check\] Ran lesson checks\.\n\n\{"instruction":/u);
    expect(JSON.parse(sent[0]!.body.message.split("\n\n")[1]!)).toMatchObject({ attempt: 1, codeChanged: true, report: { failed: 1 } });
    expect((await lifecycleOf(record.id))?.sentReport).toMatchObject({ observationId: "obs-1", deliveryId: expect.any(String) });
    expect(cards()).toEqual([{ observationId: "obs-1", state: "sent" }]);
  }, 60_000);

  it("held while working, paused or a begin is pending, and sent after the settle answer", async () => {
    const { local, target, session, lifecycleOf, cards, workspaceId, secret } = await setup();
    const working = await session({ status: "working" });
    const paused = await session({ status: "paused", turnId: "t-paused" });
    await saveRecord(target.path, { ...paused, lessonId: "002-second" });
    const sent = watchReports();
    const offer = async (lessonId: string, id: string, sessionId: string) => {
      expect(await offerCheckReport(local, target, "starter", lessonId, observation(id))).toBe("held");
      expect((await lifecycleOf(sessionId))?.heldReport).toMatchObject({ observationId: id, text: expect.stringMatching(/^\[dojo:check\] /u) });
    };
    await offer("001-first", "obs-w", working.id);
    await offer("002-second", "obs-p", paused.id);
    // Idle, but its begin has not settled (decision 31)
    await saveRecord(target.path, { ...paused, lessonId: "002-second", lifecycle: { status: "idle", updatedAt: new Date().toISOString(),
      beginPending: { idempotencyKey: `begin:${paused.id}:0`, sentAt: new Date().toISOString(), attempt: 0 } } });
    await offer("002-second", "obs-b", paused.id);
    expect(sent).toEqual([]);
    expect(cards().map(card => (card as { state: string }).state)).toEqual(["held", "held", "held"]);
    // The settle's answer goes first; the held report only once its body has been read
    const response = await hostPortServer(new Request(`http://127.0.0.1/api/host-port/${encodeURIComponent(workspaceId)}/sensei/turn.settled`, {
      method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({ sessionId: working.id, idempotencyKey: `${working.id}:t1:settled`, input: { turnId: "t1", outcome: "completed" } }),
    }));
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(sent).toEqual([]);
    expect(await response.json()).toEqual({ result: { ok: true } });
    await vi.waitFor(() => expect(sent.map(entry => entry.body.idempotencyKey)).toEqual([`check:${working.id}:obs-w`]), { timeout: 10_000 });
    await vi.waitFor(async () => expect((await lifecycleOf(working.id))?.sentReport?.observationId).toBe("obs-w"));
    expect((await lifecycleOf(working.id))?.heldReport).toBeUndefined();
  }, 60_000);

  it("dropped on a save and on session.ended", async () => {
    const { local, target, session, lifecycleOf, cards, call } = await setup();
    const record = await session({ status: "working" });
    await offerCheckReport(local, target, "starter", "001-first", observation("obs-save"));
    expect(await dropHeld(target.path, target.workspaceId, record.id)).toBe("obs-save");
    expect((await lifecycleOf(record.id))?.heldReport).toBeUndefined();
    await offerCheckReport(local, target, "starter", "001-first", observation("obs-end"));
    await call("session.ended", record.id, { outcome: "completed" });
    expect((await lifecycleOf(record.id))?.heldReport).toBeUndefined();
    expect(cards()).toEqual([
      { observationId: "obs-save", state: "held" }, { observationId: "obs-save", state: "dropped" },
      { observationId: "obs-end", state: "held" }, { observationId: "obs-end", state: "dropped" },
    ]);
    // With no usable conversation the card says Sensei hasn't seen it
    expect(await offerCheckReport(local, target, "starter", "001-first", observation("obs-none"))).toBe("dropped");
  }, 60_000);

  it("seen on delivery.consumed", async () => {
    const { local, target, session, lifecycleOf, cards, call } = await setup();
    const record = await session();
    await offerCheckReport(local, target, "starter", "001-first", observation("obs-seen"));
    const { deliveryId } = (await lifecycleOf(record.id))!.sentReport!;
    await call("delivery.consumed", record.id, { deliveryId: "another-delivery" });
    expect((await lifecycleOf(record.id))?.sentReport?.seenAt).toBeUndefined();
    await call("delivery.consumed", record.id, { deliveryId });
    expect((await lifecycleOf(record.id))?.sentReport?.seenAt).toEqual(expect.any(String));
    expect(cards().at(-1)).toEqual({ observationId: "obs-seen", state: "seen" });
  }, 60_000);

  it("a settle with resumeFailedAt replaces the session once, sends session.replaced and moves the held report to the replacement", async () => {
    const { target, session, call, messages } = await setup();
    const old = await session({ status: "working", resumeFailedAt: new Date().toISOString(),
      heldReport: { observationId: "obs-moved", text: "[dojo:check] Ran lesson checks.\n\n{}", heldAt: new Date().toISOString() } });
    await call("turn.settled", old.id, { turnId: "t1", outcome: "failed" });
    // The old record names its replacement before the held report moves there, so wait for the move itself
    await vi.waitFor(async () => {
      const current = await readRecords(target.path);
      const next = current.find(record => record.id === current.find(item => item.id === old.id)?.replacedBy);
      expect(next).toMatchObject({ courseId: "starter", lessonId: "001-first", lifecycle: { heldReport: { observationId: "obs-moved" } } });
    }, { timeout: 30_000 });
    const records = await readRecords(target.path);
    const replacedBy = records.find(record => record.id === old.id)!.replacedBy!;
    expect(records.find(record => record.id === old.id)?.lifecycle?.heldReport).toBeUndefined();
    await vi.waitFor(() => expect(messages.filter(entry => entry.message.method === "session.replaced").map(entry => entry.message.params))
      .toEqual([{ from: old.id, to: replacedBy }]));
    // A second settle of the old session finds the same replacement
    await call("turn.settled", old.id, { turnId: "t2", outcome: "failed" });
    await new Promise(resolve => setTimeout(resolve, 200));
    expect((await readRecords(target.path)).filter(record => record.courseId === "starter" && record.lessonId === "001-first" && record.id !== old.id)).toHaveLength(1);
  }, 60_000);
});
