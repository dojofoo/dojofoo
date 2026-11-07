import { execFile } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as preparation from "@dojofoo/config/project-preparation";
import { addNotice } from "../agent-session/guard-store";
import { readRecords, saveRecord } from "../agent-session/records";
import { kataWorkspace, removeRoots } from "../agent-session/test-kata.fixture";
import { createLessonSocket } from "./lesson-socket";

vi.mock("node:child_process", async importOriginal => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFile: vi.fn(actual.execFile) };
});
const roots: string[] = [];
const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); removeRoots(roots); });

function setup() {
  const workspace = kataWorkspace(roots, { baseUrl: "http://127.0.0.1:9" });
  cleanups.push(workspace.cleanup);
  const socket = createLessonSocket({ runtime: workspace.local });
  let id = 0;
  const peer = (query: string) => {
    const sent: unknown[] = [];
    return { id: `peer-${++id}`, request: new Request(`http://127.0.0.1:4567/api/session?${query}`), peers: [], sent,
      send: (data: string) => { sent.push(JSON.parse(data)); } };
  };
  const page = `workspace=${encodeURIComponent(workspace.workspaceId)}&course=starter&lesson=001-first`;
  return { ...workspace, socket, peer, page };
}

describe("the lesson socket", () => {
  it("the upgrade refuses a foreign Origin and a request without a workspace and course", () => {
    const { socket, page } = setup();
    const refused = (url: string, origin?: string) => {
      try { socket.upgrade(new Request(url, origin ? { headers: { origin } } : {})); return undefined; }
      catch (response) { return (response as Response).status; }
    };
    expect(refused(`http://127.0.0.1:4567/api/session?${page}`, "http://evil.example")).toBe(403);
    expect(refused("http://127.0.0.1:4567/api/session?course=starter")).toBe(400);
    expect(refused("http://127.0.0.1:4567/api/session")).toBe(400);
    expect(refused(`http://127.0.0.1:4567/api/session?${page}`, "http://127.0.0.1:4567")).toBeUndefined();
  });

  it("a check over the socket reaches the lifecycle as a report", async () => {
    const { root, socket, peer, page, record } = setup();
    const session = record({ lifecycle: { status: "working", updatedAt: new Date().toISOString() } });
    await saveRecord(root, session);
    vi.spyOn(preparation, "prepareWorkspace").mockResolvedValue(undefined as never);
    vi.mocked(execFile).mockImplementationOnce(((_command: string, _args: string[], _options: unknown, done: (error: null, stdout: string) => void) => { done(null, JSON.stringify({ total: 2, passed: 0, failed: 2, tests: [{ name: "a", status: "failed" }, { name: "b", status: "failed" }], error: null })); return {}; }) as never);
    const tab = peer(page);
    await socket.open(tab);
    await socket.message(tab, JSON.stringify({ jsonrpc: "2.0", id: 1, method: "lesson.check", params: { courseId: "starter", lessonId: "001-first" } }));
    const methods = tab.sent.map(message => (message as { method?: string }).method ?? "result");
    expect(methods).toEqual(["session.snapshot", "lesson.check.started", "lesson.check.test", "lesson.check.test", "lesson.check.completed", "result", "lesson.check.report"]);
    expect(tab.sent.at(-1)).toMatchObject({ params: { state: "held" } });
    expect((await readRecords(root))[0]?.lifecycle?.heldReport).toMatchObject({ text: expect.stringContaining("[dojo:check] Ran lesson checks.") });
  });

  it("a check's notifications carry its request's id, so the page that asked tells them from Sensei's", async () => {
    const { socket, peer, page } = setup();
    vi.spyOn(preparation, "prepareWorkspace").mockResolvedValue(undefined as never);
    vi.mocked(execFile).mockImplementationOnce(((_command: string, _args: string[], _options: unknown, done: (error: null, stdout: string) => void) => { done(null, JSON.stringify({ total: 1, passed: 1, failed: 0, tests: [{ name: "a", status: "passed" }], error: null })); return {}; }) as never);
    const tab = peer(page);
    const other = peer(page);
    await socket.open(tab);
    await socket.open(other);
    await socket.message(tab, JSON.stringify({ jsonrpc: "2.0", id: "check-1", method: "lesson.check", params: { courseId: "starter", lessonId: "001-first" } }));
    // Every tab of the lesson sees the check, and each notification names the request it belongs to
    for (const sent of [tab.sent, other.sent]) {
      const checks = sent.filter(message => /^lesson\.check\.(started|test|completed)$/u.test((message as { method?: string }).method ?? ""));
      expect(checks.map(message => [(message as { method: string }).method, (message as { params: { checkId?: unknown } }).params.checkId])).toEqual([
        ["lesson.check.started", "check-1"], ["lesson.check.test", "check-1"], ["lesson.check.completed", "check-1"]]);
    }
    socket.close(tab);
    socket.close(other);
  });

  it("a check that fails tells the page it stopped, then answers the request with the error", async () => {
    const { socket, peer, page } = setup();
    vi.spyOn(preparation, "prepareWorkspace").mockRejectedValue(new Error("Course setup failed"));
    const tab = peer(page);
    await socket.open(tab);
    await socket.message(tab, JSON.stringify({ jsonrpc: "2.0", id: 2, method: "lesson.check", params: { courseId: "starter", lessonId: "001-first" } }));
    expect(tab.sent.slice(1)).toEqual([
      { jsonrpc: "2.0", method: "lesson.check.started", params: { courseId: "starter", lessonId: "001-first", checkId: 2 } },
      { jsonrpc: "2.0", method: "lesson.check.failed", params: { courseId: "starter", lessonId: "001-first", checkId: 2 } },
      { jsonrpc: "2.0", id: 2, error: { code: -32_000, message: "Course setup failed" } },
    ]);
    socket.close(tab);
  });

  it("a pending notice is sent once when the page key's socket opens", async () => {
    const { root, workspaceId, socket, peer, page } = setup();
    await addNotice(root, { workspaceId, violation: { sessionId: "s1", courseId: "starter", lessonId: "001-first", paths: ["katas/001-first/solution.ts"],
      action: "restored", quarantined: "/q", at: new Date().toISOString() } });
    const first = peer(page);
    await socket.open(first);
    expect(first.sent.filter(message => (message as { method?: string }).method === "guard.violation")).toHaveLength(1);
    socket.close(first);
    const second = peer(page);
    await socket.open(second);
    expect(second.sent.filter(message => (message as { method?: string }).method === "guard.violation")).toEqual([]);
    socket.close(second);
  });
});
