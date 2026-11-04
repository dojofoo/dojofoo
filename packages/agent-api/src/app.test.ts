import { Client } from "@dojofoo/agent/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAgentApi } from "./app";
import { startEve, testLaunchToken, testRuntime } from "./fixtures";
import { LAUNCH_TOKEN_HEADER, launchGuard } from "./launch";

const base = "http://local/api/v1/workspaces/ws-1";

let eve: Awaited<ReturnType<typeof startEve>>;
beforeAll(async () => { eve = await startEve(); }, 120_000);
afterAll(async () => { await eve?.close(); }, 60_000);

function setup(options: Parameters<typeof testRuntime>[2] = {}) {
  const runtime = testRuntime(eve ?? { baseUrl: "http://eve.invalid" }, "ws-1", options);
  const app = createAgentApi(runtime, { authorize: launchGuard({ token: () => testLaunchToken, origin: () => "http://local" }) });
  const call = (path: string, init?: RequestInit) => app.handle(new Request(`${base}${path}`, init));
  const json = (path: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) => call(path, {
    method, headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  // Eve's own client, as the browser uses it: requests to this API go to the app, the rest to the network
  const network = globalThis.fetch;
  vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    return request.url.startsWith("http://local/") ? app.handle(request) : network(request);
  }) as typeof fetch);
  const session = (id: string) => new Client({ baseUrl: `${base}/sessions/${encodeURIComponent(id)}` }).sessions.attach(id);
  /** A new session, once its first turn has settled (a message sent sooner steers that turn) */
  const created = async () => {
    const record = await (await json("/sessions", "POST", { persona: "kyoshi", message: "Hello kyoshi" })).json() as { id: string };
    await vi.waitFor(async () => expect((await session(record.id).snapshot()).events.some(event => event.type === "turn.settled")).toBe(true), { timeout: 30_000 });
    return record;
  };
  return { runtime, app, call, json, session, created };
}

describe("agents", () => {
  it("exposes migration progress without reporting the agent ready", async () => {
    const { json, runtime } = setup();
    runtime.agents = async () => [{ id: "codex", name: "Codex", selected: true, status: "migrating", message: "Migrating to the new course version…" }];
    const response = await json("/agents");
    expect(response.status).toBe(200);
    expect((await response.json()).data[0]).toMatchObject({ status: "migrating", message: "Migrating to the new course version…" });
  });
  it("lists a workspace's coding agents in the public collection shape", async () => {
    const { json } = setup();
    const response = await json("/agents");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: [
        { id: "codex", name: "Codex", selected: true, status: "stopped" },
        ...["claude", "grok", "opencode", "fx", "pi"].map(id => ({ id, name: expect.any(String), selected: false, status: "stopped" })),
      ],
      pagination: { page: 0, perPage: 100, total: 6, hasMore: false },
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

  it("selects a coding agent through the authorized route", async () => {
    const { json, runtime } = setup();
    const selected = await json("/agents/opencode/select", "POST", undefined, { [LAUNCH_TOKEN_HEADER]: testLaunchToken, origin: "http://local" });
    expect(selected.status).toBe(200);
    expect(await selected.json()).toEqual({ id: "opencode", name: "OpenCode", selected: true, status: "stopped" });
    expect(runtime.selections).toEqual(["opencode"]);
    expect((await (await json("/agents")).json()).data[0]).toMatchObject({ id: "opencode", selected: true });
    const created = await json("/sessions", "POST", { persona: "kyoshi", message: "Hello kyoshi" });
    expect(await created.json()).toMatchObject({ agent: "opencode" });
  }, 60_000);

  it("refuses select without the launch token", async () => {
    const { json, runtime } = setup();
    for (const headers of [{}, { [LAUNCH_TOKEN_HEADER]: "an-earlier-launch" }] as Array<Record<string, string>>) {
      const refused = await json("/agents/opencode/select", "POST", undefined, headers);
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({ error: "launch_token_invalid", message: "This page's launch token is out of date." });
    }
    const foreign = await json("/agents/opencode/select", "POST", undefined, { [LAUNCH_TOKEN_HEADER]: testLaunchToken, origin: "https://other.example" });
    expect(await foreign.json()).toMatchObject({ error: "origin_forbidden" });
    expect(runtime.selections).toEqual([]);
  });

  it("answers unknown and not-offered agents on select", async () => {
    const { json } = setup();
    const headers = { [LAUNCH_TOKEN_HEADER]: testLaunchToken };
    const unknown = await json("/agents/nope/select", "POST", undefined, headers);
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ error: "agent_not_found" });
    const cursor = await json("/agents/cursor/select", "POST", undefined, headers);
    expect(cursor.status).toBe(409);
    expect(await cursor.json()).toEqual({ error: "agent_not_offered", message: "Cursor isn't available yet. Choose another coding agent." });
  });

  it("answers unknown workspaces and agents with stable error codes", async () => {
    const { app, json } = setup();
    const unknown = await app.handle(new Request("http://local/api/v1/workspaces/nope/agents"));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "workspace_not_found", message: "Workspace not found." });
    expect(await (await json("/agents/cursor")).json()).toMatchObject({ error: "agent_not_found" });
  });
});

describe("sessions", () => {
  it("creates a session on the selected coding agent, whose first turn is the message in the body", async () => {
    const { json, runtime, session } = setup();
    const created = await json("/sessions", "POST", { persona: "kyoshi", message: "Hello kyoshi", clientContext: { view: { scope: "course" } } });
    expect(created.status).toBe(201);
    const record = await created.json();
    expect(record).toMatchObject({ agent: "codex", persona: "kyoshi", revision: 0 });
    expect(runtime.records).toEqual([record]);
    expect(await (await json(`/sessions/${record.id}`)).json()).toEqual(record);
    await vi.waitFor(async () => {
      const { events } = await session(record.id).snapshot();
      expect(events.some(event => event.type === "content.completed" && JSON.stringify(event.data).includes("Echo: Hello kyoshi"))).toBe(true);
    }, { timeout: 30_000 });
  }, 60_000);

  it("creates a session with the workspace's persona, ignoring a persona in the body", async () => {
    const { json, runtime, session } = setup({ persona: "sensei" });
    const created = await json("/sessions", "POST", { persona: "kyoshi", message: "Hello sensei" });
    expect(created.status).toBe(201);
    const record = await created.json();
    expect(record).toMatchObject({ agent: "codex", persona: "sensei" });
    expect(runtime.records).toEqual([record]);
    await vi.waitFor(async () => {
      const { events } = await session(record.id).snapshot();
      expect(events.some(event => event.type === "content.completed" && JSON.stringify(event.data).includes("Echo: Hello sensei"))).toBe(true);
    }, { timeout: 30_000 });
  }, 60_000);

  it("filters sessions by coding agent and persona, newest first", async () => {
    const { json, runtime } = setup();
    runtime.records.push(
      { id: "a", agent: "codex", persona: "kyoshi", createdAt: "2026-10-01T00:00:00.000Z", revision: 0 },
      { id: "b", agent: "opencode", persona: "sensei", createdAt: "2026-10-02T00:00:00.000Z", revision: 0 },
      { id: "c", agent: "codex", persona: "sensei", createdAt: "2026-10-03T00:00:00.000Z", revision: 0 },
    );
    const codex = await (await json("/sessions?agent=codex")).json();
    expect(codex.data.map((item: { id: string }) => item.id)).toEqual(["c", "a"]);
    const senseiOnCodex = await (await json("/sessions?agent=codex&persona=sensei&per_page=1")).json();
    expect(senseiOnCodex).toEqual({ data: [runtime.records[2]], pagination: { page: 0, perPage: 1, total: 1, hasMore: false } });
    const invalid = await json("/sessions?persona=teacher");
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ error: "invalid_request" });
    expect(await (await json("/sessions/missing")).json()).toEqual({ error: "session_not_found", message: "Session not found." });
  });

  it("GET /sessions filters by course and lesson", async () => {
    const { json, runtime } = setup({ persona: "sensei" });
    runtime.records.push(
      { id: "course-only", agent: "codex", persona: "sensei", createdAt: "2026-10-01T00:00:00.000Z", courseId: "first", revision: 0 },
      { id: "lesson-a", agent: "codex", persona: "sensei", createdAt: "2026-10-02T00:00:00.000Z", courseId: "first", lessonId: "a", revision: 0 },
      { id: "other", agent: "codex", persona: "sensei", createdAt: "2026-10-03T00:00:00.000Z", courseId: "second", lessonId: "a", revision: 0 },
    );
    const ids = async (query: string) => (await (await json(`/sessions?${query}`)).json()).data.map((item: { id: string }) => item.id);
    expect(await ids("course=first")).toEqual(["lesson-a", "course-only"]);
    expect(await ids("course=first&lesson=a")).toEqual(["lesson-a"]);
    expect(await ids("course=first&lesson=")).toEqual(["course-only"]);
    expect(await ids("lesson=a")).toEqual(["other", "lesson-a"]);
  });

  const senseiRecord = {
    id: "s-course", agent: "codex", persona: "sensei" as const, createdAt: "2026-10-04T00:00:00.000Z", courseId: "first", model: "gpt-5.4",
    revision: 2, endedAt: "2026-10-05T00:00:00.000Z", replacedBy: "s-next",
    lifecycle: { status: "idle" as const, beginPending: { idempotencyKey: "begin:s-course:0", sentAt: "2026-10-04T00:00:01.000Z" }, updatedAt: "2026-10-04T00:00:02.000Z" },
  };

  it("a record carries course, lesson, model, revision and lifecycle through the API", async () => {
    const { json, runtime } = setup({ persona: "sensei" });
    runtime.records.push(senseiRecord, { ...senseiRecord, id: "s-lesson", lessonId: "lesson-1", lifecycle: { status: "paused", turnId: "turn-3", updatedAt: "2026-10-04T00:00:03.000Z" } });
    expect(await (await json("/sessions/s-course")).json()).toEqual(senseiRecord);
    const listed = await (await json("/sessions?persona=sensei")).json();
    expect(listed.data.find((item: { id: string }) => item.id === "s-lesson")).toMatchObject({ lessonId: "lesson-1", lifecycle: { status: "paused", turnId: "turn-3" } });
  });

  it("PATCH sets the model and raises the revision", async () => {
    const { json, runtime } = setup({ persona: "sensei" });
    runtime.records.push({ ...senseiRecord, endedAt: undefined, replacedBy: undefined });
    const patched = await json("/sessions/s-course", "PATCH", { model: "gpt-5.5" });
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ id: "s-course", model: "gpt-5.5", revision: 3 });
    expect(runtime.records[0]).toMatchObject({ model: "gpt-5.5", revision: 3 });
    expect((await json("/sessions/s-course", "PATCH", { model: "" })).status).toBe(400);
    expect(await (await json("/sessions/missing", "PATCH", { model: "x" })).json()).toEqual({ error: "session_not_found", message: "Session not found." });
  });

  it("PATCH refuses a paused session with 409 turn_paused", async () => {
    const { json, runtime } = setup({ persona: "sensei" });
    runtime.records.push({ ...senseiRecord, lifecycle: { status: "paused", turnId: "turn-3", updatedAt: "2026-10-04T00:00:03.000Z" } });
    const refused = await json("/sessions/s-course", "PATCH", { model: "gpt-5.5" });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "turn_paused", message: "Change the model after Sensei's question is answered." });
    expect(runtime.records[0]).toMatchObject({ model: "gpt-5.4", revision: 2 });
  });

  it("lists a coding agent's models in the collection shape", async () => {
    const { json } = setup();
    const response = await json("/agents/codex/models");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [{ id: "fixture-model", name: "Fixture model", efforts: [] }], pagination: { page: 0, perPage: 100, total: 1, hasMore: false } });
    expect(await (await json("/agents/nope/models")).json()).toMatchObject({ error: "agent_not_found" });
  });

  it("POST /sessions without a message is invalid_request", async () => {
    const { json, runtime } = setup();
    for (const body of [{ persona: "kyoshi" }, { message: "" }]) {
      const refused = await json("/sessions", "POST", body);
      expect(refused.status).toBe(400);
      expect(await refused.json()).toMatchObject({ error: "invalid_request" });
    }
    expect(runtime.records).toEqual([]);
  });
});

describe("the default conversation route", () => {
  it("POST /sessions/default needs the launch token", async () => {
    const { json, runtime } = setup({ persona: "sensei" });
    for (const headers of [{}, { [LAUNCH_TOKEN_HEADER]: "an-earlier-launch" }] as Array<Record<string, string>>) {
      const refused = await json("/sessions/default", "POST", { course: "first" }, headers);
      expect(refused.status).toBe(403);
      expect(await refused.json()).toMatchObject({ error: "launch_token_invalid" });
    }
    expect(runtime.records).toEqual([]);
    const opened = await json("/sessions/default", "POST", { course: "first" }, { [LAUNCH_TOKEN_HEADER]: testLaunchToken, origin: "http://local" });
    expect(opened.status).toBe(200);
    expect(await opened.json()).toEqual({ session: expect.objectContaining({ courseId: "first", revision: 0 }), rewrite: true });
    expect((await json("/sessions/default", "POST", {}, { [LAUNCH_TOKEN_HEADER]: testLaunchToken })).status).toBe(400);
  }, 60_000);

  it("no other POST route matches /sessions/default", async () => {
    const { json, runtime } = setup({ persona: "sensei" });
    runtime.records.push({ id: "default", agent: "codex", persona: "sensei", createdAt: "2026-10-01T00:00:00.000Z", revision: 0 });
    // GET still reads a session named "default"; POST is the default-conversation route, never a proxy to that session's Eve routes
    expect(await (await json("/sessions/default")).json()).toMatchObject({ id: "default" });
    const opened = await json("/sessions/default", "POST", { course: "first" }, { [LAUNCH_TOKEN_HEADER]: testLaunchToken });
    expect(await opened.json()).toMatchObject({ rewrite: true, session: { courseId: "first" } });
    expect(runtime.delivered).toEqual([]);
  }, 60_000);

  it("POST /sessions/default opens a draft's Kyoshi conversation through the fixture runtime", async () => {
    const { json, runtime, session } = setup();
    const headers = { [LAUNCH_TOKEN_HEADER]: testLaunchToken };
    const opened = await (await json("/sessions/default", "POST", {}, headers)).json();
    expect(opened).toEqual({ session: expect.objectContaining({ agent: "codex", persona: "kyoshi", revision: 0 }), rewrite: true });
    expect(opened.session).not.toHaveProperty("courseId");
    expect(runtime.records).toEqual([opened.session]);
    await vi.waitFor(async () => {
      const { events } = await session(opened.session.id).snapshot();
      expect(events.some(event => event.type === "content.completed" && JSON.stringify(event.data).includes("Echo: [dojo:begin-authoring]"))).toBe(true);
    }, { timeout: 30_000 });
    // The same conversation again, honouring it when asked; a course is not a draft's
    expect(await (await json("/sessions/default", "POST", { session: opened.session.id }, headers)).json()).toMatchObject({ session: { id: opened.session.id }, rewrite: false });
    expect(await (await json("/sessions/default", "POST", {}, headers)).json()).toMatchObject({ session: { id: opened.session.id }, rewrite: true });
    expect((await json("/sessions/default", "POST", { course: "first" }, headers)).status).toBe(400);
    // The author's first message names it
    await (await session(opened.session.id).send("Outline a course about loops")).result();
    expect(await (await json(`/sessions/${opened.session.id}`)).json()).toMatchObject({ firstMessage: "Outline a course about loops" });
    expect(runtime.records).toHaveLength(1);
  }, 60_000);
});

describe("a session's Eve routes", () => {
  it("serve Eve's own client: a turn with a tool call", async () => {
    const { session, created } = setup();
    const { id } = await created();
    const delivery = await session(id).send("please read");
    expect(await delivery.result()).toMatchObject({ status: "completed", reply: "Read: # Lesson" });
  }, 60_000);

  it("ask a question and take its answer", async () => {
    const { session, created } = setup();
    const { id } = await created();
    const asked = await (await session(id).send("now ask me")).result();
    expect(asked.status).toBe("awaiting-input");
    const [question] = asked.interactions;
    expect(question).toMatchObject({ request: { kind: "question", prompt: "Review the lesson?" } });
    const answered = await (await session(id).respond([{ interactionId: question!.interactionId, optionId: "Review" }])).result();
    expect(answered).toMatchObject({ status: "completed", reply: "You chose Review." });
  }, 60_000);

  it("cancel a running turn", async () => {
    const { session, created } = setup();
    const { id } = await created();
    const delivery = await session(id).send("a slow one");
    await session(id).cancel();
    expect(await delivery.result()).toMatchObject({ status: "cancelled" });
  }, 60_000);

  it("are only the session's own", async () => {
    const { call, created } = setup();
    const { id } = await created();
    const { id: other } = await created();
    expect((await call(`/sessions/${id}/eve/v1/session/${other}/stream`)).status).toBe(404);
    expect((await call(`/sessions/${id}/eve/v1/info`)).status).toBe(404);
    expect((await call(`/sessions/${id}/eve/v1/session`, { method: "POST", body: "{}" })).status).toBe(404);
    expect((await call(`/sessions/${id}/eve/v1/session/${id}/..%2F..%2Finfo`)).status).toBe(404);
    expect((await call(`/sessions/${id}/eve/v1/session/${id}/%2e%2e/${other}`)).status).toBe(404);
    const unknown = await call("/sessions/unknown/eve/v1/session/unknown/stream");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "Session not found.", code: "session_not_found" });
  }, 60_000);

  it("the proxy tells the runtime about each delivery before and after it, with Eve's deliveryId", async () => {
    const { runtime, session, created, call } = setup();
    const { id } = await created();
    runtime.delivered.length = 0;
    const delivery = await session(id).send("Hello again");
    expect(await delivery.result()).toMatchObject({ status: "completed" });
    const [before, after] = runtime.delivered;
    expect(before).toMatchObject({ phase: "before", sessionId: id, delivery: { kind: "message", text: "Hello again" } });
    expect(after).toMatchObject({ phase: "after", sessionId: id, delivery: { kind: "message" }, handle: "handle:1", status: 202, deliveryId: expect.any(String) });
    // A prepare and a control are not deliveries
    await call(`/sessions/${id}/eve/v1/session/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await call(`/sessions/${id}/eve/v1/session/${id}/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(runtime.delivered).toHaveLength(2);
  }, 60_000);

  it("a rejected delivery reaches after with its status", async () => {
    const { runtime, call } = setup();
    runtime.records.push({ id: "wrun_missing", agent: "codex", persona: "kyoshi", createdAt: "2026-10-01T00:00:00.000Z", revision: 0 });
    const response = await call("/sessions/wrun_missing/eve/v1/session/wrun_missing", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }) });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(runtime.delivered.map(entry => entry.phase)).toEqual(["before", "after"]);
    expect(runtime.delivered[1]).toMatchObject({ status: response.status });
    expect(runtime.delivered[1]).not.toHaveProperty("deliveryId");
  }, 60_000);

  it("a stream counts as activity until it closes", async () => {
    const { runtime, call, created } = setup();
    const { id } = await created();
    const controller = new AbortController();
    const response = await call(`/sessions/${id}/eve/v1/session/${id}/stream`, { signal: controller.signal });
    expect(response.status).toBe(200);
    expect(runtime.presence).toEqual({ request: 0, stream: 1 });
    await response.body!.cancel();
    controller.abort();
    await vi.waitFor(() => expect(runtime.presence).toEqual({ request: 0, stream: 0 }));
  }, 60_000);

  it("report an unreachable host in Eve's error shape", async () => {
    const runtime = testRuntime({ baseUrl: "http://127.0.0.1:9" });
    runtime.records.push({ id: "s1", agent: "codex", persona: "kyoshi", createdAt: "2026-10-01T00:00:00.000Z", revision: 0 });
    const response = await createAgentApi(runtime).handle(new Request(`${base}/sessions/s1/eve/v1/session/s1/stream`));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "agent_unreachable" });
  });

  it("clear and compact are refused for a Sensei session and pass through for Kyoshi", async () => {
    const { runtime, call, created } = setup();
    const { id } = await created();
    runtime.records.push({ id: "s-sensei", agent: "codex", persona: "sensei", createdAt: "2026-10-01T00:00:00.000Z", revision: 0 });
    for (const control of ["clear", "compact"]) {
      const refused = await call(`/sessions/s-sensei/eve/v1/session/s-sensei/${control}`, { method: "POST" });
      expect(refused.status).toBe(409);
      expect(await refused.json()).toEqual({ error: "Sensei's conversations can't be cleared or compacted.", code: "control_refused" });
      expect((await call(`/sessions/${id}/eve/v1/session/${id}/${control}`, { method: "POST" })).status).not.toBe(409);
    }
  }, 60_000);
});
