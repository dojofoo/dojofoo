import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listSessions,
  observeLocalContext,
  observeWorkspacePath,
  recordDojoLifecycle,
} from "@dojofoo/config/local-state";
import { buildControlRoutes } from "./routes";
import * as scaffold from "@dojofoo/authoring/scaffold";
import { resolveRequestWorkspace, WORKSPACE_HEADER } from "./workspace";

const temporaryPaths: string[] = [];

afterEach(() => {
  for (const path of temporaryPaths.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dojofoo-control-workspace-"));
  const stateHome = mkdtempSync(join(tmpdir(), "dojofoo-control-home-"));
  temporaryPaths.push(root, stateHome);
  writeFileSync(resolve(root, ".dojorc"), JSON.stringify({
    currentDojo: "starter",
    currentKata: "001-first",
    editor: null,
    progress: { starter: { completed: [], lastActive: "001-first" } },
  }));
  mkdirSync(resolve(root, ".dojos", "starter"), { recursive: true });
  writeFileSync(resolve(root, ".dojos", "starter", "dojo.yaml"), [
    "name: '@test/starter'",
    "version: 1.0.0",
    "description: A kata course.",
    "test: echo ok",
    "katas:",
    "  - name: 001-first",
    "    template: katas/001-first/solution.ts",
  ].join("\n"));
  return { root, stateHome };
}

describe("local control-plane API", () => {
  it.each(["create-your-own-dojo", "how-to-run-a-dojo"])("installs %s only in the explicitly selected workspace", async courseId => {
    const { root, stateHome } = fixture();
    const workspaceId = observeWorkspacePath(root, { stateHome });
    const installStarter = vi.fn(async (_root: string, _id: string) => {});
    const routes = buildControlRoutes({ stateHome, installStarter });
    const install = (id: string, workspace: string) => routes.request(`/starters/${id}/install`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId: workspace }),
    });
    expect((await install(courseId, "unknown-workspace")).status).toBe(404);
    expect((await install("unknown-course", workspaceId)).status).toBe(404);
    expect(installStarter).not.toHaveBeenCalled();
    const response = await install(courseId, workspaceId);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ workspaceId, courseId });
    expect(installStarter).toHaveBeenCalledExactlyOnceWith(root, courseId);
    installStarter.mockRejectedValueOnce(new Error("Course already installed; existing edits preserved."));
    const duplicate = await install(courseId, workspaceId);
    expect(duplicate.status).toBe(500);
    expect(await duplicate.json()).toEqual({ error: "Course already installed; existing edits preserved." });
    expect((await routes.request(`/starters/${courseId}/install`, { method: "POST", headers: { Origin: "https://other.invalid" }, body: JSON.stringify({ workspaceId }) })).status).toBe(403);
    expect(installStarter).toHaveBeenCalledTimes(2);
  });

  it("cleans only its new directory when scaffolding fails and leaves no registered draft", async () => {
    const { root, stateHome } = fixture();
    const original = readFileSync(resolve(root, ".dojorc"), "utf8");
    const fail = vi.spyOn(scaffold, "scaffoldAuthoringWorkspace").mockImplementationOnce(({ root }) => {
      writeFileSync(resolve(root, "partial.txt"), "Partial scaffold");
      throw new Error("Scaffold unavailable");
    });
    try {
      const routes = buildControlRoutes({ stateHome });
      const response = await routes.request("/authoring", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Draft" }) });
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({ error: "Scaffold unavailable" });
      expect(readdirSync(resolve(stateHome, "drafts"))).toEqual([]);
      expect(await (await routes.request("/authoring")).json()).toEqual([]);
      expect(readFileSync(resolve(root, ".dojorc"), "utf8")).toBe(original);
    } finally { fail.mockRestore(); }
  });

  it("creates independently registered kata drafts without changing an installation or starting an agent", async () => {
    const { root, stateHome } = fixture();
    const original = readFileSync(resolve(root, ".dojorc"), "utf8");
    const routes = buildControlRoutes({ stateHome, now: 200 });
    const create = () => routes.request("/authoring", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost" }, body: JSON.stringify({ name: "My first course" }) });
    const firstResponse = await create();
    expect(firstResponse.status).toBe(201);
    const first = await firstResponse.json();
    const second = await (await create()).json();
    expect(first.workspaceId).not.toBe(second.workspaceId);
    expect(first.path).not.toBe(second.path);
    expect(first.path.startsWith(resolve(stateHome, "drafts") + "/")).toBe(true);
    expect(readFileSync(resolve(first.path, "dojo.yaml"), "utf8")).toContain("name: My first course");
    expect(existsSync(resolve(first.path, "DOJO.md"))).toBe(true);
    expect(existsSync(resolve(first.path, "mise.toml"))).toBe(true);
    expect(existsSync(resolve(first.path, ".dojo/config.yaml"))).toBe(true);
    const restarted = buildControlRoutes({ stateHome, now: 300 });
    expect(await (await restarted.request("/authoring")).json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ workspaceId: first.workspaceId, path: first.path, name: "My first course", sessionId: null }),
      expect.objectContaining({ workspaceId: second.workspaceId }),
    ]));
    expect(resolveRequestWorkspace(new Request(`http://localhost/api/authoring/draft?workspace=${first.workspaceId}`), { stateHome })).toBe(first.path);
    expect(await (await restarted.request("/courses")).json()).toEqual([]);
    expect(listSessions({ stateHome })).toEqual([]);
    expect(readFileSync(resolve(root, ".dojorc"), "utf8")).toBe(original);
  });

  it("rejects malformed, unsupported and foreign-origin draft requests before creating files", async () => {
    const { stateHome } = fixture();
    const routes = buildControlRoutes({ stateHome });
    for (const body of [{ name: "" }, { name: "x".repeat(121) }, { name: "bad\nname" }, { name: "Draft", path: "/tmp/must-not-create" }, { name: "Draft", style: "interactive" }]) {
      const response = await routes.request("/authoring", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      expect(response.status).toBe(422);
    }
    expect((await routes.request("/authoring", { method: "POST", headers: { "content-type": "application/json" }, body: "{" })).status).toBe(400);
    expect((await routes.request("/authoring", { method: "POST", headers: { "content-type": "application/json", origin: "https://other.example" }, body: JSON.stringify({ name: "Draft" }) })).status).toBe(403);
    expect(existsSync(resolve(stateHome, "drafts"))).toBe(false);
    expect(readdirSync(stateHome)).toEqual([]);
  });

  it("lists resumable Kyoshi drafts without requiring an installed dojo", async () => {
    const root = mkdtempSync(join(tmpdir(), "dojofoo-authoring-workspace-"));
    const stateHome = mkdtempSync(join(tmpdir(), "dojofoo-authoring-home-"));
    temporaryPaths.push(root, stateHome);
    mkdirSync(resolve(root, ".dojo"), { recursive: true });
    writeFileSync(resolve(root, ".dojo", "kyoshi.json"), JSON.stringify({ sessionId: "kyoshi-1" }));
    writeFileSync(resolve(root, "dojo.yaml"), "mode: katas\nname: typescript-patterns\ndescription: Practice TS patterns.\n");
    const workspaceId = observeWorkspacePath(root, { stateHome, now: 100 });

    const response = await buildControlRoutes({ stateHome, now: 200 }).request("/authoring");

    expect(await response.json()).toEqual([expect.objectContaining({
      workspaceId,
      name: "typescript-patterns",
      sessionId: "kyoshi-1",
    })]);
  });
  it("lists a freshly installed kata course before its first attempt", async () => {
    const { root, stateHome } = fixture();
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify({
      currentDojo: "starter",
      currentKata: null,
      editor: "code",
      progress: {},
    }));
    mkdirSync(resolve(root, ".dojos", "starter"), { recursive: true });
    writeFileSync(resolve(root, ".dojos", "starter", "dojo.yaml"), [
      "name: '@test/starter'",
      "version: 1.0.0",
      "description: A fresh kata course.",
      "test: echo ok",
      "katas:",
      "  - template: katas/001-first/solution.ts",
    ].join("\n"));
    observeLocalContext(root, { stateHome, now: 100, session: null });

    const response = await buildControlRoutes({ stateHome, now: 200 }).request("/courses");

    expect(await response.json()).toEqual([
      expect.objectContaining({ dojo: "starter", kata: "001-first", runId: null }),
    ]);
  });

  it("lists an interactive course without requiring a current kata", async () => {
    const { root, stateHome } = fixture();
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify({
      currentDojo: "guided",
      currentKata: null,
      editor: null,
    }));
    mkdirSync(resolve(root, ".dojos", "guided"), { recursive: true });
    writeFileSync(resolve(root, ".dojos", "guided", "dojo.json"), JSON.stringify({
      mode: "interactive",
      name: "@test/guided",
      version: "1.0.0",
      description: "A guided lesson.",
      lessons: "lessons.json",
    }));
    observeLocalContext(root, { stateHome, now: 100, session: null });

    const response = await buildControlRoutes({ stateHome, now: 200 }).request("/courses");

    expect(await response.json()).toEqual([
      expect.objectContaining({ dojo: "guided", mode: "interactive", kata: null }),
    ]);
  });

  it("uses durable last activity when no process-level kata is selected", async () => {
    const { root, stateHome } = fixture();
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify({
      currentDojo: "starter",
      currentKata: null,
      editor: "code",
      progress: { starter: { completed: [], lastActive: "001-first" } },
    }));
    mkdirSync(resolve(root, ".dojos", "starter"), { recursive: true });
    writeFileSync(resolve(root, ".dojos", "starter", "dojo.yaml"), [
      "name: '@test/starter'",
      "version: 1.0.0",
      "description: A kata course.",
      "test: echo ok",
      "katas:",
      "  - name: 001-first",
      "    template: katas/001-first/solution.ts",
    ].join("\n"));
    observeLocalContext(root, { stateHome, now: 100, session: null });

    const response = await buildControlRoutes({ stateHome, now: 200 }).request("/courses");

    expect(await response.json()).toEqual([
      expect.objectContaining({ dojo: "starter", kata: "001-first" }),
    ]);
  });

  it("keeps completed lesson sessions addressable after the course advances", async () => {
    const { root, stateHome } = fixture();
    writeFileSync(resolve(root, ".dojos", "starter", "dojo.yaml"), [
      "name: '@test/starter'",
      "version: 1.0.0",
      "description: A kata course.",
      "test: echo ok",
      "katas:",
      "  - name: 001-first",
      "    template: katas/001-first/solution.ts",
      "  - name: 002-second",
      "    template: katas/002-second/solution.ts",
    ].join("\n"));
    mkdirSync(resolve(root, ".dojo"), { recursive: true });
    writeFileSync(resolve(root, ".dojo", "web.json"), JSON.stringify({
      threads: {
        "starter/001-first": { sessionId: "session-001" },
        "starter/002-second": { sessionId: "session-002" },
      },
    }));
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify({
      currentDojo: "starter",
      currentKata: "002-second",
      editor: "code",
      progress: { starter: { completed: ["001-first"], lastActive: "001-first" } },
    }));
    observeLocalContext(root, { stateHome, now: 100, session: null });

    const response = await buildControlRoutes({ stateHome, now: 200 }).request("/courses");

    expect(await response.json()).toEqual([
      expect.objectContaining({
        kata: "002-second",
        sessionId: "session-002",
        sessions: [
          { lessonId: "001-first", sessionId: "session-001" },
          { lessonId: "002-second", sessionId: "session-002" },
        ],
      }),
    ]);
  });

  it("lists unfinished courses across indexed workspaces", async () => {
    const { root, stateHome } = fixture();
    const secondRoot = mkdtempSync(join(tmpdir(), "dojofoo-control-workspace-"));
    temporaryPaths.push(secondRoot);
    writeFileSync(resolve(secondRoot, ".dojorc"), JSON.stringify({
      currentDojo: "effect-ts",
      currentKata: "002-map",
      editor: null,
      progress: { "effect-ts": { completed: ["001-hello"], lastActive: "002-map" } },
    }));
    mkdirSync(resolve(secondRoot, ".dojos", "effect-ts"), { recursive: true });
    writeFileSync(resolve(secondRoot, ".dojos", "effect-ts", "dojo.yaml"), [
      "name: '@test/effect-ts'",
      "version: 1.0.0",
      "description: An Effect kata course.",
      "test: echo ok",
      "katas:",
      "  - name: 002-map",
      "    template: katas/002-map/solution.ts",
    ].join("\n"));
    observeLocalContext(root, { stateHome, now: 100, session: null });
    observeLocalContext(secondRoot, { stateHome, now: 200, session: null });
    const app = buildControlRoutes({ stateHome, now: 300 });

    const response = await app.request("/courses");
    expect(await response.json()).toEqual([
      expect.objectContaining({ dojo: "effect-ts", kata: "002-map", path: secondRoot }),
      expect.objectContaining({ dojo: "starter", kata: "001-first", path: root }),
    ]);
  });

  it("does not expose an indexed workspace after its course manifest disappears", async () => {
    const { root, stateHome } = fixture();
    observeLocalContext(root, { stateHome, now: 100, session: null });
    rmSync(resolve(root, ".dojos", "starter"), { recursive: true });

    const response = await buildControlRoutes({ stateHome, now: 200 }).request("/courses");

    expect(await response.json()).toEqual([]);
  });

  it("aggregates active runs and sessions from the durable local index", async () => {
    const { root, stateHome } = fixture();
    observeLocalContext(root, {
      stateHome,
      now: 900,
      session: { harness: "codex", nativeId: "thread-123" },
    });
    const app = buildControlRoutes({ stateHome, now: 1_000, activeWindowMs: 200 });

    const overview = await app.request("/overview");
    expect(await overview.json()).toEqual({
      workspaces: 1,
      runs: { total: 1, active: 1, completed: 0 },
      sessions: { total: 1, active: 1 },
      events: 1,
      activeWindowMs: 200,
      generatedAt: 1_000,
    });

    const sessions = await app.request("/sessions?status=active");
    expect(await sessions.json()).toEqual([
      expect.objectContaining({ harness: "codex", nativeId: "thread-123", active: true }),
    ]);

    const courses = await app.request("/courses");
    const courseBody = await courses.json() as Array<{ workspaceId: string }>;
    expect(courseBody).toEqual([
      expect.objectContaining({
        dojo: "starter",
        kata: "001-first",
        path: root,
        workspaceId: expect.any(String),
      }),
    ]);

    const snapshot = await app.request("/snapshot");
    expect(await snapshot.json()).toEqual(expect.objectContaining({
      workspaces: [expect.objectContaining({ path: root })],
      runs: [expect.objectContaining({ dojo: "starter" })],
      sessions: [expect.objectContaining({ nativeId: "thread-123" })],
      events: [expect.objectContaining({ type: "session_attached" })],
      generatedAt: 1_000,
    }));

    const workspaceId = courseBody[0].workspaceId;
    expect(resolveRequestWorkspace(new Request("http://localhost", {
      headers: { [WORKSPACE_HEADER]: workspaceId },
    }), { stateHome })).toBe(root);
  });

  it("filters completed runs and returns newest events first", async () => {
    const { root, stateHome } = fixture();
    recordDojoLifecycle(root, "started", "001-first", { stateHome, now: 100, session: null });
    recordDojoLifecycle(root, "finished", "001-first", { stateHome, now: 200, session: null });
    const app = buildControlRoutes({ stateHome, now: 300 });

    const runs = await app.request("/runs?status=completed");
    expect(await runs.json()).toEqual([
      expect.objectContaining({ dojo: "starter", completedAt: 200, active: false }),
    ]);

    const events = await app.request("/events?limit=1");
    expect(await events.json()).toEqual([
      expect.objectContaining({ type: "dojo_run_completed", occurredAt: 200 }),
    ]);
  });

  it("exposes session adoption through the local control API", async () => {
    const { root, stateHome } = fixture();
    const context = observeLocalContext(root, {
      stateHome,
      now: 100,
      session: { harness: "codex", nativeId: "thread-123" },
    });
    const session = listSessions({ stateHome })[0];
    const lifecycleState = {
      type: "resume-session" as const,
      harnessId: "codex",
      specificationVersion: "harness-v1" as const,
      data: { threadId: "thread-123" },
    };
    const adoptSession = vi.fn(async () => ({
      session: { ...session, ownership: "managed" as const },
      lifecycleState,
      transcript: [{ role: "assistant" as const, text: "Prior turn" }],
    }));
    const app = buildControlRoutes({ stateHome, now: 200, adoptSession });

    const response = await app.request(`/sessions/${context!.sessionId}/adopt`, { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(expect.objectContaining({
      lifecycleState,
      transcript: [{ role: "assistant", text: "Prior turn" }],
    }));
    expect(adoptSession).toHaveBeenCalledWith(context!.sessionId, { stateHome, now: 200 });
  });
});
