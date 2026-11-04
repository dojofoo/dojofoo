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
  /** A new session, once its greeting turn has settled (a message sent sooner steers that turn) */
  const created = async () => {
    const record = await (await json("/sessions", "POST", { persona: "kyoshi" })).json() as { id: string };
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
        ...["claude", "cursor", "grok", "opencode", "fx"].map(id => ({ id, name: expect.any(String), selected: false, status: "stopped" })),
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
    const created = await json("/sessions", "POST", { persona: "kyoshi" });
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
    const pi = await json("/agents/pi/select", "POST", undefined, headers);
    expect(pi.status).toBe(409);
    expect(await pi.json()).toEqual({ error: "agent_not_offered", message: "Pi isn't available yet. Choose another coding agent." });
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
  it("creates a session on the selected coding agent, whose first turn is the persona's greeting", async () => {
    const { json, runtime, session } = setup();
    const created = await json("/sessions", "POST", { persona: "kyoshi", clientContext: { view: { scope: "course" } } });
    expect(created.status).toBe(201);
    const record = await created.json();
    expect(record).toMatchObject({ agent: "codex", persona: "kyoshi" });
    expect(runtime.records).toEqual([record]);
    expect(await (await json(`/sessions/${record.id}`)).json()).toEqual(record);
    await vi.waitFor(async () => {
      const { events } = await session(record.id).snapshot();
      expect(events.some(event => event.type === "content.completed" && JSON.stringify(event.data).includes("Echo: Hello kyoshi"))).toBe(true);
    }, { timeout: 30_000 });
  }, 60_000);

  it("creates a session with the workspace's persona, ignoring a persona in the body", async () => {
    const { json, runtime, session } = setup({ persona: "sensei" });
    const created = await json("/sessions", "POST", { persona: "kyoshi" });
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
    expect(await (await json("/sessions/missing")).json()).toEqual({ error: "session_not_found", message: "Session not found." });
  });
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

  it("report an unreachable host in Eve's error shape", async () => {
    const runtime = testRuntime({ baseUrl: "http://127.0.0.1:9" });
    runtime.records.push({ id: "s1", agent: "codex", persona: "kyoshi", createdAt: "2026-10-01T00:00:00.000Z" });
    const response = await createAgentApi(runtime).handle(new Request(`${base}/sessions/s1/eve/v1/session/s1/stream`));
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: "agent_unreachable" });
  });
});
