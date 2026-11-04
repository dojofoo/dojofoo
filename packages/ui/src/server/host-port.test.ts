import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeWorkspacePath } from "@dojofoo/config/local-state";
import type { SessionRecord } from "@dojofoo/agent-api";
import { app } from "./app";
import { evaluationRunner, forgetHost, hostPortUrl, registerHost } from "./host-port";
import { readRecords, saveRecord } from "./agent-session/records";


const roots: string[] = [];
const closers: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const close of closers.splice(0)) await close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const secret = "a".repeat(64);
function workspace(kind: "learner" | "draft" = "learner") {
  const root = mkdtempSync(resolve(tmpdir(), "dojo-host-port-"));
  roots.push(root);
  vi.stubEnv("DOJOFOO_HOME", resolve(root, "state"));
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "first", currentKata: null, editor: null }));
  mkdirSync(resolve(root, ".dojo"), { recursive: true });
  const dir = resolve(root, ".dojos", "first");
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, "dojo.json"), JSON.stringify({ mode: "interactive", name: "First", version: "0.0.1", description: "Course", lessons: "lesson.json" }));
  writeFileSync(resolve(dir, "lesson.json"), JSON.stringify({ id: "intro", title: "Intro", steps: [{ id: "read", type: "present", title: "Read", content: "Material from first" }] }));
  writeFileSync(resolve(dir, "DOJO.md"), "PRIVATE-GUIDANCE-first\n");
  const workspaceId = observeWorkspacePath(root, { kind });
  return { root, workspaceId };
}
const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  id: "wrun_1", agent: "opencode", persona: "sensei", createdAt: "2026-11-04T00:00:00.000Z", courseId: "first", model: "openai/gpt-4o", revision: 1,
  lifecycle: { status: "working", updatedAt: "2026-11-04T00:00:00.000Z" }, ...overrides,
});
const call = (workspaceId: string, persona: string, method: string, input: unknown, options: { bearer?: string; key?: string; origin?: string; sessionId?: string } = {}) =>
  app.fetch(new Request(`http://127.0.0.1:4567/api/host-port/${workspaceId}/${persona}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${options.bearer ?? secret}`, ...(options.origin ? { origin: options.origin } : {}) },
    body: JSON.stringify({ sessionId: options.sessionId ?? "wrun_1", idempotencyKey: options.key ?? crypto.randomUUID(), input }),
  }));
function register(workspaceId: string, persona: "sensei" | "kyoshi", baseUrl = "http://127.0.0.1:9", key = secret, agent: "opencode" | "codex" = "opencode") {
  registerHost(workspaceId, persona, { secret: key, endpoint: { baseUrl }, agent });
  closers.push(async () => forgetHost(workspaceId, persona));
}

/** An Eve host whose stream for any session holds this conversation. */
async function transcriptEve(messages: Array<{ role: "user" | "assistant"; text: string }>) {
  const server = createServer((request, response) => {
    if (!/\/stream$/u.test(new URL(request.url!, "http://eve").pathname)) return response.writeHead(404).end();
    const at = new Date().toISOString();
    const lines = [{ at, facts: [{ type: "session.started", data: { runtime: { agentId: "fake", agentName: "fake", eveVersion: "1.0.0-rc.1" } } }] }];
    let previous: string | null = null;
    messages.forEach((message, index) => {
      if (message.role === "user") {
        const turnId = `turn_${index}`;
        lines.push({ at, facts: [
          { type: "turn.started", data: { cause: { deliveryId: `d${index}` }, follows: previous, turnId }, scope: { turnId } } as never,
          { type: "delivery.consumed", data: { deliveryId: `d${index}`, turnId, parts: [{ kind: "text", text: message.text }] }, scope: { turnId } } as never,
        ] });
        previous = turnId;
      } else {
        lines.push({ at, facts: [
          { type: "content.completed", data: { partId: `p${index}`, phase: "reply", kind: "text", value: message.text }, scope: { turnId: previous } } as never,
          { type: "turn.settled", data: { turnId: previous, outcome: "completed", reply: [`p${index}`] }, scope: { turnId: previous } } as never,
        ] });
      }
    });
    response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "x-eve-stream-version": "27", "x-eve-stream-format": "ndjson",
      "x-eve-stream-tail-index": String(lines.length - 1) }).end(lines.map(line => JSON.stringify(line)).join("\n") + "\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  closers.push(() => new Promise(accept => server.close(accept)));
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

describe("host port in the UI server", () => {
  it("serves Sensei's session and interactive context for a registered host", async () => {
    const { root, workspaceId } = workspace();
    register(workspaceId, "sensei");
    await saveRecord(root, record());
    expect(await (await call(workspaceId, "sensei", "session", {})).json()).toEqual({ result: { courseId: "first", mode: "interactive", model: "openai/gpt-4o", revision: 1 } });
    const context = (await (await call(workspaceId, "sensei", "context", {})).json()).result;
    expect(context).toMatchObject({ kind: "interactive", course: { id: "first", title: "First" }, guidance: "PRIVATE-GUIDANCE-first\n", lesson: { dojo: "first", current: { id: "read" } } });
    expect(context.lesson).not.toHaveProperty("references");
    expect(context.hash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("turn.check answers turn_interrupted for an interrupted record, for its interrupted turn after the status was cleared, and for another agent's record", async () => {
    const { root, workspaceId } = workspace();
    register(workspaceId, "sensei");
    const check = async (sessionId: string, turnId: string) => {
      const response = await call(workspaceId, "sensei", "turn.check", { turnId }, { sessionId });
      return { status: response.status, body: await response.json() };
    };
    await saveRecord(root, record({ id: "s-interrupted", lifecycle: { status: "interrupted", interruptedAt: "2026-11-04T00:00:00.000Z", interruptedTurnId: "t1", updatedAt: "2026-11-04T00:00:00.000Z" } }));
    expect(await check("s-interrupted", "t1")).toEqual({ status: 409, body: { error: "turn_interrupted", message: "This turn was interrupted by an agent switch." } });
    // A learner message cleared the status; the interrupted turn stays refused, a new turn runs
    await saveRecord(root, record({ id: "s-continued", lifecycle: { status: "working", interruptedTurnId: "t1", updatedAt: "2026-11-04T00:00:00.000Z" } }));
    expect((await check("s-continued", "t1")).status).toBe(409);
    expect(await check("s-continued", "t2")).toEqual({ status: 200, body: { result: { ok: true } } });
    // A host of one agent never runs another agent's session
    await saveRecord(root, record({ id: "s-codex", agent: "codex" }));
    expect((await check("s-codex", "t3")).status).toBe(409);
    expect((await check("wrun_1", "t4")).status).toBe(404);
  });

  it("refuses an earlier start's secret", async () => {
    const { root, workspaceId } = workspace();
    await saveRecord(root, record());
    register(workspaceId, "sensei", "http://127.0.0.1:9", "b".repeat(64));
    const refused = await call(workspaceId, "sensei", "session", {});
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ error: "host_port_unauthorized" });
    expect((await call(workspaceId, "sensei", "session", {}, { bearer: "b".repeat(64) })).status).toBe(200);
  });

  it("refuses a browser request", async () => {
    const { root, workspaceId } = workspace();
    await saveRecord(root, record());
    register(workspaceId, "sensei");
    expect((await call(workspaceId, "sensei", "session", {}, { origin: "http://127.0.0.1:4567" })).status).toBe(401);
  });

  it("a pause then a settle moves the record from working to paused to idle", async () => {
    const { root, workspaceId } = workspace("draft");
    register(workspaceId, "kyoshi");
    await saveRecord(root, record({ persona: "kyoshi", courseId: undefined, lifecycle: { status: "working", beginPending: { idempotencyKey: "begin:wrun_1:0", sentAt: "x" }, updatedAt: "x" } }));
    expect((await call(workspaceId, "kyoshi", "turn.paused", { turnId: "turn_0", awaiting: ["q1"] })).status).toBe(200);
    expect((await readRecords(root))[0]?.lifecycle).toMatchObject({ status: "paused", turnId: "turn_0" });
    expect((await call(workspaceId, "kyoshi", "turn.settled", { turnId: "turn_0", outcome: "completed" })).status).toBe(200);
    const settled = (await readRecords(root))[0]?.lifecycle;
    expect(settled).toMatchObject({ status: "idle" });
    expect(settled).not.toHaveProperty("turnId");
    expect(settled).not.toHaveProperty("beginPending");
    expect((await call(workspaceId, "kyoshi", "session.ended", { outcome: "completed" })).status).toBe(200);
    expect((await readRecords(root))[0]).toMatchObject({ endedAt: expect.any(String), lifecycle: { status: "idle" } });
  });

  it("a settle of a Sensei session captures learner evidence without tagged turns", async () => {
    const { root, workspaceId } = workspace();
    const eve = await transcriptEve([
      { role: "user", text: "[dojo:begin] Begin the lesson." }, { role: "assistant", text: "Ready to teach." },
      { role: "user", text: "I am unsure about loops." }, { role: "assistant", text: "Let's look at one." },
    ]);
    register(workspaceId, "sensei", eve);
    await saveRecord(root, record());
    expect((await call(workspaceId, "sensei", "turn.settled", { turnId: "turn_2", outcome: "completed" })).status).toBe(200);
    const evidence = JSON.parse(readFileSync(resolve(root, ".dojo/learner-evidence.json"), "utf8"));
    expect(evidence.version).toBe(1);
    const excerpts = evidence.entries.first as Array<{ text: string; source: { messageId: string; sessionId: string; lessonId: string } }>;
    expect(excerpts.map(entry => entry.text)).toEqual(["Ready to teach.", "I am unsure about loops.", "Let's look at one."]);
    expect(excerpts.map(entry => entry.source.messageId)).toEqual(["transcript-1", "transcript-2", "transcript-3"]);
    expect(excerpts[0]!.source).toMatchObject({ sessionId: "wrun_1", lessonId: "first" });
  });

  it("resume.failed marks the record unusable", async () => {
    const { root, workspaceId } = workspace();
    register(workspaceId, "sensei");
    await saveRecord(root, record());
    expect((await call(workspaceId, "sensei", "resume.failed", { sessionId: "wrun_1", agent: "opencode", message: "gone", at: "2026-11-04T00:00:00.000Z" })).status).toBe(200);
    expect((await readRecords(root))[0]?.lifecycle).toMatchObject({ resumeFailedAt: expect.any(String) });
  });

  it("Kyoshi's evaluation.start returns a trial id and evaluation.status reports it", async () => {
    const { workspaceId } = workspace("draft");
    register(workspaceId, "kyoshi");
    const finished = Promise.withResolvers<void>();
    // evaluateFromAuthoring itself, mocked: it would run a real trial
    const evaluateFromAuthoring = vi.spyOn(evaluationRunner, "run").mockImplementationOnce(async () => { await finished.promise; return { attempt: 1, report: { status: "passed" } }; });
    const started = await (await call(workspaceId, "kyoshi", "evaluation.start", { lessonIds: ["001"] }, { key: "wrun_1:call_1" })).json();
    expect(started.result.trialId).toEqual(expect.any(String));
    expect(evaluateFromAuthoring).toHaveBeenCalledWith(expect.any(String), ["001"], "wrun_1:call_1");
    const status = async () => (await call(workspaceId, "kyoshi", "evaluation.status", { trialId: started.result.trialId })).json();
    expect((await status()).result).toEqual({ status: "running" });
    finished.resolve();
    await vi.waitFor(async () => expect((await status()).result).toEqual({ status: "finished", result: { attempt: 1, report: { status: "passed" } } }));
    // The same key and input return the same trial without starting another
    const again = await (await call(workspaceId, "kyoshi", "evaluation.start", { lessonIds: ["001"] }, { key: "wrun_1:call_1" })).json();
    expect(again.result.trialId).toBe(started.result.trialId);
    expect(evaluateFromAuthoring).toHaveBeenCalledTimes(1);
  });

  it("hostPortUrl uses loopback for a wildcard HOST", () => {
    for (const host of ["", "0.0.0.0", "::", "[::]"]) expect(hostPortUrl({ HOST: host, PORT: "4813" })).toBe("http://127.0.0.1:4813/api/host-port");
    expect(hostPortUrl({})).toBe("http://127.0.0.1:4567/api/host-port");
    expect(hostPortUrl({ HOST: "127.0.0.1", PORT: "4567" })).toBe("http://127.0.0.1:4567/api/host-port");
  });
});
