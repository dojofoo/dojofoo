import { readFileSync, writeFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@dojofoo/agent/client";
import { startEve } from "@dojofoo/agent-api/fixtures";
import type { EveDelivery } from "@dojofoo/agent-api";
import { registerHost } from "../host-port";
import { writeSolution } from "../lesson/service";
import { sendServerTurn } from "./check-reports";
import { guardFor, takeNotices } from "./guard-store";
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
const message: EveDelivery = { kind: "message", text: "Hello Sensei" };

function setup() {
  const workspace = kataWorkspace(roots, eve);
  cleanups.push(workspace.cleanup);
  registerHost(workspace.workspaceId, "sensei", { secret: workspace.secret, endpoint: { baseUrl: eve.baseUrl } });
  const deliveries = workspace.local.deliveries!;
  const windows = () => guardFor(workspace.root).list();
  return { ...workspace, deliveries, windows };
}

describe("the write guard", () => {
  it("a message to a kata session opens one window per turn and a steering message reuses it", async () => {
    const { root, workspaceId, deliveries, record, windows, call } = setup();
    const session = record();
    await saveRecord(root, session);
    const first = await deliveries.before(workspaceId, session, message) as { opened?: string };
    const steering = await deliveries.before(workspaceId, session, message) as { opened?: string };
    expect(first.opened).toEqual(expect.any(String));
    expect(steering.opened).toBeUndefined();
    await deliveries.after(workspaceId, session, message, { handle: steering, status: 202 });
    await deliveries.after(workspaceId, session, message, { handle: first, status: 202 });
    expect((await windows()).map(window => window.id)).toEqual([first.opened]);
    expect((await call("turn.settled", session.id, { turnId: "t1", outcome: "completed" })).status).toBe(200);
    expect(await windows()).toEqual([]);
    const next = await deliveries.before(workspaceId, session, message) as { opened?: string };
    expect(next.opened).toEqual(expect.any(String));
    expect(next.opened).not.toBe(first.opened);
  });

  it("a rejected delivery discards the window it opened, not one it joined", async () => {
    const { root, workspaceId, deliveries, record, windows } = setup();
    const session = record();
    await saveRecord(root, session);
    const first = await deliveries.before(workspaceId, session, message) as { opened?: string };
    const joined = await deliveries.before(workspaceId, session, message);
    await deliveries.after(workspaceId, session, message, { handle: joined, status: 409 });
    expect((await windows()).map(window => window.id)).toEqual([first.opened]);
    await deliveries.after(workspaceId, session, message, { handle: first, status: 409 });
    expect(await windows()).toEqual([]);
    expect((await readRecords(root))[0]?.lifecycle?.status).toBe("idle");
  });

  it("the settle verify restores a native write and reports the violation", async () => {
    const { root, workspaceId, deliveries, record, file, call, messages } = setup();
    const session = record();
    await saveRecord(root, session);
    await deliveries.before(workspaceId, session, message);
    writeFileSync(file, "native write\n");
    await call("turn.settled", session.id, { turnId: "t1", outcome: "completed" });
    expect(readFileSync(file, "utf8")).toBe("export const answer = 0;\n");
    const violation = messages.find(entry => entry.message.method === "guard.violation");
    expect(violation?.key).toEqual({ workspaceId, courseId: "starter", lessonId: "001-first" });
    expect(violation?.message.params).toMatchObject({ sessionId: session.id, turnId: "t1", courseId: "starter", lessonId: "001-first",
      paths: ["katas/001-first/solution.ts"], action: "restored", quarantined: expect.any(String) });
    expect(readFileSync((violation!.message.params as { quarantined: string }).quarantined, "utf8")).toBe("native write\n");
    // With no socket open, the violation waits as a notice for the lesson's next open
    const { setPageSink } = await import("./notify");
    setPageSink(() => false);
    await deliveries.before(workspaceId, session, message);
    writeFileSync(file, "second native write\n");
    await call("turn.settled", session.id, { turnId: "t2", outcome: "completed" });
    expect((await takeNotices(root, "starter", "001-first")).map(notice => notice.violation.turnId)).toEqual(["t2"]);
    expect(await takeNotices(root, "starter", "001-first")).toEqual([]);
  });

  it("a learner save through writeSolution while the turn works is kept", async () => {
    const { root, workspaceId, deliveries, record, file, call, messages } = setup();
    const session = record();
    await saveRecord(root, session);
    await deliveries.before(workspaceId, session, message);
    await writeSolution(root, "starter", "001-first", "export const answer = 42;\n");
    await call("turn.settled", session.id, { turnId: "t1", outcome: "completed" });
    expect(readFileSync(file, "utf8")).toBe("export const answer = 42;\n");
    expect(messages.some(entry => entry.message.method === "guard.violation")).toBe(false);
  });

  it("interactive and Kyoshi sessions get no window", async () => {
    const { root, workspaceId, deliveries, record, windows } = setup();
    const interactive = record({ courseId: "tour", lessonId: undefined });
    const kyoshi = record({ persona: "kyoshi" });
    const noLesson = record({ lessonId: undefined });
    for (const session of [interactive, kyoshi, noLesson]) {
      await saveRecord(root, session);
      expect(await deliveries.before(workspaceId, session, message)).not.toHaveProperty("opened");
    }
    expect(await windows()).toEqual([]);
  });

  it("a native write during a check-report turn is restored", async () => {
    const { root, workspaceId, record, file, call, windows } = setup();
    const { session: eveSession } = await new Client({ baseUrl: eve.baseUrl }).sessions.create();
    const session = record({ id: eveSession.id });
    await saveRecord(root, session);
    const deliveryId = await sendServerTurn(root, workspaceId, { baseUrl: eve.baseUrl }, session, {
      text: "[dojo:check] Ran lesson checks.\n\n{}", idempotencyKey: `check:${session.id}:o1`, turnPolicy: "queue" });
    expect(deliveryId).toEqual(expect.any(String));
    expect(await windows()).toHaveLength(1);
    expect((await readRecords(root))[0]?.lifecycle?.status).toBe("working");
    writeFileSync(file, "written during the report\n");
    await call("turn.settled", session.id, { turnId: "t1", outcome: "completed" });
    expect(readFileSync(file, "utf8")).toBe("export const answer = 0;\n");
  }, 60_000);

  it("a write after the pause verify is not restored and is logged", async () => {
    const { root, workspaceId, deliveries, record, file, call, windows } = setup();
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const session = record();
    await saveRecord(root, session);
    await deliveries.before(workspaceId, session, message);
    await call("turn.paused", session.id, { turnId: "t1", awaiting: ["q1"] });
    expect(await windows()).toEqual([]);
    expect(info).toHaveBeenCalledWith(expect.stringContaining("a write before the answer is not checked"));
    writeFileSync(file, "written while parked\n");
    await call("turn.settled", session.id, { turnId: "t1", outcome: "completed" });
    expect(readFileSync(file, "utf8")).toBe("written while parked\n");
  });
});
