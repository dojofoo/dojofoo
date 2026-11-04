import { afterEach, describe, expect, it, vi } from "vitest";
import { setWorkspaceKind } from "@dojofoo/config/local-state";
import { presence } from "./presence";
import { readRecords, saveRecord } from "./records";
import { applyLifecycle } from "./lifecycle";
import { kataWorkspace, removeRoots } from "./test-kata.fixture";
import { fakeEve } from "./test-eve.fixture";
import type { SessionLifecycle } from "@dojofoo/agent/api";

const roots: string[] = [];
const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const cleanup of cleanups.splice(0)) await cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  removeRoots(roots);
});

async function setup(options: Parameters<typeof fakeEve>[0] = {}) {
  const eve = await fakeEve(options);
  cleanups.push(eve.close);
  const workspace = kataWorkspace(roots, { baseUrl: eve.url });
  cleanups.push(workspace.cleanup);
  // Leave timers are real 30-second timers, advanced by the test
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
  await workspace.local.connect(workspace.workspaceId, { agent: "codex", persona: "sensei" });
  const page = (courseId: string, lessonId?: string) => ({ workspaceId: workspace.workspaceId, courseId, ...(lessonId ? { lessonId } : {}) });
  let peers = 0;
  const peer = () => ({ id: `peer-${++peers}`, send: vi.fn() });
  const save = async (lifecycle: Partial<SessionLifecycle>, overrides: Parameters<typeof workspace.record>[0] = {}) => {
    const record = workspace.record({ ...overrides, lifecycle: { status: "idle", updatedAt: new Date().toISOString(), ...lifecycle } });
    await saveRecord(workspace.root, record);
    return record;
  };
  const first = page("starter", "001-first");
  return { ...workspace, eve, page, peer, save, first };
}
const settle = () => vi.waitFor(() => undefined);

describe("leaving a page", () => {
  it("a paused question is cancelled 30 s after the lesson's last socket closes", async () => {
    const { eve, peer, save, first } = await setup();
    const paused = await save({ status: "paused", turnId: "turn_7" });
    const tab = peer();
    await presence().join(first, tab);
    presence().part(first, tab);
    await vi.advanceTimersByTimeAsync(29_000);
    expect(eve.cancels).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.waitFor(() => expect(eve.cancels).toEqual([{ sessionId: paused.id, body: { turnId: "turn_7" } }]));
  });

  it("a reconnect within 30 s keeps it", async () => {
    const { eve, peer, save, first } = await setup();
    await save({ status: "paused", turnId: "turn_7" });
    const tab = peer();
    await presence().join(first, tab);
    presence().part(first, tab);
    await vi.advanceTimersByTimeAsync(20_000);
    await presence().join(first, peer());
    await vi.advanceTimersByTimeAsync(40_000);
    await settle();
    expect(eve.cancels).toEqual([]);
  });

  it("two tabs on one lesson count as one page", async () => {
    const { eve, peer, save, first } = await setup();
    await save({ status: "paused", turnId: "turn_7" });
    const [one, two] = [peer(), peer()];
    await presence().join(first, one);
    await presence().join(first, two);
    presence().part(first, one);
    expect(presence().pending(first)).toBe(false);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(eve.cancels).toEqual([]);
    presence().part(first, two);
    expect(presence().pending(first)).toBe(true);
  });

  it("opening another lesson leaves the first at once", async () => {
    const { eve, peer, save, first, page } = await setup();
    const paused = await save({ status: "paused", turnId: "turn_7" });
    await presence().join(first, peer());
    await presence().join(page("starter", "002-second"), peer());
    expect(eve.cancels).toEqual([{ sessionId: paused.id, body: { turnId: "turn_7" } }]);
  });

  it("an interactive course page is left the same way", async () => {
    const { eve, peer, save, first, page } = await setup();
    const tour = await save({ status: "paused", turnId: "turn_3" }, { courseId: "tour", lessonId: undefined });
    await presence().join(page("tour"), peer());
    await presence().join(first, peer());
    expect(eve.cancels).toEqual([{ sessionId: tour.id, body: { turnId: "turn_3" } }]);
  });

  it("a working begin is cancelled on leave and resent with a new key on return", async () => {
    const { root, eve, peer, save, first, page, local, workspaceId } = await setup();
    const begin = await save({ status: "working", beginPending: { idempotencyKey: "begin:x:0", sentAt: new Date().toISOString(), attempt: 0 } });
    await saveRecord(root, { ...begin, lifecycle: { ...begin.lifecycle!, beginPending: { idempotencyKey: `begin:${begin.id}:0`, sentAt: new Date().toISOString(), attempt: 0 } } });
    await presence().join(first, peer());
    await presence().join(page("starter", "002-second"), peer());
    expect(eve.cancels).toEqual([{ sessionId: begin.id, body: {} }]);
    expect((await readRecords(root)).find(item => item.id === begin.id)?.lifecycle?.beginPending?.cancelledAt).toEqual(expect.any(String));
    // The hook reports the cancelled begin; the next open resends it with the next attempt's key
    await applyLifecycle(root, begin.id, { type: "turn.settled", outcome: "cancelled" });
    vi.useRealTimers();
    await local.sessions.openDefault(workspaceId, { course: "starter", lesson: "001-first" });
    expect(eve.messages.map(message => message.body.idempotencyKey)).toEqual([`begin:${begin.id}:1`]);
  });

  it("an ordinary working turn on a left page runs until it settles", async () => {
    const { eve, peer, save, first, page } = await setup();
    await save({ status: "working" });
    await presence().join(first, peer());
    await presence().join(page("starter", "002-second"), peer());
    await vi.advanceTimersByTimeAsync(40_000);
    expect(eve.cancels).toEqual([]);
  });

  it("evaluation-trial workspaces are never left", async () => {
    const { eve, peer, save, first, page, workspaceId } = await setup();
    setWorkspaceKind(workspaceId, "evaluation-trial");
    await save({ status: "paused", turnId: "turn_7" });
    const tab = peer();
    await presence().join(first, tab);
    await presence().join(page("starter", "002-second"), peer());
    presence().part(first, tab);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(eve.cancels).toEqual([]);
  });

  it("after a host restart a paused record whose page has no socket is cancelled 30 s after the host is ready", async () => {
    const { eve, save, local, workspaceId } = await setup();
    const paused = await save({ status: "paused", turnId: "turn_0" });
    await local.stop(workspaceId, "codex");
    await local.connect(workspaceId, { agent: "codex", persona: "sensei" });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(eve.cancels).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_500);
    await vi.waitFor(() => expect(eve.cancels).toEqual([{ sessionId: paused.id, body: { turnId: "turn_0" } }]));
  });

  it("the leave transition is applied before Eve's cancel is sent", async () => {
    const seen: unknown[] = [];
    let root = "";
    const { root: workspaceRoot, peer, save, first, page, eve } = await setup({ onCancel: async sessionId => {
      seen.push((await readRecords(root)).find(item => item.id === sessionId)?.lifecycle);
    } });
    root = workspaceRoot;
    await save({ status: "paused", turnId: "turn_7", heldReport: { observationId: "o1", text: "[dojo:check] Ran lesson checks.", heldAt: new Date().toISOString() } });
    await presence().join(first, peer());
    await presence().join(page("starter", "002-second"), peer());
    expect(eve.cancels).toHaveLength(1);
    expect(seen).toEqual([expect.not.objectContaining({ heldReport: expect.anything() })]);
    expect(seen[0]).toMatchObject({ status: "paused", turnId: "turn_7" });
  });
});
