import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import {
  listDojoRuns,
  listEvents,
  listSessions,
  listWorkspaces,
  observeCourseRun,
  observeLocalContext,
  observeWorkspacePath,
  recordDojoLifecycle,
  sessionFromEnvironment,
  setSessionLifecycle,
} from "@dojofoo/config/local-state";
import { courseInstallations, findInstalledCourse } from "@dojofoo/config/course-installations";

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
      kind: "learner",
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
      ownership: "external",
      harnessSessionId: null,
      lifecycleState: null,
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

  it("persists an opaque harness lifecycle pointer without copying the transcript", () => {
    const { root, stateHome } = fixture();
    const context = observeLocalContext(root, {
      stateHome,
      now: 100,
      session: { harness: "codex", nativeId: "thread-123", transcriptPath: "/native/thread.jsonl" },
    });
    const lifecycleState = {
      type: "resume-session",
      harnessId: "codex",
      specificationVersion: "harness-v1",
      data: { threadId: "thread-123" },
    };

    const session = setSessionLifecycle(context.sessionId!, {
      ownership: "managed",
      harnessSessionId: context.sessionId!,
      lifecycleState,
    }, { stateHome, now: 200 });

    expect(session).toEqual(expect.objectContaining({
      ownership: "managed",
      harnessSessionId: context.sessionId,
      lifecycleState: JSON.stringify(lifecycleState),
      transcriptPath: "/native/thread.jsonl",
      lastSeenAt: 200,
    }));
  });

  it("records existing dojo lifecycle actions without duplicating run identity", () => {
    const { root, stateHome } = fixture();
    const context = observeLocalContext(root, { stateHome, now: 100 });

    recordDojoLifecycle(root, "effect-ts", "started", "001-hello-effect", { stateHome, now: 200, session: null });
    recordDojoLifecycle(root, "effect-ts", "kata_completed", "001-hello-effect", { stateHome, now: 300, session: null });
    recordDojoLifecycle(root, "effect-ts", "finished", "001-hello-effect", { stateHome, now: 400, session: null });

    expect(listDojoRuns({ stateHome })).toEqual([
      expect.objectContaining({ id: context.dojoRunId, completedAt: 400, lastSeenAt: 400 }),
    ]);
    expect(listEvents({ stateHome }).map(({ type, kata }) => ({ type, kata }))).toEqual([
      { type: "kata_started", kata: "001-hello-effect" },
      { type: "kata_completed", kata: "001-hello-effect" },
      { type: "dojo_run_completed", kata: "001-hello-effect" },
    ]);
  });

  it("records an event on the run of the course it is about, not on the current course's", () => {
    const { root, stateHome } = fixture();
    const current = observeLocalContext(root, { stateHome, now: 100 });

    recordDojoLifecycle(root, "zod", "kata_completed", "001-schemas", { stateHome, now: 200, session: null });
    recordDojoLifecycle(root, "zod", "finished", "001-schemas", { stateHome, now: 200, session: null });

    const runs = listDojoRuns({ stateHome });
    const zod = runs.find(run => run.dojo === "zod");
    expect(runs).toEqual([
      expect.objectContaining({ id: current!.dojoRunId, dojo: "effect-ts", lastSeenAt: 100, completedAt: null }),
      expect.objectContaining({ dojo: "zod", completedAt: 200 }),
    ]);
    expect(listEvents({ stateHome }).map(({ type, dojoRunId }) => ({ type, dojoRunId }))).toEqual([
      { type: "kata_completed", dojoRunId: zod!.id },
      { type: "dojo_run_completed", dojoRunId: zod!.id },
    ]);
  });

  // The CLI records a completion in the progress before the event
  const finishedCourse = (root: string, completed: string[]) => writeFileSync(resolve(root, ".dojorc"), JSON.stringify({
    currentDojo: "effect-ts", currentKata: "001-hello-effect", editor: null,
    progress: { "effect-ts": { completed, lastActive: "001-hello-effect" } },
  }));

  it("finishes a run once: repeated checks and finishes, and looking at the course, leave it as it was", () => {
    const { root, stateHome } = fixture();
    mkdirSync(resolve(root, ".dojos", "effect-ts"), { recursive: true });
    writeFileSync(resolve(root, ".dojos", "effect-ts", "dojo.yaml"), "name: effect-ts\nversion: 1.0.0\ndescription: A course.\ntest: echo ok\nkatas:\n  - name: 001-hello-effect\n    template: 001/kata.ts\n");
    finishedCourse(root, ["001-hello-effect"]);
    const context = observeLocalContext(root, { stateHome, now: 100 });
    recordDojoLifecycle(root, "effect-ts", "kata_completed", "001-hello-effect", { stateHome, now: 200, session: null });
    recordDojoLifecycle(root, "effect-ts", "finished", "001-hello-effect", { stateHome, now: 200, session: null });

    recordDojoLifecycle(root, "effect-ts", "kata_completed", "001-hello-effect", { stateHome, now: 300, session: null });
    recordDojoLifecycle(root, "effect-ts", "finished", "001-hello-effect", { stateHome, now: 300, session: null });
    const looked = observeLocalContext(root, { stateHome, now: 400, session: { harness: "codex", nativeId: "thread-123" } });

    expect(looked?.dojoRunId).toBe(context!.dojoRunId);
    expect(observeCourseRun(root, "effect-ts", { stateHome, now: 500 }).runId).toBe(context!.dojoRunId);
    expect(listDojoRuns({ stateHome })).toEqual([
      expect.objectContaining({ id: context!.dojoRunId, lastSeenAt: 200, completedAt: 200 }),
    ]);
    expect(listEvents({ stateHome }).map(({ type }) => type)).toEqual(["kata_completed", "dojo_run_completed"]);
  });

  it("starts a new run when a finished course starts over after its progress is reset", () => {
    const { root, stateHome } = fixture();
    finishedCourse(root, ["001-hello-effect"]);
    const finished = observeLocalContext(root, { stateHome, now: 100 })!.dojoRunId;
    recordDojoLifecycle(root, "effect-ts", "kata_completed", "001-hello-effect", { stateHome, now: 200, session: null });
    recordDojoLifecycle(root, "effect-ts", "finished", "001-hello-effect", { stateHome, now: 200, session: null });

    // As after a reinstall: nothing completed
    finishedCourse(root, []);
    observeLocalContext(root, { stateHome, now: 300 });
    expect(listDojoRuns({ stateHome })).toHaveLength(1);
    recordDojoLifecycle(root, "effect-ts", "started", "001-hello-effect", { stateHome, now: 400, session: null });

    const runs = listDojoRuns({ stateHome });
    expect(runs).toEqual([
      expect.objectContaining({ id: finished, completedAt: 200 }),
      expect.objectContaining({ dojo: "effect-ts", startedAt: 400, completedAt: null }),
    ]);
    expect(listEvents({ stateHome }).at(-1)).toMatchObject({ type: "kata_started", dojoRunId: runs[1]!.id });
  });

  it("does not start a dojo run when a dojo is only installed", () => {
    const { root, stateHome } = fixture();

    recordDojoLifecycle(root, "effect-ts", "installed", undefined, { stateHome, now: 100 });

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

  const kindOf = (root: string, stateHome: string) => listWorkspaces({ stateHome }).find(workspace => workspace.path === root)?.kind;

  it("registers a new workspace as a learner unless an authoring entry point says draft", () => {
    const learner = fixture();
    const draft = fixture();
    observeLocalContext(learner.root, { stateHome: learner.stateHome });
    observeWorkspacePath(draft.root, { stateHome: learner.stateHome, kind: "draft" });
    expect(kindOf(learner.root, learner.stateHome)).toBe("learner");
    expect(kindOf(draft.root, learner.stateHome)).toBe("draft");
  });

  it("a draft registration upgrades a learner workspace and nothing turns a draft back", () => {
    const { root, stateHome } = fixture();
    observeLocalContext(root, { stateHome });
    expect(kindOf(root, stateHome)).toBe("learner");
    observeWorkspacePath(root, { stateHome, kind: "draft" });
    expect(kindOf(root, stateHome)).toBe("draft");
    observeLocalContext(root, { stateHome });
    observeWorkspacePath(root, { stateHome, kind: "learner" });
    observeLocalContext(root, { stateHome, kind: "evaluation-trial" });
    expect(kindOf(root, stateHome)).toBe("draft");
  });

  it("an evaluation trial keeps its kind", () => {
    const { root, stateHome } = fixture();
    observeLocalContext(root, { stateHome, kind: "evaluation-trial" });
    observeLocalContext(root, { stateHome });
    observeWorkspacePath(root, { stateHome, kind: "draft" });
    expect(kindOf(root, stateHome)).toBe("evaluation-trial");
  });

  it("an evaluation trial's course is not an installation", () => {
    const learner = fixture();
    const trial = fixture();
    for (const { root } of [learner, trial]) {
      mkdirSync(resolve(root, ".dojos", "effect-ts"), { recursive: true });
      writeFileSync(resolve(root, ".dojos", "effect-ts", "dojo.yaml"), "name: effect-ts\nversion: 1.0.0\ndescription: A course.\ntest: echo ok\nkatas:\n  - name: first\n    template: first.ts\n");
    }
    observeLocalContext(learner.root, { stateHome: learner.stateHome });
    observeLocalContext(trial.root, { stateHome: learner.stateHome, kind: "evaluation-trial" });
    expect(courseInstallations("effect-ts", { stateHome: learner.stateHome }).map(course => course.root)).toEqual([learner.root]);
    expect(findInstalledCourse("effect-ts", { stateHome: learner.stateHome }).root).toBe(learner.root);
  });

  it("adds an empty kind to an existing version-two database for the UI server to backfill", () => {
    const { root, stateHome } = fixture();
    const db = new DatabaseSync(resolve(stateHome, "dojofoo.db"));
    db.exec(`
      CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL);
      CREATE TABLE dojo_runs (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), dojo TEXT NOT NULL,
        started_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, completed_at INTEGER);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, harness TEXT NOT NULL, native_id TEXT NOT NULL, cwd TEXT, transcript_path TEXT,
        first_seen_at INTEGER NOT NULL, last_seen_at INTEGER NOT NULL, ownership TEXT NOT NULL DEFAULT 'external',
        harness_session_id TEXT, lifecycle_state TEXT, UNIQUE(harness, native_id));
      CREATE TABLE events (id TEXT PRIMARY KEY, type TEXT NOT NULL, occurred_at INTEGER NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
        dojo_run_id TEXT REFERENCES dojo_runs(id), session_id TEXT REFERENCES sessions(id), kata TEXT, data TEXT);
      PRAGMA user_version = 2;
    `);
    db.prepare("INSERT INTO workspaces (id, path, first_seen_at, last_seen_at) VALUES (?, ?, ?, ?)").run("existing", root, 100, 100);
    db.close();

    expect(listWorkspaces({ stateHome })).toEqual([{ id: "existing", path: root, firstSeenAt: 100, lastSeenAt: 100, kind: null }]);
    const version = new DatabaseSync(resolve(stateHome, "dojofoo.db"));
    expect(version.prepare("PRAGMA user_version").get()).toEqual({ user_version: 3 });
    version.close();
    // Registration never guesses learner for an existing row
    observeLocalContext(root, { stateHome, now: 200 });
    expect(kindOf(root, stateHome)).toBeNull();
    observeWorkspacePath(root, { stateHome, kind: "draft" });
    expect(kindOf(root, stateHome)).toBe("draft");
  });

  it("keeps the indexed workspace when its on-disk instance identity changes", () => {
    const { root, stateHome } = fixture();
    const first = observeLocalContext(root, { stateHome, now: 100 });
    writeFileSync(resolve(root, ".dojo", "instance.json"), JSON.stringify({
      version: 1,
      instanceId: "replacement-instance-id",
    }));

    const second = observeLocalContext(root, { stateHome, now: 200 });

    expect(second.workspaceId).toBe(first.workspaceId);
    expect(listWorkspaces({ stateHome })).toEqual([
      expect.objectContaining({ id: first.workspaceId, path: root, lastSeenAt: 200 }),
    ]);
  });
});
