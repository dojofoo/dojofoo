import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeLocalContext, observeWorkspacePath } from "@dojofoo/config/local-state";
import { DatabaseSync } from "node:sqlite";
import { writeAgent } from "@dojofoo/config/runtime";
import { app } from "./app";
import { createLocalAgentRuntime } from "./agent-api";

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

  it("refuses unknown workspaces, other coding agents and personas it can't run", async () => {
    const { local, workspaceId } = runtime();
    await expect(local.agents("missing")).rejects.toMatchObject({ status: 404, code: "workspace_not_found" });
    await expect(local.start(workspaceId, "pi")).rejects.toMatchObject({ status: 409, code: "agent_unavailable" });
    await expect(local.start(workspaceId, "nope")).rejects.toMatchObject({ status: 404, code: "agent_not_found" });
    await expect(local.connect(workspaceId, { agent: "codex", persona: "sensei" })).rejects.toMatchObject({ status: 409, code: "persona_unavailable" });
  });

  it("keeps sessions in the workspace's .dojo folder", async () => {
    const { local, workspaceId, root } = runtime();
    const session = { id: "s1", agent: "codex", persona: "kyoshi" as const, createdAt: "2026-10-28T12:00:00.000Z" };
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
