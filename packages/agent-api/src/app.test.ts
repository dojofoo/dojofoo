import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";
import { describe, expect, it, vi } from "vitest";
import { createAgentApi } from "./app";
import { FakeEve, fakeRuntime, turn } from "./fixtures";

const base = "http://local/api/v1/workspaces/ws-1";

function setup(script = (message: unknown, turnId: string) => turn(turnId, String(message), ["Hel", "lo", " there"])) {
  const eve = new FakeEve(script);
  const runtime = fakeRuntime(eve);
  const app = createAgentApi(runtime);
  const call = (path: string, init?: RequestInit) => app.handle(new Request(`${base}${path}`, init));
  const json = (path: string, method = "GET", body?: unknown) => call(path, {
    method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
  });
  return { eve, runtime, app, call, json };
}

/** The UI's connection: send runs, rejoin through events. */
function connection(app: ReturnType<typeof createAgentApi>, sessionId: string) {
  const fetchClient = ((input: RequestInfo | URL, init?: RequestInit) => app.handle(new Request(new URL(String(input), "http://local"), init))) as typeof fetch;
  const runs = fetchServerSentEvents(`${base}/sessions/${sessionId}/runs`, { fetchClient });
  const events = fetchServerSentEvents(`${base}/sessions/${sessionId}/events`, { fetchClient });
  return { connect: runs.connect, joinRun: events.joinRun };
}

describe("agents", () => {
  it("lists a workspace's coding agents in the public collection shape", async () => {
    const { json } = setup();
    const response = await json("/agents");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        { id: "codex", name: "Codex", selected: true, status: "stopped" },
        { id: "opencode", name: "OpenCode", selected: false, status: "stopped" },
      ],
      pagination: { page: 0, perPage: 100, total: 2, hasMore: false },
    });
  });

  it("starts the selected agent without waiting, and refuses the others", async () => {
    const { json } = setup();
    const started = await json("/agents/codex", "POST");
    expect(started.status).toBe(202);
    expect(await started.json()).toMatchObject({ id: "codex", status: "starting" });
    expect(await (await json("/agents/codex")).json()).toMatchObject({ status: "ready" });
    const refused = await json("/agents/opencode", "POST");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "agent_unavailable", message: "Only the selected coding agent can start." });
  });

  it("answers unknown workspaces and agents with stable error codes", async () => {
    const { app, json } = setup();
    const unknown = await app.handle(new Request("http://local/api/v1/workspaces/nope/agents"));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "workspace_not_found", message: "Workspace not found." });
    expect(await (await json("/agents/pi")).json()).toMatchObject({ error: "agent_not_found" });
  });
});

describe("sessions", () => {
  it("passes initial page state to the runtime context hook", async () => {
    const { json, runtime, eve } = setup();
    const context = vi.fn(async () => ({ course: "starter" }));
    runtime.context = context;
    const view = { scope: "course", file: "dojo.yaml" };
    const response = await json("/sessions", "POST", { persona: "kyoshi", forwardedProps: { view } });
    expect(response.status).toBe(201);
    expect(context).toHaveBeenCalledWith("ws-1", expect.any(Request), { view });
    expect(eve.sent[0].context).toEqual({ course: "starter" });
  });

  it("creates a session on the selected coding agent with the persona's greeting and course context", async () => {
    const { json, eve, runtime } = setup();
    const created = await json("/sessions", "POST", { persona: "kyoshi" });
    expect(created.status).toBe(201);
    const session = await created.json();
    expect(session).toMatchObject({ id: "session-1", agent: "codex", persona: "kyoshi", status: "running" });
    expect(eve.sent[0]).toEqual({ sessionId: "session-1", message: "Hello kyoshi", context: { course: "starter" } });
    expect(runtime.records).toHaveLength(1);
  });

  it("filters sessions by coding agent and persona, newest first", async () => {
    const { json, runtime } = setup();
    runtime.records.push(
      { id: "a", agent: "codex", persona: "kyoshi", createdAt: "2026-10-01T00:00:00.000Z" },
      { id: "b", agent: "opencode", persona: "sensei", createdAt: "2026-10-02T00:00:00.000Z" },
      { id: "c", agent: "codex", persona: "sensei", createdAt: "2026-10-03T00:00:00.000Z" },
    );
    const codex = await (await json("/sessions?agent=codex")).json();
    expect(codex.data.map((item: { id: string }) => item.id)).toEqual(["c", "a"]);
    const senseiOnCodex = await (await json("/sessions?agent=codex&persona=sensei&per_page=1")).json();
    expect(senseiOnCodex).toEqual({ data: [runtime.records[2]], pagination: { page: 0, perPage: 1, total: 1, hasMore: false } });
    const invalid = await json("/sessions?persona=teacher");
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "invalid_request" });
  });

  it("reports an idle session with its messages, and an unknown one as not found", async () => {
    const { json } = setup();
    await json("/sessions", "POST", { persona: "kyoshi", message: "Start" });
    expect(await (await json("/sessions/session-1")).json()).toMatchObject({ id: "session-1", status: "idle", position: expect.any(Number) });
    const messages = await (await json("/sessions/session-1/messages")).json();
    expect(messages.pagination).toEqual({ page: 0, perPage: 100, total: 2, hasMore: false });
    expect(messages.data[1]).toMatchObject({ role: "assistant", parts: [{ type: "text", content: "Hello there" }] });
    expect(await (await json("/sessions/missing")).json()).toEqual({ error: "session_not_found", message: "Session not found." });
  });

  it("reports a session waiting on a question with the interrupts to resume", async () => {
    const { json } = setup((message, turnId) => turn(turnId, String(message), ["Pick one"], { question: true }));
    await json("/sessions", "POST", { persona: "kyoshi" });
    const session = await (await json("/sessions/session-1")).json();
    expect(session.status).toBe("awaiting-input");
    expect(session.resume).toMatchObject({ threadId: "session-1", pendingInterrupts: [expect.objectContaining({ id: "turn-1-q" })] });
  });
});

describe("runs", () => {
  it("streams a reply through TanStack's ChatClient as text deltas", async () => {
    const { app, json, eve } = setup();
    await json("/sessions", "POST", { persona: "sensei", message: "Start" });
    const chunks: string[] = [];
    const chat = new ChatClient({ connection: connection(app, "session-1"), threadId: "session-1", onChunk: chunk => chunks.push(chunk.type) });
    await chat.sendMessage("What is a kata?");
    expect(eve.sent.at(-1)).toMatchObject({ sessionId: "session-1", message: "What is a kata?", context: { course: "starter" } });
    const last = chat.getMessages().at(-1)!;
    expect(last).toMatchObject({ role: "assistant", parts: [{ type: "text", content: "Hello there" }] });
    expect(chunks.filter(type => type === "TEXT_MESSAGE_CONTENT").length).toBeGreaterThanOrEqual(2);
    expect(chunks.at(-1)).toBe("RUN_FINISHED");
  });

  it.each(["kyoshi", "sensei"])("sends text and attachments through the same %s chat interface", async persona => {
    const { app, json, eve } = setup();
    await json("/sessions", "POST", { persona });
    const chat = new ChatClient({ connection: connection(app, "session-1"), threadId: "session-1", persistence: false });
    try {
      await chat.sendMessage({ content: [
        { type: "text", content: "Review this file" },
        { type: "document", source: { type: "data", value: btoa("Course notes"), mimeType: "text/plain" }, metadata: { filename: "notes.txt" } },
      ] });
      expect(eve.sent.at(-1)).toMatchObject({ sessionId: "session-1", message: [
        { type: "text", text: "Review this file" },
        { type: "file", data: "data:text/plain;base64,Q291cnNlIG5vdGVz", mediaType: "text/plain", filename: "notes.txt" },
      ] });
    } finally { chat.dispose(); }
  });

  it("reloads mid-turn and follows the same session without duplicating its saved prefix", async () => {
    const { app, json, eve } = setup();
    await json("/sessions", "POST", { persona: "kyoshi" });
    const reply = turn("in-flight", "A question", ["Hel", "lo"]);
    const cut = reply.findIndex(event => event.type === "message.appended") + 1;
    eve.histories.set("session-1", reply.slice(0, cut));
    eve.continuations.set("session-1", reply.slice(cut));
    const saved = await (await json("/sessions/session-1")).json();
    const messages = await (await json("/sessions/session-1/messages")).json();
    expect(saved.status).toBe("running");
    const chunks: string[] = [];
    const chat = new ChatClient({
      connection: connection(app, "session-1"), threadId: "session-1", persistence: false,
      initialMessages: messages.data, initialResumeSnapshot: {
        resumeState: { threadId: saved.resume.threadId, runId: saved.resume.runId },
        pendingInterrupts: saved.resume.pendingInterrupts,
      },
      onChunk: chunk => chunks.push(chunk.type),
    });
    try {
      chat.attach();
      await vi.waitFor(() => expect(chunks.at(-1)).toBe("RUN_FINISHED"));
      expect(chat.getMessages().at(-1)).toMatchObject({ parts: [{ type: "text", content: "Hello" }] });
      expect(chunks.filter(type => type === "MESSAGES_SNAPSHOT")).toHaveLength(1);
      expect(eve.sent).toHaveLength(1);
      expect([...eve.histories.keys()]).toEqual(["session-1"]);
    } finally { chat.dispose(); }
  });

  it("answers questions through the run's resume", async () => {
    const { app, json, eve, runtime } = setup((message, turnId) => message === "(answers)"
      ? turn(turnId, "", ["Thanks"])
      : turn(turnId, String(message), ["Pick one"], { question: true }));
    const context = vi.fn(async () => ({ course: "starter" }));
    runtime.context = context;
    await json("/sessions", "POST", { persona: "kyoshi" });
    const response = await app.handle(new Request(`${base}/sessions/session-1/runs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: "session-1", runId: "run-2", state: {}, messages: [], tools: [], context: [], forwardedProps: { view: { file: "SENSEI.md" } },
        resume: [{ interruptId: "turn-1-q", status: "resolved", payload: { optionId: "review" } }] }),
    }));
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain("RUN_FINISHED");
    expect(eve.answered).toEqual([{ sessionId: "session-1", answers: [expect.objectContaining({ requestId: "turn-1-q", optionId: "review" })] }]);
    expect(context).toHaveBeenLastCalledWith("ws-1", expect.any(Request), { view: { file: "SENSEI.md" } });
  });

  it("rejects a run without a message or answers", async () => {
    const { app, json } = setup();
    await json("/sessions", "POST", { persona: "kyoshi" });
    const response = await app.handle(new Request(`${base}/sessions/session-1/runs`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId: "session-1", runId: "r", state: {}, messages: [], tools: [], context: [], forwardedProps: {} }),
    }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ error: "message_required" });
  });

  it("cancels the current run", async () => {
    const { json, eve } = setup();
    await json("/sessions", "POST", { persona: "kyoshi" });
    const response = await json("/sessions/session-1/runs/run-1", "PATCH", { status: "cancelled" });
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ id: "run-1", status: "cancelling" });
    expect(eve.cancelled).toEqual(["session-1"]);
  });
});
