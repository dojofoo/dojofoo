import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeLocalContext, observeWorkspacePath } from "@dojofoo/config/local-state";
import { DatabaseSync } from "node:sqlite";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { writeAgent } from "@dojofoo/config/runtime";
import { app } from "./app";
import { createLocalAgentRuntime } from "./agent-api";

// Cursor's CLI is looked up on this machine; the tests decide whether it is installed
const installed = vi.hoisted(() => ({ cursor: false }));
vi.mock("@dojofoo/config/agent-installations", async original => {
  const actual = await original<typeof import("@dojofoo/config/agent-installations")>();
  return { ...actual, resolveAgentExecutable: (id: string, ...rest: unknown[]) => id === "cursor" ? (installed.cursor ? "/opt/cursor/cursor-agent" : null)
    : (actual.resolveAgentExecutable as (...args: unknown[]) => unknown)(id, ...rest) };
});

const temporaryPaths: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const path of temporaryPaths.splice(0)) rmSync(path, { recursive: true, force: true });
});

function workspace() {
  const root = mkdtempSync(join(tmpdir(), "dojofoo-agent-api-workspace-"));
  const stateHome = mkdtempSync(join(tmpdir(), "dojofoo-agent-api-home-"));
  temporaryPaths.push(root, stateHome);
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({ currentDojo: "starter", currentKata: "001-first", editor: null, progress: {} }));
  mkdirSync(resolve(root, ".dojos", "starter"), { recursive: true });
  writeFileSync(resolve(root, ".dojos", "starter", "dojo.yaml"), ["name: '@test/starter'", "version: 1.0.0", "description: A course.", "test: echo ok", "katas: []"].join("\n"));
  mkdirSync(resolve(root, ".dojo"), { recursive: true });
  writeFileSync(resolve(root, ".dojo", "runtimes.json"), JSON.stringify({ agent: "codex" }));
  const state = { stateHome };
  return { root, state, workspaceId: observeWorkspacePath(root, state) };
}

function runtime(start = async () => ({ url: "http://127.0.0.1:9" })) {
  const { root, state, workspaceId } = workspace();
  const owned = { start: vi.fn(start), close: vi.fn(async () => {}) };
  return { root, workspaceId, owned, local: createLocalAgentRuntime({ state, runtime: async () => owned }) };
}

describe("local agent runtime", () => {
  it("lists the workspace's selected coding agent first and the others it supports", async () => {
    const { local, workspaceId } = runtime();
    const agents = await local.agents(workspaceId);
    expect(agents[0]).toEqual({ id: "codex", name: "Codex", selected: true, status: "stopped" });
    expect(agents.map(agent => agent.id)).toEqual(["codex", "claude", "cursor", "grok", "opencode", "fx"]);
  });

  it("accepts registered standalone authoring courses without learner workspace configuration", async () => {
    const { root, state, workspaceId } = workspace();
    rmSync(resolve(root, ".dojorc"));
    writeFileSync(resolve(root, "dojo.yaml"), "name: '@test/draft'\nversion: 1.0.0\n");
    const local = createLocalAgentRuntime({ state, runtime: async () => { throw new Error("Listing must not start an agent"); } });
    expect(await local.agents(workspaceId)).not.toHaveLength(0);
  });

  it("can retry a failed start after releasing the failed runtime", async () => {
    const { state, workspaceId } = workspace();
    let released = false;
    const failed = { start: async () => { throw new Error("Start failed"); }, close: async () => { released = true; } };
    const recovered = { start: async () => ({ url: "http://127.0.0.1:9" }), close: async () => {} };
    const local = createLocalAgentRuntime({ state, runtime: async () => released ? recovered : failed });
    await expect(local.connect(workspaceId, { agent: "codex", persona: "kyoshi" })).rejects.toMatchObject({ code: "agent_failed" });
    await expect(local.connect(workspaceId, { agent: "codex", persona: "kyoshi" })).resolves.toBeDefined();
    expect((await local.agents(workspaceId))[0].status).toBe("ready");
  });

  it("starts the selected agent in the background and reports when it's ready", async () => {
    const { local, workspaceId, owned } = runtime();
    expect(await local.start(workspaceId, "codex")).toMatchObject({ status: "starting" });
    await vi.waitFor(async () => expect((await local.agents(workspaceId))[0].status).toBe("ready"));
    await local.connect(workspaceId, { agent: "codex", persona: "kyoshi" });
    expect(owned.start).toHaveBeenCalledTimes(1);
    expect(await local.stop(workspaceId, "codex")).toMatchObject({ status: "stopped" });
    expect(owned.close).toHaveBeenCalledTimes(1);
  });

  it("reports a failed start with its reason", async () => {
    const { local, workspaceId } = runtime(async () => { throw new Error("codex is not installed"); });
    await local.start(workspaceId, "codex");
    await vi.waitFor(async () => expect((await local.agents(workspaceId))[0]).toMatchObject({ status: "failed", message: "codex is not installed" }));
    await expect(local.connect(workspaceId, { agent: "codex", persona: "kyoshi" })).rejects.toMatchObject({ status: 503, code: "agent_failed" });
  });

  it("refuses unknown workspaces and other coding agents", async () => {
    const { local, workspaceId } = runtime();
    await expect(local.agents("missing")).rejects.toMatchObject({ status: 404, code: "workspace_not_found" });
    await expect(local.start(workspaceId, "pi")).rejects.toMatchObject({ status: 409, code: "agent_unavailable" });
    await expect(local.start(workspaceId, "nope")).rejects.toMatchObject({ status: 404, code: "agent_not_found" });
  });

  it("connects a learner workspace to its Sensei host", async () => {
    const { state, workspaceId } = workspace();
    const targets: unknown[] = [];
    const owned = { start: vi.fn(async () => ({ url: "http://127.0.0.1:9", secret: "s".repeat(64) })), close: vi.fn(async () => {}) };
    const local = createLocalAgentRuntime({ state, runtime: async (_root, target) => { targets.push(target); return owned; } });
    await expect(local.connect(workspaceId, { agent: "codex", persona: "sensei" })).resolves.toEqual({ baseUrl: "http://127.0.0.1:9", headers: {} });
    expect(targets).toEqual([{ persona: "sensei", workspaceId, hostPortUrl: expect.stringMatching(/^http:\/\/.+\/api\/host-port$/u) }]);
  });

  it("refuses a saved selection that is no longer offered with 409 agent_not_offered", async () => {
    const { local, workspaceId, root, owned } = runtime();
    writeFileSync(resolve(root, ".dojo", "runtimes.json"), JSON.stringify({ agent: "pi" }));
    const agent = (await local.agents(workspaceId))[0]!.id;
    await expect(local.connect(workspaceId, { agent, persona: "sensei" })).rejects.toMatchObject({ status: 409, code: "agent_not_offered" });
    await expect(local.start(workspaceId, agent)).rejects.toMatchObject({ status: 409, code: "agent_not_offered" });
    expect(owned.start).not.toHaveBeenCalled();
  });

  it("stops a host after the idle bound when nothing uses it", async () => {
    const { state, workspaceId } = workspace();
    const owned = { start: vi.fn(async () => ({ url: "http://127.0.0.1:9" })), close: vi.fn(async () => {}) };
    const local = createLocalAgentRuntime({ state, runtime: async () => owned, idleStopMs: 100, idleCheckMs: 20 });
    await local.connect(workspaceId, kyoshi);
    // A request and an open stream are presence
    const stream = local.activity!(workspaceId, "stream");
    await new Promise(resolve => setTimeout(resolve, 250));
    expect(owned.close).not.toHaveBeenCalled();
    stream();
    await vi.waitFor(() => expect(owned.close).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    expect((await local.agents(workspaceId))[0]!.status).toBe("stopped");
  });

  it("keeps a host with a paused session", async () => {
    const { state, workspaceId } = workspace();
    const owned = { start: vi.fn(async () => ({ url: "http://127.0.0.1:9" })), close: vi.fn(async () => {}) };
    const local = createLocalAgentRuntime({ state, runtime: async () => owned, idleStopMs: 50, idleCheckMs: 20 });
    await local.sessions.save(workspaceId, { id: "s-paused", agent: "codex", persona: "sensei", createdAt: "2026-11-04T00:00:00.000Z", revision: 0,
      lifecycle: { status: "paused", turnId: "turn_0", updatedAt: "2026-11-04T00:00:00.000Z" } });
    // The reconcile at connect reads the turn as open: the host is unreachable, so nothing settles it
    await local.connect(workspaceId, kyoshi);
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(owned.close).not.toHaveBeenCalled();
  });

  it("reconciles a working record without an open turn to idle when the host is ready", async () => {
    const eve = await streamEve([{ type: "turn.started", turnId: "turn_0" }, { type: "turn.settled", turnId: "turn_0" }]);
    try {
      const { state, workspaceId } = workspace();
      const owned = { start: vi.fn(async () => ({ url: eve.url })), close: vi.fn(async () => {}) };
      const local = createLocalAgentRuntime({ state, runtime: async () => owned });
      const working = { id: "s-working", agent: "codex", persona: "sensei" as const, createdAt: "2026-11-04T00:00:00.000Z", revision: 0,
        lifecycle: { status: "working" as const, beginPending: { idempotencyKey: "begin:s-working:0", sentAt: "2026-11-04T00:00:00.000Z" }, updatedAt: "2026-11-04T00:00:00.000Z" } };
      await local.sessions.save(workspaceId, working);
      await local.sessions.save(workspaceId, { ...working, id: "s-other-agent", agent: "claude" });
      await local.connect(workspaceId, kyoshi);
      expect((await local.sessions.get(workspaceId, "s-working"))?.lifecycle).toMatchObject({ status: "idle" });
      // A pending begin stays for the next open to resend with its key
      expect((await local.sessions.get(workspaceId, "s-working"))?.lifecycle).toHaveProperty("beginPending");
      expect((await local.sessions.get(workspaceId, "s-other-agent"))?.lifecycle).toMatchObject({ status: "working" });
    } finally { await eve.close(); }
  });

  it("connect refuses Cursor for Sensei with 409 agent_not_offered while no passing Sensei record exists", async () => {
    installed.cursor = true;
    try {
      const { root, state, workspaceId } = workspace();
      writeFileSync(resolve(root, ".dojo", "runtimes.json"), JSON.stringify({ agent: "cursor" }));
      const runtimeStub = vi.fn(async () => ({ start: async () => ({ url: "http://127.0.0.1:9" }), close: async () => {} }));
      const local = createLocalAgentRuntime({ state, runtime: runtimeStub });
      await expect(local.connect(workspaceId, { agent: "cursor", persona: "sensei" })).rejects.toMatchObject({ status: 409, code: "agent_not_offered",
        message: "Cursor can't teach here yet: its Sensei checks haven't passed. Choose another coding agent." });
      expect(runtimeStub).not.toHaveBeenCalled();
    } finally { installed.cursor = false; }
  });

  it("connect still starts Kyoshi on Cursor for a draft", async () => {
    installed.cursor = true;
    try {
      const { root, state } = workspace();
      const workspaceId = observeWorkspacePath(root, { ...state, kind: "draft" });
      writeFileSync(resolve(root, ".dojo", "runtimes.json"), JSON.stringify({ agent: "cursor" }));
      const targets: Array<{ persona: string }> = [];
      const local = createLocalAgentRuntime({ state, runtime: async (_root, target) => { targets.push(target); return { start: async () => ({ url: "http://127.0.0.1:9" }), close: async () => {} }; } });
      await expect(local.connect(workspaceId, { agent: "cursor", persona: "kyoshi" })).resolves.toBeDefined();
      expect(targets.map(target => target.persona)).toEqual(["kyoshi"]);
    } finally { installed.cursor = false; }
  });

  it("select still accepts Cursor for a learner workspace", async () => {
    const { local, workspaceId, root } = runtime();
    expect(await local.select(workspaceId, "cursor")).toMatchObject({ id: "cursor", selected: true });
    expect(savedAgent(root)).toBe("cursor");
  });

  it("keeps sessions in the workspace's .dojo folder", async () => {
    const { local, workspaceId, root } = runtime();
    const session = { id: "s1", agent: "codex", persona: "kyoshi" as const, createdAt: "2026-10-28T12:00:00.000Z", revision: 0 };
    await Promise.all([local.sessions.save(workspaceId, session), local.sessions.save(workspaceId, { ...session, id: "s2" })]);
    expect(await local.sessions.list(workspaceId)).toEqual([session, { ...session, id: "s2" }]);
    expect(JSON.parse(readFileSync(resolve(root, ".dojo", "agent-sessions.json"), "utf8")).sessions).toHaveLength(2);
  });

  it("finds only the sessions it keeps", async () => {
    const { local, workspaceId } = runtime();
    expect(await local.sessions.get(workspaceId, "wrun_unknown")).toBeUndefined();
  });

  it("restarts the host when the workspace selects another coding agent", async () => {
    const { local, workspaceId, owned, root } = runtime();
    await local.connect(workspaceId, { agent: "codex", persona: "kyoshi" });
    writeAgent(root, "opencode");
    await local.connect(workspaceId, { agent: "opencode", persona: "kyoshi" });
    expect(owned.close).toHaveBeenCalledTimes(1);
    expect(owned.start).toHaveBeenCalledTimes(2);
    await expect(local.connect(workspaceId, { agent: "codex", persona: "kyoshi" })).rejects.toMatchObject({ code: "agent_unavailable" });
  });

  it("starts a host that exited on its own again", async () => {
    let exit!: () => void;
    const { local, workspaceId, owned } = runtime(async () => ({ url: "http://127.0.0.1:9", exited: new Promise<void>(resolve => { exit = resolve; }) }));
    await local.connect(workspaceId, { agent: "codex", persona: "kyoshi" });
    exit();
    await vi.waitFor(async () => expect((await local.agents(workspaceId))[0].status).toBe("stopped"));
    await local.connect(workspaceId, { agent: "codex", persona: "kyoshi" });
    expect(owned.start).toHaveBeenCalledTimes(2);
  });
});

const savedAgent = (root: string) => JSON.parse(readFileSync(resolve(root, ".dojo", "runtimes.json"), "utf8")).agent;
const kyoshi = { agent: "codex", persona: "kyoshi" as const };

/** An Eve host whose sessions each have a turn that never settles; it records cancel requests. */
async function unsettledEve() {
  const cancels: Array<{ sessionId: string; body: string }> = [];
  const body = async (request: IncomingMessage) => { let text = ""; for await (const chunk of request) text += chunk; return text; };
  const server = createServer(async (request, response) => {
    const match = /^\/eve\/v1\/session\/([^/]+)\/(cancel|stream)/u.exec(new URL(request.url!, "http://eve").pathname);
    if (match?.[2] === "cancel" && request.method === "POST") {
      cancels.push({ sessionId: decodeURIComponent(match[1]!), body: await body(request) });
      response.writeHead(202, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, sessionId: match[1], deliveryId: "delivery_cancel" }));
      return;
    }
    if (match?.[2] === "stream") {
      const at = new Date().toISOString();
      const lines = [
        { at, facts: [{ type: "session.started", data: { runtime: { agentId: "fake", agentName: "fake", eveVersion: "1.0.0-rc.1" } } }] },
        { at, facts: [{ type: "turn.started", data: { cause: { deliveryId: "d1" }, follows: null, turnId: "turn_0" }, scope: { turnId: "turn_0" } }] },
      ];
      response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "x-eve-stream-version": "27", "x-eve-stream-format": "ndjson",
        "x-eve-stream-tail-index": String(lines.length - 1) }).end(lines.map(line => JSON.stringify(line)).join("\n") + "\n");
      return;
    }
    response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, cancels, close: () => new Promise<void>(accept => server.close(() => accept())) };
}

/** An Eve host whose session stream holds the given turn events (it answers every session). */
async function streamEve(facts: Array<{ type: string; turnId: string }>) {
  const server = createServer((request, response) => {
    if (!/^\/eve\/v1\/session\/[^/]+\/stream/u.test(new URL(request.url!, "http://eve").pathname)) return response.writeHead(404).end();
    const at = new Date().toISOString();
    const lines = [
      { at, facts: [{ type: "session.started", data: { runtime: { agentId: "fake", agentName: "fake", eveVersion: "1.0.0-rc.1" } } }] },
      ...facts.map(fact => ({ at, facts: [{ type: fact.type, data: fact.type === "turn.started"
        ? { cause: { deliveryId: "d1" }, follows: null, turnId: fact.turnId } : { turnId: fact.turnId, outcome: "completed", reply: [] }, scope: { turnId: fact.turnId } }] })),
    ];
    response.writeHead(200, { "content-type": "application/x-ndjson; charset=utf-8", "x-eve-stream-version": "27", "x-eve-stream-format": "ndjson",
      "x-eve-stream-tail-index": String(lines.length - 1) }).end(lines.map(line => JSON.stringify(line)).join("\n") + "\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>(accept => server.close(() => accept())) };
}

describe("select", () => {
  it("select saves the agent only after the old host has stopped", async () => {
    const { local, workspaceId, owned, root } = runtime();
    await local.connect(workspaceId, kyoshi);
    owned.close.mockImplementation(async () => { expect(savedAgent(root)).toBe("codex"); });
    expect(await local.select(workspaceId, "opencode")).toEqual({ id: "opencode", name: "OpenCode", selected: true, status: "stopped" });
    expect(owned.close).toHaveBeenCalledTimes(1);
    expect(savedAgent(root)).toBe("opencode");
  });

  it("select cancels the old agent's sessions without a turnId and waits at most the switch bound", async () => {
    const eve = await unsettledEve();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { root, state, workspaceId } = workspace();
      const owned = { start: vi.fn(async () => ({ url: eve.url })), close: vi.fn(async () => {}) };
      const local = createLocalAgentRuntime({ state, runtime: async () => owned, switchSettleMs: 200 });
      for (const id of ["s1", "s2"]) await local.sessions.save(workspaceId, { id, agent: "codex", persona: "kyoshi", createdAt: "2026-11-01T00:00:00.000Z", revision: 0 });
      await local.sessions.save(workspaceId, { id: "other-agent", agent: "claude", persona: "kyoshi", createdAt: "2026-11-01T00:00:00.000Z", revision: 0 });
      await local.connect(workspaceId, kyoshi);
      const started = performance.now();
      await local.select(workspaceId, "opencode");
      const elapsed = performance.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(200);
      expect(elapsed).toBeLessThan(2_000);
      expect(eve.cancels.map(cancel => cancel.sessionId).sort()).toEqual(["s1", "s2"]);
      for (const { body } of eve.cancels) expect(body ? JSON.parse(body) : {}).not.toHaveProperty("turnId");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("s1"));
      expect(owned.close).toHaveBeenCalledTimes(1);
      expect(savedAgent(root)).toBe("opencode");
    } finally { warn.mockRestore(); await eve.close(); }
  });

  it("selecting the current agent changes nothing", async () => {
    const { local, workspaceId, owned, root } = runtime();
    await local.connect(workspaceId, kyoshi);
    const before = readFileSync(resolve(root, ".dojo", "runtimes.json"), "utf8");
    expect(await local.select(workspaceId, "codex")).toMatchObject({ id: "codex", selected: true, status: "ready" });
    expect(owned.close).not.toHaveBeenCalled();
    expect(readFileSync(resolve(root, ".dojo", "runtimes.json"), "utf8")).toBe(before);
  });

  it("select refuses unknown and not-offered agents", async () => {
    const { local, workspaceId, root } = runtime();
    await expect(local.select(workspaceId, "nope")).rejects.toMatchObject({ status: 404, code: "agent_not_found" });
    await expect(local.select(workspaceId, "constructor")).rejects.toMatchObject({ status: 404, code: "agent_not_found" });
    await expect(local.select(workspaceId, "pi")).rejects.toMatchObject({ status: 409, code: "agent_not_offered", message: "Pi isn't available yet. Choose another coding agent." });
    await expect(local.select("missing", "opencode")).rejects.toMatchObject({ status: 404, code: "workspace_not_found" });
    expect(savedAgent(root)).toBe("codex");
  });

  it("two selects for one workspace run one after the other", async () => {
    const { local, workspaceId, owned, root } = runtime();
    await local.connect(workspaceId, kyoshi);
    const stopped = Promise.withResolvers<void>();
    owned.close.mockImplementation(() => stopped.promise);
    const first = local.select(workspaceId, "opencode");
    const second = local.select(workspaceId, "claude");
    await vi.waitFor(() => expect(owned.close).toHaveBeenCalledTimes(1));
    expect(savedAgent(root)).toBe("codex");
    stopped.resolve();
    expect((await first).id).toBe("opencode");
    expect((await second).id).toBe("claude");
    expect(savedAgent(root)).toBe("claude");
    expect(owned.close).toHaveBeenCalledTimes(1);
  });

  it("connect waits for a switch in progress and starts the new agent", async () => {
    const { local, workspaceId, owned } = runtime();
    await local.connect(workspaceId, kyoshi);
    const stopped = Promise.withResolvers<void>();
    owned.close.mockImplementation(() => stopped.promise);
    const switched = local.select(workspaceId, "opencode");
    await vi.waitFor(() => expect(owned.close).toHaveBeenCalledTimes(1));
    const connected = local.connect(workspaceId, { agent: "opencode", persona: "kyoshi" });
    stopped.resolve();
    await switched;
    await expect(connected).resolves.toEqual({ baseUrl: "http://127.0.0.1:9", headers: {} });
    expect(owned.start).toHaveBeenCalledTimes(2);
  });
});

describe("persona", () => {
  it("a draft runs Kyoshi", async () => {
    const { root, state } = workspace();
    const workspaceId = observeWorkspacePath(root, { ...state, kind: "draft" });
    expect(await createLocalAgentRuntime({ state, runtime: async () => { throw new Error("unused"); } }).persona(workspaceId)).toBe("kyoshi");
  });

  it("a learner workspace and an evaluation trial run Sensei", async () => {
    const learner = workspace();
    const trial = workspace();
    const trialId = observeLocalContext(trial.root, { ...learner.state, kind: "evaluation-trial" })!.workspaceId;
    const local = createLocalAgentRuntime({ state: learner.state, runtime: async () => { throw new Error("unused"); } });
    expect(await local.persona(learner.workspaceId)).toBe("sensei");
    expect(await local.persona(trialId)).toBe("sensei");
  });

  it("an unknown workspace is not found", async () => {
    const { local } = runtime();
    await expect(local.persona("missing")).rejects.toMatchObject({ status: 404, code: "workspace_not_found" });
  });

  it("a workspace without a kind uses the draft rule", async () => {
    const { root, state, workspaceId } = workspace();
    const db = new DatabaseSync(resolve(state.stateHome, "dojofoo.db"));
    db.exec("UPDATE workspaces SET kind = NULL");
    db.close();
    const local = createLocalAgentRuntime({ state, runtime: async () => { throw new Error("unused"); } });
    expect(await local.persona(workspaceId)).toBe("sensei");
    writeFileSync(resolve(root, ".dojo", "kyoshi.json"), "{}");
    expect(await local.persona(workspaceId)).toBe("kyoshi");
  });
});

describe("mounted in the UI server", () => {
  it("serves /api/v1 from the agent API with the public error shape", async () => {
    const response = await app.fetch(new Request("http://localhost/api/v1/workspaces/does-not-exist/agents"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "workspace_not_found", message: "Workspace not found." });
  });

  it("leaves the existing routes alone", async () => {
    const response = await app.fetch(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
  });
});
