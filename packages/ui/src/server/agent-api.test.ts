import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { observeWorkspacePath } from "@dojofoo/config/local-state";
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
  const state = { stateHome };
  return { root, state, workspaceId: observeWorkspacePath(root, state) };
}

function runtime(start = async () => ({ url: "http://127.0.0.1:9" })) {
  const { root, state, workspaceId } = workspace();
  const owned = { start: vi.fn(start), close: vi.fn(async () => {}) };
  return { root, workspaceId, owned, local: createLocalAgentRuntime({ state, runtime: async () => owned }) };
}

describe("local agent runtime", () => {
  it("forwards the current page state without starting the agent or accepting a different workspace identity", async () => {
    const { local, workspaceId, owned } = runtime();
    const view = { scope: "lesson", lessonId: "first", file: "src/first/SENSEI.md", unsavedChanges: true };
    const request = new Request("http://localhost/api/v1/sessions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ forwardedProps: { view, workspaceId: "another-workspace" } }),
    });
    const body = await request.json();
    expect(await local.context?.(workspaceId, request, body.forwardedProps)).toEqual({ view, workspaceId });
    expect(owned.start).not.toHaveBeenCalled();
  });

  it("lists the workspace's selected coding agent first and the others it supports", async () => {
    vi.stubEnv("DOJOFOO_AUTHORING_HARNESS", "codex");
    const { local, workspaceId } = runtime();
    const agents = await local.agents(workspaceId);
    expect(agents[0]).toEqual({ id: "codex", name: "Codex", selected: true, status: "stopped" });
    expect(agents.map(agent => agent.id)).toEqual(["codex", "opencode", "pi", "cursor", "grok", "fx"]);
  });

  it("accepts registered standalone authoring courses without learner workspace configuration", async () => {
    const { root, state, workspaceId } = workspace();
    rmSync(resolve(root, ".dojorc"));
    writeFileSync(resolve(root, "dojo.yaml"), "name: '@test/draft'\nversion: 1.0.0\n");
    const local = createLocalAgentRuntime({ state, runtime: async () => { throw new Error("Listing must not start an agent"); } });
    expect(await local.agents(workspaceId)).not.toHaveLength(0);
  });

  it("can retry a failed start after releasing the failed runtime", async () => {
    vi.stubEnv("DOJOFOO_AUTHORING_HARNESS", "codex");
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
    vi.stubEnv("DOJOFOO_AUTHORING_HARNESS", "codex");
    const { local, workspaceId, owned } = runtime();
    expect(await local.start(workspaceId, "codex")).toMatchObject({ status: "starting" });
    await vi.waitFor(async () => expect((await local.agents(workspaceId))[0].status).toBe("ready"));
    await local.connect(workspaceId, { agent: "codex", persona: "kyoshi" });
    expect(owned.start).toHaveBeenCalledTimes(1);
    expect(await local.stop(workspaceId, "codex")).toMatchObject({ status: "stopped" });
    expect(owned.close).toHaveBeenCalledTimes(1);
  });

  it("reports a failed start with its reason", async () => {
    vi.stubEnv("DOJOFOO_AUTHORING_HARNESS", "codex");
    const { local, workspaceId } = runtime(async () => { throw new Error("codex is not installed"); });
    await local.start(workspaceId, "codex");
    await vi.waitFor(async () => expect((await local.agents(workspaceId))[0]).toMatchObject({ status: "failed", message: "codex is not installed" }));
    await expect(local.connect(workspaceId, { agent: "codex", persona: "kyoshi" })).rejects.toMatchObject({ status: 503, code: "agent_failed" });
  });

  it("refuses unknown workspaces, other coding agents and personas it can't run", async () => {
    vi.stubEnv("DOJOFOO_AUTHORING_HARNESS", "codex");
    const { local, workspaceId } = runtime();
    await expect(local.agents("missing")).rejects.toMatchObject({ status: 404, code: "workspace_not_found" });
    await expect(local.start(workspaceId, "pi")).rejects.toMatchObject({ status: 409, code: "agent_unavailable" });
    await expect(local.start(workspaceId, "nope")).rejects.toMatchObject({ status: 404, code: "agent_not_found" });
    await expect(local.connect(workspaceId, { agent: "codex", persona: "sensei" })).rejects.toMatchObject({ status: 409, code: "persona_unavailable" });
  });

  it("keeps sessions in the workspace's .dojo folder", async () => {
    vi.stubEnv("DOJOFOO_AUTHORING_HARNESS", "codex");
    const { local, workspaceId, root } = runtime();
    const session = { id: "s1", agent: "codex", persona: "kyoshi" as const, createdAt: "2026-10-28T12:00:00.000Z" };
    await Promise.all([local.sessions.save(workspaceId, session), local.sessions.save(workspaceId, { ...session, id: "s2" })]);
    expect(await local.sessions.list(workspaceId)).toEqual([session, { ...session, id: "s2" }]);
    expect(JSON.parse(readFileSync(resolve(root, ".dojo", "agent-sessions.json"), "utf8")).sessions).toHaveLength(2);
    // Sessions from the legacy authoring routes are Kyoshi's on the selected agent.
    expect(await local.sessions.get(workspaceId, "legacy")).toMatchObject({ id: "legacy", agent: "codex", persona: "kyoshi" });
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
