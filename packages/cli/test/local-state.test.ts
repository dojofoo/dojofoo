import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  listDojoRuns,
  listEvents,
  listSessions,
  listWorkspaces,
  observeLocalContext,
  recordDojoLifecycle,
  sessionFromEnvironment,
} from "../src/local-state";

describe("local dojo state", () => {
  const paths: string[] = [];

  afterEach(() => {
    for (const path of paths) rmSync(path, { recursive: true, force: true });
    paths.length = 0;
  });

  function fixture() {
    const root = mkdtempSync(join(tmpdir(), "dojofoo-workspace-"));
    const stateHome = mkdtempSync(join(tmpdir(), "dojofoo-home-"));
    paths.push(root, stateHome);
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify({
      currentDojo: "effect-ts",
      currentKata: "001-hello-effect",
      editor: null,
      progress: { "effect-ts": { completed: [], lastActive: "001-hello-effect" } },
    }));
    return { root, stateHome };
  }

  it("indexes a workspace and reuses one dojo run without changing project progress", () => {
    const { root, stateHome } = fixture();
    const before = readFileSync(resolve(root, ".dojorc"), "utf8");

    const first = observeLocalContext(root, { stateHome, now: 100 });
    const second = observeLocalContext(root, { stateHome, now: 200 });

    expect(second).toEqual(first);
    expect(existsSync(resolve(stateHome, "dojofoo.db"))).toBe(true);
    expect(listWorkspaces({ stateHome })).toEqual([{
      id: first.workspaceId,
      path: root,
      firstSeenAt: 100,
      lastSeenAt: 200,
    }]);
    expect(listDojoRuns({ stateHome })).toEqual([{
      id: first.dojoRunId,
      workspaceId: first.workspaceId,
      dojo: "effect-ts",
      startedAt: 100,
      lastSeenAt: 200,
      completedAt: null,
    }]);
    expect(readFileSync(resolve(root, ".dojorc"), "utf8")).toBe(before);
  });

  it("indexes a native harness session and attaches it to the current dojo run", () => {
    const { root, stateHome } = fixture();

    const context = observeLocalContext(root, {
      stateHome,
      now: 100,
      session: {
        harness: "codex",
        nativeId: "thread-123",
        transcriptPath: "/tmp/thread-123.jsonl",
      },
    });

    expect(context.sessionId).toEqual(expect.any(String));
    expect(listSessions({ stateHome })).toEqual([{
      id: context.sessionId,
      harness: "codex",
      nativeId: "thread-123",
      cwd: root,
      transcriptPath: "/tmp/thread-123.jsonl",
      firstSeenAt: 100,
      lastSeenAt: 100,
    }]);
    expect(listEvents({ stateHome })).toEqual([
      expect.objectContaining({
        type: "session_attached",
        workspaceId: context.workspaceId,
        dojoRunId: context.dojoRunId,
        sessionId: context.sessionId,
        kata: "001-hello-effect",
      }),
    ]);
  });

  it("records existing dojo lifecycle actions without duplicating run identity", () => {
    const { root, stateHome } = fixture();
    const context = observeLocalContext(root, { stateHome, now: 100 });

    recordDojoLifecycle(root, "started", "001-hello-effect", { stateHome, now: 200, session: null });
    recordDojoLifecycle(root, "kata_completed", "001-hello-effect", { stateHome, now: 300, session: null });
    recordDojoLifecycle(root, "finished", "001-hello-effect", { stateHome, now: 400, session: null });

    expect(listDojoRuns({ stateHome })).toEqual([
      expect.objectContaining({ id: context.dojoRunId, completedAt: 400, lastSeenAt: 400 }),
    ]);
    expect(listEvents({ stateHome }).map(({ type, kata }) => ({ type, kata }))).toEqual([
      { type: "kata_started", kata: "001-hello-effect" },
      { type: "kata_completed", kata: "001-hello-effect" },
      { type: "dojo_run_completed", kata: "001-hello-effect" },
    ]);
  });

  it("does not start a dojo run when a dojo is only installed", () => {
    const { root, stateHome } = fixture();

    recordDojoLifecycle(root, "installed", undefined, { stateHome, now: 100 });

    expect(listWorkspaces({ stateHome })).toHaveLength(1);
    expect(listDojoRuns({ stateHome })).toEqual([]);
    expect(listEvents({ stateHome })).toEqual([]);
  });

  it("indexes an existing workspace before its first dojo run", () => {
    const { root, stateHome } = fixture();
    writeFileSync(resolve(root, ".dojorc"), JSON.stringify({
      currentDojo: "effect-ts",
      currentKata: null,
      editor: null,
      progress: {},
    }));

    const context = observeLocalContext(root, { stateHome, now: 100 });

    expect(context).toEqual({
      workspaceId: expect.any(String),
      dojoRunId: null,
      sessionId: null,
    });
    expect(listWorkspaces({ stateHome })).toHaveLength(1);
    expect(listDojoRuns({ stateHome })).toEqual([]);
  });

  it("identifies the current harness session from its native environment variable", () => {
    expect(sessionFromEnvironment({ CODEX_THREAD_ID: "thread-123" })).toEqual({
      harness: "codex",
      nativeId: "thread-123",
    });
    expect(sessionFromEnvironment({})).toBeNull();
  });

  it("opens an existing version-one database without rebuilding its state", () => {
    const { root, stateHome } = fixture();
    const first = observeLocalContext(root, { stateHome, now: 100 });

    expect(observeLocalContext(root, { stateHome, now: 200 })).toEqual(first);
    expect(listWorkspaces({ stateHome })).toHaveLength(1);
    expect(listDojoRuns({ stateHome })).toHaveLength(1);
  });
});
