import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeLocalContext, observeWorkspacePath, setWorkspaceKind } from "@dojofoo/config/local-state";
import { DatabaseSync } from "node:sqlite";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import { readAgentEffort, readAgentModel, writeAgent } from "@dojofoo/config/runtime";
import { app } from "./app";
import { createLocalAgentRuntime } from "./agent-api";
import { guardFor } from "./agent-session/guard-store";
import { saveRecord } from "./agent-session/records";
import { kataWorkspace, removeRoots } from "./agent-session/test-kata.fixture";

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
    expect(agents.map(agent => agent.id)).toEqual(["codex", "claude", "grok", "opencode", "fx", "pi"]);
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

  it("an evaluation-trial host starts with the trial ceiling and a learner host without one", async () => {
    const learner = workspace();
    const trial = workspace();
    setWorkspaceKind(trial.workspaceId, "evaluation-trial", trial.state);
    const targets: unknown[] = [];
    const owned = { start: vi.fn(async () => ({ url: "http://127.0.0.1:9", secret: "s".repeat(64) })), close: vi.fn(async () => {}) };
    for (const { state, workspaceId } of [learner, trial]) {
      const local = createLocalAgentRuntime({ state, runtime: async (_root, target) => { targets.push(target); return owned; } });
      await local.connect(workspaceId, { agent: "codex", persona: "sensei" });
    }
    expect(targets).toEqual([
      { persona: "sensei", workspaceId: learner.workspaceId, hostPortUrl: expect.any(String) },
      { persona: "sensei", workspaceId: trial.workspaceId, hostPortUrl: expect.any(String), usageCeiling: { newInputTokens: 3_000_000, outputTokens: 300_000 } },
    ]);
  });

  it("refuses a saved selection that is no longer offered with 409 agent_not_offered", async () => {
    const { local, workspaceId, root, owned } = runtime();
    writeFileSync(resolve(root, ".dojo", "runtimes.json"), JSON.stringify({ agent: "agy" }));
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

  it("reconciles a working record whose session Eve doesn't know (404) when the host is ready", async () => {
    const eve = await unknownSessionsEve();
    try {
      const { state, workspaceId } = workspace();
      vi.stubEnv("DOJOFOO_HOME", state.stateHome);
      const local = createLocalAgentRuntime({ state, runtime: async () => ({ start: async () => ({ url: eve.url }), close: async () => {} }) });
      await local.sessions.save(workspaceId, { id: "s-unknown", agent: "codex", persona: "kyoshi", createdAt: "2026-11-04T00:00:00.000Z", revision: 0,
        lifecycle: { status: "working", updatedAt: "2026-11-04T00:00:00.000Z" } });
      await local.connect(workspaceId, kyoshi);
      expect((await local.sessions.get(workspaceId, "s-unknown"))?.lifecycle).toMatchObject({ status: "idle" });
    } finally { await eve.close(); }
  });

  it("a ready host reconciles a record a lost report left working, once it went unchanged for the grace period", async () => {
    const eve = await streamEve([{ type: "turn.started", turnId: "turn_0" }, { type: "turn.settled", turnId: "turn_0" }]);
    try {
      const { state, workspaceId } = workspace();
      vi.stubEnv("DOJOFOO_HOME", state.stateHome);
      const local = createLocalAgentRuntime({ state, runtime: async () => ({ start: async () => ({ url: eve.url }), close: async () => {} }),
        idleCheckMs: 20, reconcileAfterMs: 1_000 });
      await local.connect(workspaceId, kyoshi);
      // Its turn settled in Eve after the host became ready, and the hook's turn.settled never arrived
      await local.sessions.save(workspaceId, { id: "s-lost", agent: "codex", persona: "kyoshi", createdAt: "2026-11-04T00:00:00.000Z", revision: 0,
        lifecycle: { status: "working", updatedAt: new Date().toISOString() } });
      await new Promise(resolve => setTimeout(resolve, 100));
      // Within the grace period it could be a delivery whose turn hasn't started yet
      expect((await local.sessions.get(workspaceId, "s-lost"))?.lifecycle).toMatchObject({ status: "working" });
      await vi.waitFor(async () => expect((await local.sessions.get(workspaceId, "s-lost"))?.lifecycle).toMatchObject({ status: "idle" }), { timeout: 3_000 });
    } finally { await eve.close(); }
  });

  it("a saved Cursor starts neither Sensei nor Kyoshi while it has no passing record, even with its CLI installed", async () => {
    installed.cursor = true;
    try {
      for (const kind of ["learner", "draft"] as const) {
        const { root, state } = workspace();
        const workspaceId = observeWorkspacePath(root, { ...state, kind });
        writeFileSync(resolve(root, ".dojo", "runtimes.json"), JSON.stringify({ agent: "cursor" }));
        const runtimeStub = vi.fn(async () => ({ start: async () => ({ url: "http://127.0.0.1:9" }), close: async () => {} }));
        const local = createLocalAgentRuntime({ state, runtime: runtimeStub });
        const agent = (await local.agents(workspaceId))[0]!.id;
        expect(agent, kind).not.toBe("cursor");
        await expect(local.connect(workspaceId, { agent, persona: kind === "draft" ? "kyoshi" : "sensei" })).rejects.toMatchObject({ status: 409, code: "agent_not_offered",
          message: "Cursor isn't available yet. Choose another coding agent." });
        expect(runtimeStub, kind).not.toHaveBeenCalled();
      }
    } finally { installed.cursor = false; }
  });

  it("select refuses Cursor for a learner workspace and for a draft while it has no passing record", async () => {
    const { local, workspaceId, root } = runtime();
    await expect(local.select(workspaceId, "cursor")).rejects.toMatchObject({ status: 409, code: "agent_not_offered",
      message: "Cursor isn't available yet. Choose another coding agent." });
    expect(savedAgent(root)).toBe("codex");
    const draft = workspace();
    writeFileSync(resolve(draft.root, "dojo.yaml"), "name: '@test/draft'\nversion: 1.0.0\n");
    setWorkspaceKind(draft.workspaceId, "draft", draft.state);
    const authoring = createLocalAgentRuntime({ state: draft.state, runtime: async () => ({ start: async () => ({ url: "http://127.0.0.1:9" }), close: async () => {} }) });
    await expect(authoring.select(draft.workspaceId, "cursor")).rejects.toMatchObject({ status: 409, code: "agent_not_offered",
      message: "Cursor isn't available yet. Choose another coding agent." });
    expect(savedAgent(draft.root)).toBe("codex");
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

/** An Eve host that has no sessions: every stream answers 404, as Eve does for a session it doesn't know. */
async function unknownSessionsEve() {
  const server = createServer((_request, response) => {
    response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "Session not found.", ok: false }));
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
    await expect(local.select(workspaceId, "agy")).rejects.toMatchObject({ status: 409, code: "agent_not_offered", message: "Antigravity isn't available yet. Choose another coding agent." });
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

describe("switching and host stops (step 5)", () => {
  const roots: string[] = [];
  const cleanups: Array<() => void> = [];
  afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); vi.restoreAllMocks(); removeRoots(roots); });
  const kata = (endpoint: string) => {
    const workspace = kataWorkspace(roots, { baseUrl: endpoint });
    cleanups.push(workspace.cleanup);
    return workspace;
  };
  const message = { kind: "message" as const, text: "Hello" };

  it("a switch whose turn does not settle in time marks it interrupted with its turn id and leaves no open window", async () => {
    const eve = await unsettledEve();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { root, workspaceId, record, file } = kata(eve.url);
      const local = createLocalAgentRuntime({ runtime: async () => ({ start: async () => ({ url: eve.url }), close: async () => {} }), switchSettleMs: 200 });
      const session = record();
      await local.sessions.save(workspaceId, session);
      await local.connect(workspaceId, { agent: "codex", persona: "sensei" });
      await local.deliveries!.before(workspaceId, session, message);
      writeFileSync(file, "written by the old agent\n");
      await local.select(workspaceId, "opencode");
      expect((await local.sessions.get(workspaceId, session.id))?.lifecycle).toMatchObject({ status: "interrupted", interruptedTurnId: "turn_0", interruptedAt: expect.any(String) });
      expect(await guardFor(root).list()).toEqual([]);
      expect(readFileSync(file, "utf8")).toBe("export const answer = 0;\n");
      expect(savedAgent(root)).toBe("opencode");
    } finally { await eve.close(); }
  });

  it("connects wait for a switch at most its bound, then answer agent_switching", async () => {
    const { workspaceId } = kata("http://127.0.0.1:9");
    const stopped = Promise.withResolvers<void>();
    const local = createLocalAgentRuntime({ runtime: async () => ({ start: async () => ({ url: "http://127.0.0.1:9" }), close: () => stopped.promise }),
      switchSettleMs: 50, hostStopMs: 50 });
    await local.connect(workspaceId, { agent: "codex", persona: "sensei" });
    const switched = local.select(workspaceId, "opencode");
    await new Promise(resolve => setTimeout(resolve, 20));
    const started = performance.now();
    await expect(local.connect(workspaceId, { agent: "opencode", persona: "sensei" })).rejects.toMatchObject({ status: 409, code: "agent_switching", message: "Switching to OpenCode…" });
    expect(performance.now() - started).toBeLessThan(1_000);
    await expect(local.deliveries!.before(workspaceId, { id: "s", agent: "codex", persona: "sensei", createdAt: "", revision: 0 }, message)).rejects.toMatchObject({ code: "agent_switching" });
    stopped.resolve();
    await switched;
  });

  it("a same-agent host restart opens a recovery window for its working session and the settle closes it", async () => {
    const eve = await unsettledEve();
    try {
      const { root, workspaceId, local, record, call } = kata(eve.url);
      const session = record({ lifecycle: { status: "working", updatedAt: new Date().toISOString() } });
      await local.sessions.save(workspaceId, session);
      await local.sessions.save(workspaceId, record({ agent: "claude", lifecycle: { status: "working", updatedAt: new Date().toISOString() } }));
      await local.connect(workspaceId, { agent: "codex", persona: "sensei" });
      // Eve still reports the recovered run, so the reconcile keeps the window
      expect((await guardFor(root).list()).map(window => window.owner)).toEqual([session.id]);
      await call("turn.settled", session.id, { turnId: "turn_0", outcome: "completed" });
      expect(await guardFor(root).list()).toEqual([]);
    } finally { await eve.close(); }
  });

  it("a host that stops verifies its windows and drops held reports", async () => {
    const eve = await unsettledEve();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { workspaceId, local, record, file, messages } = kata(eve.url);
      const session = record({ lifecycle: { status: "working", updatedAt: new Date().toISOString(),
        heldReport: { observationId: "obs-1", text: "[dojo:check] Ran lesson checks.", heldAt: new Date().toISOString() } } });
      await local.sessions.save(workspaceId, session);
      await local.connect(workspaceId, { agent: "codex", persona: "sensei" });
      writeFileSync(file, "written before the stop\n");
      await local.stop(workspaceId, "codex");
      expect(readFileSync(file, "utf8")).toBe("export const answer = 0;\n");
      expect((await local.sessions.get(workspaceId, session.id))?.lifecycle?.heldReport).toBeUndefined();
      expect(messages.map(entry => entry.message.method)).toEqual(expect.arrayContaining(["guard.violation", "lesson.check.report"]));
    } finally { await eve.close(); }
  });
});

describe("model and effort", () => {
  it("a new conversation starts at its model's default effort after a model change cleared the last one", async () => {
    const { local, root, workspaceId } = runtime();
    await saveRecord(root, { id: "conversation", agent: "codex", persona: "sensei", createdAt: new Date().toISOString(), courseId: "starter", revision: 0 });
    await local.sessions.patch(workspaceId, "conversation", { effort: "high" });
    expect(readAgentEffort(root, "codex")).toBe("high");
    // The next model doesn't take "high", so the menu clears the effort along with the model change
    const updated = await local.sessions.patch(workspaceId, "conversation", { model: "gpt-6-luna", effort: null });
    expect(updated.effort).toBeUndefined();
    // What the workspace's next conversation starts on (agent-session/default.ts)
    expect(readAgentModel(root, "codex")).toBe("gpt-6-luna");
    expect(readAgentEffort(root, "codex")).toBeUndefined();
  });
});
