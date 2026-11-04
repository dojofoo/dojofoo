import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "@dojofoo/agent/client";
import { startEve } from "@dojofoo/agent-api/fixtures";
import type { SessionRecord } from "@dojofoo/agent-api";
import { observeWorkspacePath } from "@dojofoo/config/local-state";
import { createLocalAgentRuntime } from "../agent-api";
import { readRecords, saveRecord } from "./records";

let eve: Awaited<ReturnType<typeof startEve>>;
beforeAll(async () => { eve = await startEve(); }, 120_000);
afterAll(async () => { await eve?.close(); }, 60_000);

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const network = globalThis.fetch;
type Sent = { method: string; url: string; body?: unknown };
/** Every request the UI server makes to the Eve host; `answer` may replace a response */
function watchFetch(answer?: (request: Sent) => Response | undefined) {
  const sent: Sent[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const text = request.method === "POST" ? await request.clone().text() : "";
    const entry: Sent = { method: request.method, url: request.url, ...(text ? { body: JSON.parse(text) } : {}) };
    sent.push(entry);
    return answer?.(entry) ?? network(request);
  });
  return sent;
}
const begins = (sent: Sent[]) => sent.filter(request => request.method === "POST" && /\/eve\/v1\/session\/[^/]+$/u.test(new URL(request.url).pathname));

function workspace(kind: "learner" | "draft" = "learner", agent = "codex") {
  const root = mkdtempSync(resolve(tmpdir(), "dojo-default-session-"));
  roots.push(root);
  const stateHome = resolve(root, "state");
  vi.stubEnv("CODEX_HOME", resolve(root, "codex"));
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "first", currentKata: null, editor: null }));
  mkdirSync(resolve(root, ".dojo"), { recursive: true });
  writeFileSync(resolve(root, ".dojo/runtimes.json"), JSON.stringify({ agent }));
  mkdirSync(resolve(root, ".dojos/first"), { recursive: true });
  writeFileSync(resolve(root, ".dojos/first/dojo.json"), JSON.stringify({ mode: "interactive", name: "First", version: "0.0.1", description: "Course", lessons: "lesson.json" }));
  const workspaceId = observeWorkspacePath(root, { stateHome, kind });
  const runtimeStub = vi.fn(async () => ({ start: async () => ({ url: eve.baseUrl }), close: async () => {} }));
  const local = createLocalAgentRuntime({ state: { stateHome }, runtime: runtimeStub });
  return { root, workspaceId, local, runtimeStub, open: (request: Parameters<typeof local.sessions.openDefault>[1]) => local.sessions.openDefault(workspaceId, request) };
}
const record = (overrides: Partial<SessionRecord>): SessionRecord => ({
  id: crypto.randomUUID(), agent: "codex", persona: "sensei", createdAt: "2026-11-01T00:00:00.000Z", courseId: "first", revision: 0, ...overrides,
});
/** A real, bodyless session on the fixture host */
const eveSession = async () => (await new Client({ baseUrl: eve.baseUrl }).sessions.create()).session.id;

describe("the default conversation", () => {
  it("opens the newest usable conversation for the course on the selected agent", async () => {
    const { root, open } = workspace();
    const [older, newer] = [await eveSession(), await eveSession()];
    await saveRecord(root, record({ id: older, createdAt: "2026-11-01T00:00:00.000Z" }));
    await saveRecord(root, record({ id: newer, createdAt: "2026-11-02T00:00:00.000Z" }));
    expect(await open({ course: "first" })).toMatchObject({ session: { id: newer }, rewrite: true });
    expect(await open({ course: "first", session: newer })).toEqual({ session: expect.objectContaining({ id: newer }), rewrite: false });
    expect(await open({ course: "first", session: older })).toMatchObject({ session: { id: older }, rewrite: false });
  }, 60_000);

  it("creates one with a bodyless create, then sends the hidden begin turn", async () => {
    const { root, open } = workspace();
    const opened = await open({ course: "first" });
    expect(opened.rewrite).toBe(true);
    expect(opened.session).toMatchObject({ courseId: "first", agent: "codex", persona: "sensei", revision: 0 });
    expect((await readRecords(root)).map(item => item.id)).toEqual([opened.session.id]);
    await vi.waitFor(async () => {
      const { events } = await new Client({ baseUrl: eve.baseUrl }).sessions.attach(opened.session.id).snapshot();
      expect(events.some(event => event.type === "content.completed" && JSON.stringify(event.data).includes("Echo: [dojo:begin] Begin the lesson."))).toBe(true);
    }, { timeout: 30_000 });
  }, 60_000);

  it("the begin turn carries learner evidence when the course has some", async () => {
    const { root, open } = workspace();
    writeFileSync(resolve(root, ".dojo/learner-evidence.json"), JSON.stringify({ version: 1, entries: { first: [
      { kind: "transcript-excerpt", role: "user", text: "I am unsure about loops.", truncated: false, source: { lessonId: "first", sessionId: "old", messageId: "transcript-2", sha256: "x" } },
    ] } }));
    const sent = watchFetch();
    await open({ course: "first" });
    const [begin] = begins(sent);
    expect((begin?.body as { message: string }).message).toBe("[dojo:begin] Begin the lesson.\n\nExcerpts from this learner's earlier conversation in this course, for continuity. "
      + "Don't quote them back or treat them as proof of mastery.\nLearner: I am unsure about loops.");
  }, 60_000);

  it("two concurrent opens for one course create one session", async () => {
    const { root, open } = workspace();
    const [first, second] = await Promise.all([open({ course: "first" }), open({ course: "first" })]);
    expect(second.session.id).toBe(first.session.id);
    expect(await readRecords(root)).toHaveLength(1);
  }, 60_000);

  it("another agent's conversation is never the default", async () => {
    const { root, open } = workspace();
    const other = record({ id: await eveSession(), agent: "claude", createdAt: "2026-11-09T00:00:00.000Z" });
    await saveRecord(root, other);
    const opened = await open({ course: "first" });
    expect(opened.session.id).not.toBe(other.id);
    expect(opened.session.agent).toBe("codex");
  }, 60_000);

  it("a URL session from another course, workspace or agent is replaced and the URL rewritten", async () => {
    const { root, open } = workspace();
    const otherCourse = record({ id: await eveSession(), courseId: "second" });
    const otherAgent = record({ id: await eveSession(), agent: "claude" });
    await saveRecord(root, otherCourse);
    await saveRecord(root, otherAgent);
    const fromCourse = await open({ course: "first", session: otherCourse.id });
    expect(fromCourse).toMatchObject({ rewrite: true, notice: "picked-unavailable" });
    expect(fromCourse.session.id).not.toBe(otherCourse.id);
    expect(await open({ course: "first", session: otherAgent.id })).toMatchObject({ session: { id: fromCourse.session.id }, rewrite: true, notice: "picked-unavailable" });
    // A session this workspace never had
    const unknown = await open({ course: "first", session: "wrun_from_another_workspace" });
    expect(unknown).toMatchObject({ session: { id: fromCourse.session.id }, rewrite: true });
    expect(unknown).not.toHaveProperty("notice");
  }, 60_000);

  it("an ended newest conversation is replaced, recording replacedBy, and seeded", async () => {
    const { root, open } = workspace();
    writeFileSync(resolve(root, ".dojo/learner-evidence.json"), JSON.stringify({ version: 1, entries: { first: [
      { kind: "transcript-excerpt", role: "assistant", text: "Loops repeat a block.", truncated: false, source: { lessonId: "first", sessionId: "old", messageId: "transcript-1", sha256: "x" } },
    ] } }));
    const ended = record({ id: await eveSession(), endedAt: "2026-11-03T00:00:00.000Z" });
    await saveRecord(root, ended);
    const sent = watchFetch();
    const opened = await open({ course: "first" });
    expect(opened.session.id).not.toBe(ended.id);
    expect((await readRecords(root)).find(item => item.id === ended.id)?.replacedBy).toBe(opened.session.id);
    expect((begins(sent)[0]?.body as { message: string }).message).toContain("Sensei: Loops repeat a block.");
  }, 60_000);

  it("a stranded or expired newest conversation is replaced", async () => {
    const { root, open } = workspace();
    const stranded = record({ id: await eveSession(), createdAt: "2026-11-02T00:00:00.000Z" });
    const expired = record({ id: await eveSession(), createdAt: "2026-11-01T00:00:00.000Z", courseId: "second" });
    await saveRecord(root, stranded);
    await saveRecord(root, expired);
    watchFetch(request => request.url.includes(`/session/${stranded.id}/stream`)
      ? Response.json({ error: "An earlier eve built this session.", code: "session_stranded" }, { status: 409 })
      : request.url.includes(`/session/${expired.id}/stream`) ? Response.json({ error: "This session expired.", code: "session_expired" }, { status: 410 }) : undefined);
    const first = await open({ course: "first" });
    expect(first.session.id).not.toBe(stranded.id);
    const second = await open({ course: "second" });
    expect(second.session.id).not.toBe(expired.id);
    const saved = await readRecords(root);
    expect(saved.find(item => item.id === stranded.id)).toMatchObject({ endedAt: expect.any(String), replacedBy: first.session.id });
    expect(saved.find(item => item.id === expired.id)).toMatchObject({ endedAt: expect.any(String), replacedBy: second.session.id });
  }, 60_000);

  it("a resume failure replaces the session exactly once across two tabs", async () => {
    const { root, open } = workspace();
    const failed = record({ id: await eveSession(), lifecycle: { status: "idle", resumeFailedAt: "2026-11-03T00:00:00.000Z", updatedAt: "2026-11-03T00:00:00.000Z" } });
    await saveRecord(root, failed);
    const [first, second] = await Promise.all([open({ course: "first", new: true, from: failed.id }), open({ course: "first", new: true, from: failed.id })]);
    expect(second.session.id).toBe(first.session.id);
    expect(first.rewrite).toBe(true);
    expect((await readRecords(root)).find(item => item.id === failed.id)?.replacedBy).toBe(first.session.id);
    expect(await readRecords(root)).toHaveLength(2);
    // The newest lookup skips the unusable one too
    expect((await open({ course: "first" })).session.id).toBe(first.session.id);
  }, 60_000);

  it("a begin left pending by a crash is resent with the same idempotency key", async () => {
    const { root, open } = workspace();
    const id = await eveSession();
    await saveRecord(root, record({ id, lifecycle: { status: "working", beginPending: { idempotencyKey: `begin:${id}:0`, sentAt: "2026-11-03T00:00:00.000Z" }, updatedAt: "2026-11-03T00:00:00.000Z" } }));
    const sent = watchFetch();
    expect((await open({ course: "first" })).session.id).toBe(id);
    expect(begins(sent).map(request => (request.body as { idempotencyKey: string }).idempotencyKey)).toEqual([`begin:${id}:0`]);
    // Eve keeps the first acceptance: a second open sends the same key again and makes no second turn
    await open({ course: "first" });
    await vi.waitFor(async () => {
      const { events } = await new Client({ baseUrl: eve.baseUrl }).sessions.attach(id).snapshot();
      expect(events.filter(event => event.type === "turn.started")).toHaveLength(1);
    }, { timeout: 30_000 });
  }, 60_000);

  it("a cancelled begin after a leave keeps beginPending and the next open resends with a new key", async () => {
    const { root, open } = workspace();
    const id = await eveSession();
    const pending = { idempotencyKey: `begin:${id}:0`, sentAt: "2026-11-03T00:00:00.000Z", attempt: 0 };
    await saveRecord(root, record({ id, lifecycle: { status: "working", beginPending: pending, updatedAt: "2026-11-03T00:00:00.000Z" } }));
    const { applyLifecycle } = await import("./lifecycle");
    await applyLifecycle(root, id, { type: "leave" });
    await applyLifecycle(root, id, { type: "turn.settled", outcome: "cancelled" });
    expect((await readRecords(root))[0]?.lifecycle).toMatchObject({ status: "idle", beginPending: { ...pending, cancelledAt: expect.any(String) } });
    const sent = watchFetch();
    expect((await open({ course: "first" })).session.id).toBe(id);
    expect(begins(sent).map(request => (request.body as { idempotencyKey: string }).idempotencyKey)).toEqual([`begin:${id}:1`]);
    const resent = (await readRecords(root))[0]?.lifecycle?.beginPending;
    expect(resent).toMatchObject({ idempotencyKey: `begin:${id}:1`, attempt: 1 });
    expect(resent).not.toHaveProperty("cancelledAt");
  }, 60_000);

  it("a failed begin replaces the session once, then answers agent_failed", async () => {
    const { root, open } = workspace();
    let failures = 1;
    watchFetch(request => request.method === "POST" && /\/eve\/v1\/session\/[^/]+$/u.test(new URL(request.url).pathname) && failures-- > 0
      ? Response.json({ error: "The host is busy.", code: "internal" }, { status: 500 }) : undefined);
    const opened = await open({ course: "first" });
    const saved = await readRecords(root);
    expect(saved).toHaveLength(2);
    const first = saved.find(item => item.id !== opened.session.id)!;
    expect(first).toMatchObject({ endedAt: expect.any(String), replacedBy: opened.session.id });
    vi.restoreAllMocks();
    watchFetch(request => request.method === "POST" && /\/eve\/v1\/session\/[^/]+$/u.test(new URL(request.url).pathname)
      ? Response.json({ error: "The host is busy.", code: "internal" }, { status: 500 }) : undefined);
    await expect(open({ course: "second" })).rejects.toMatchObject({ status: 503, code: "agent_failed" });
    expect((await readRecords(root)).filter(item => item.courseId === "second").every(item => item.endedAt)).toBe(true);
  }, 60_000);

  it("the begin turn is posted with its idempotencyKey in the JSON body", async () => {
    const { open } = workspace();
    const sent = watchFetch();
    const opened = await open({ course: "first" });
    expect(begins(sent)).toEqual([{ method: "POST", url: `${eve.baseUrl.replace(/\/$/u, "")}/eve/v1/session/${opened.session.id}`,
      body: { message: "[dojo:begin] Begin the lesson.", idempotencyKey: `begin:${opened.session.id}:0` } }]);
  }, 60_000);

  it("a draft workspace answers invalid_request until step 6", async () => {
    const { open, runtimeStub } = workspace("draft");
    await expect(open({ course: "first" })).rejects.toMatchObject({ status: 400, code: "invalid_request" });
    expect(runtimeStub).not.toHaveBeenCalled();
  });

  it("Cursor is refused before any Eve call while its Sensei record has not passed", async () => {
    const { open, runtimeStub } = workspace("learner", "cursor");
    const sent = watchFetch();
    await expect(open({ course: "first" })).rejects.toMatchObject({ status: 409, code: "agent_not_offered",
      message: "Cursor can't teach here yet: its Sensei checks haven't passed. Choose another coding agent." });
    expect(runtimeStub).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
  });
});
