import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { courseMode, hasWorkspaceConfiguration, readCourseManifest, readDojoRc } from "./index";

export type HarnessSession = {
  harness: string;
  nativeId: string;
  transcriptPath?: string | null;
};

export type LocalStateOptions = {
  stateHome?: string;
  now?: number;
  session?: HarnessSession | null;
};

export type LocalContext = {
  workspaceId: string;
  dojoRunId: string | null;
  sessionId: string | null;
};

export type LocalWorkspace = {
  id: string;
  path: string;
  firstSeenAt: number;
  lastSeenAt: number;
};

export type LocalDojoRun = {
  id: string;
  workspaceId: string;
  dojo: string;
  startedAt: number;
  lastSeenAt: number;
  completedAt: number | null;
};

export type LocalSession = {
  id: string;
  harness: string;
  nativeId: string;
  ownership: SessionOwnership;
  harnessSessionId: string | null;
  lifecycleState: string | null;
  cwd: string | null;
  transcriptPath: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
};

/**
 * `external` sessions are observed only, `managed` sessions originated
 * elsewhere and were connected to dojofoo, and `owned` sessions were created
 * by dojofoo.
 */
export type SessionOwnership = "external" | "managed" | "owned";

export type SessionLifecycle = {
  ownership: SessionOwnership;
  harnessSessionId: string;
  lifecycleState: unknown;
};

export type LocalEvent = {
  id: string;
  type: string;
  occurredAt: number;
  workspaceId: string;
  dojoRunId: string | null;
  sessionId: string | null;
  kata: string | null;
  data: string | null;
};

export type LocalSnapshot = {
  workspaces: LocalWorkspace[];
  runs: LocalDojoRun[];
  sessions: LocalSession[];
  events: LocalEvent[];
};

type CourseEventName = "installed" | "started" | "kata_completed" | "finished";

const SESSION_ENVIRONMENTS = [
  ["codex", "CODEX_THREAD_ID"],
  ["claude", "CLAUDE_SESSION_ID"],
  ["claude", "CLAUDE_CONVERSATION_ID"],
  ["opencode", "OPENCODE_SESSION_ID"],
  ["gemini", "GEMINI_SESSION_ID"],
  ["pi", "PI_SESSION_ID"],
  ["pi", "PI_THREAD_ID"],
] as const;

export function sessionFromEnvironment(
  environment: Record<string, string | undefined> = process.env,
): HarnessSession | null {
  for (const [harness, name] of SESSION_ENVIRONMENTS) {
    const nativeId = environment[name];
    if (nativeId) return { harness, nativeId };
  }
  return null;
}

export function observeLocalContext(root: string, options: LocalStateOptions = {}): LocalContext | null {
  if (!hasWorkspaceConfiguration(root)) return null;
  const rc = readDojoRc(root);

  const now = options.now ?? Date.now();
  const db = openDatabase(options);
  try {
    const workspaceId = observeWorkspace(db, root, now);
    if (!rc.currentDojo) {
      return { workspaceId, dojoRunId: null, sessionId: null };
    }
    if (!rc.currentKata && !rc.progress?.[rc.currentDojo]) {
      try {
        if (courseMode(readCourseManifest(root, rc.currentDojo)) !== "interactive") {
          return { workspaceId, dojoRunId: null, sessionId: null };
        }
      } catch {
        return { workspaceId, dojoRunId: null, sessionId: null };
      }
    }

    const dojoRunId = currentDojoRun(db, workspaceId, rc.currentDojo, now);
    let sessionId: string | null = null;
    if (options.session) {
      sessionId = observeSession(db, root, options.session, now);
      attachSession(db, { workspaceId, dojoRunId, sessionId, kata: rc.currentKata, now });
    }
    return { workspaceId, dojoRunId, sessionId };
  } finally {
    db.close();
  }
}

export function recordDojoLifecycle(
  root: string,
  event: CourseEventName,
  kata?: string,
  options: LocalStateOptions = {},
): void {
  if (!hasWorkspaceConfiguration(root)) return;
  const now = options.now ?? Date.now();
  const db = openDatabase(options);
  try {
    const workspaceId = observeWorkspace(db, root, now);
    if (event === "installed") return;
    const dojo = readDojoRc(root).currentDojo;
    if (!dojo) return;
    const dojoRunId = currentDojoRun(db, workspaceId, dojo, now);
    const type = localEventType(event);
    if (type) insertEvent(db, { type, now, workspaceId, dojoRunId, kata: kata ?? null });
    if (event === "finished") {
      db.prepare("UPDATE dojo_runs SET last_seen_at = ?, completed_at = ? WHERE id = ?")
        .run(now, now, dojoRunId);
    }
    const session = options.session === undefined ? sessionFromEnvironment() : options.session;
    if (session) {
      const sessionId = observeSession(db, root, session, now);
      attachSession(db, { workspaceId, dojoRunId, sessionId, kata: kata ?? null, now });
    }
  } finally {
    db.close();
  }
}

export function listWorkspaces(options: LocalStateOptions = {}): LocalWorkspace[] {
  return readRows<LocalWorkspace>(options, `
    SELECT id, path, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
    FROM workspaces ORDER BY first_seen_at
  `);
}

/** Register a filesystem workspace without requiring an installed dojo. */
export function observeWorkspacePath(root: string, options: LocalStateOptions = {}): string {
  const db = openDatabase(options);
  try {
    return observeWorkspace(db, root, options.now ?? Date.now());
  } finally {
    db.close();
  }
}

export function listDojoRuns(options: LocalStateOptions = {}): LocalDojoRun[] {
  return readRows<LocalDojoRun>(options, `
    SELECT id, workspace_id AS workspaceId, dojo, started_at AS startedAt,
      last_seen_at AS lastSeenAt, completed_at AS completedAt
    FROM dojo_runs ORDER BY started_at
  `);
}

export function listSessions(options: LocalStateOptions = {}): LocalSession[] {
  return readRows<LocalSession>(options, `
    SELECT id, harness, native_id AS nativeId, ownership,
      harness_session_id AS harnessSessionId, lifecycle_state AS lifecycleState,
      cwd, transcript_path AS transcriptPath,
      first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
    FROM sessions ORDER BY first_seen_at
  `);
}

export function listEvents(options: LocalStateOptions = {}): LocalEvent[] {
  return readRows<LocalEvent>(options, `
    SELECT id, type, occurred_at AS occurredAt, workspace_id AS workspaceId,
      dojo_run_id AS dojoRunId, session_id AS sessionId, kata, data
    FROM events ORDER BY occurred_at, rowid
  `);
}

export function readLocalSnapshot(options: LocalStateOptions = {}): LocalSnapshot {
  const db = openDatabase(options);
  try {
    return {
      workspaces: readRowsFromDatabase<LocalWorkspace>(db, `
        SELECT id, path, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
        FROM workspaces ORDER BY first_seen_at
      `),
      runs: readRowsFromDatabase<LocalDojoRun>(db, `
        SELECT id, workspace_id AS workspaceId, dojo, started_at AS startedAt,
          last_seen_at AS lastSeenAt, completed_at AS completedAt
        FROM dojo_runs ORDER BY started_at
      `),
      sessions: readRowsFromDatabase<LocalSession>(db, `
        SELECT id, harness, native_id AS nativeId, ownership,
          harness_session_id AS harnessSessionId, lifecycle_state AS lifecycleState,
          cwd, transcript_path AS transcriptPath,
          first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
        FROM sessions ORDER BY first_seen_at
      `),
      events: readRowsFromDatabase<LocalEvent>(db, `
        SELECT id, type, occurred_at AS occurredAt, workspace_id AS workspaceId,
          dojo_run_id AS dojoRunId, session_id AS sessionId, kata, data
        FROM events ORDER BY occurred_at, rowid
      `),
    };
  } finally {
    db.close();
  }
}

export function setSessionLifecycle(
  sessionId: string,
  lifecycle: SessionLifecycle,
  options: LocalStateOptions = {},
): LocalSession {
  const db = openDatabase(options);
  try {
    const result = db.prepare(`
      UPDATE sessions SET ownership = ?, harness_session_id = ?, lifecycle_state = ?, last_seen_at = ?
      WHERE id = ?
    `).run(
      lifecycle.ownership,
      lifecycle.harnessSessionId,
      JSON.stringify(lifecycle.lifecycleState),
      options.now ?? Date.now(),
      sessionId,
    );
    if (result.changes === 0) throw new Error(`Unknown local session: ${sessionId}`);
    return readSessionFromDatabase(db, sessionId)!;
  } finally {
    db.close();
  }
}

export function getSession(sessionId: string, options: LocalStateOptions = {}): LocalSession | null {
  const db = openDatabase(options);
  try {
    return readSessionFromDatabase(db, sessionId);
  } finally {
    db.close();
  }
}

function readRows<T>(options: LocalStateOptions, sql: string): T[] {
  const db = openDatabase(options);
  try {
    return readRowsFromDatabase<T>(db, sql);
  } finally {
    db.close();
  }
}

function readRowsFromDatabase<T>(db: DatabaseSync, sql: string): T[] {
  return db.prepare(sql).all() as T[];
}

function openDatabase(options: LocalStateOptions): DatabaseSync {
  const stateHome = options.stateHome ?? process.env.DOJOFOO_HOME ?? resolve(homedir(), ".dojofoo");
  mkdirSync(stateHome, { recursive: true });
  const db = new DatabaseSync(resolve(stateHome, "dojofoo.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  const version = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version < 1) db.exec(`
    BEGIN;
    CREATE TABLE workspaces (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL
    );
    CREATE TABLE dojo_runs (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      dojo TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX dojo_runs_workspace_dojo ON dojo_runs(workspace_id, dojo, started_at DESC);
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      harness TEXT NOT NULL,
      native_id TEXT NOT NULL,
      cwd TEXT,
      transcript_path TEXT,
      first_seen_at INTEGER NOT NULL,
      last_seen_at INTEGER NOT NULL,
      UNIQUE(harness, native_id)
    );
    CREATE TABLE events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      workspace_id TEXT NOT NULL REFERENCES workspaces(id),
      dojo_run_id TEXT REFERENCES dojo_runs(id),
      session_id TEXT REFERENCES sessions(id),
      kata TEXT,
      data TEXT
    );
    CREATE INDEX events_dojo_run ON events(dojo_run_id, occurred_at);
    PRAGMA user_version = 1;
    COMMIT;
  `);
  if (version < 2) db.exec(`
    BEGIN;
    ALTER TABLE sessions ADD COLUMN ownership TEXT NOT NULL DEFAULT 'external';
    ALTER TABLE sessions ADD COLUMN harness_session_id TEXT;
    ALTER TABLE sessions ADD COLUMN lifecycle_state TEXT;
    PRAGMA user_version = 2;
    COMMIT;
  `);
}

function readSessionFromDatabase(db: DatabaseSync, sessionId: string): LocalSession | null {
  return (db.prepare(`
    SELECT id, harness, native_id AS nativeId, ownership,
      harness_session_id AS harnessSessionId, lifecycle_state AS lifecycleState,
      cwd, transcript_path AS transcriptPath, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
    FROM sessions WHERE id = ?
  `).get(sessionId) as LocalSession | undefined) ?? null;
}

export function workspaceIdFor(root: string): string {
  const directory = resolve(root, ".dojo");
  const path = resolve(directory, "instance.json");
  if (existsSync(path)) {
    try {
      const value = JSON.parse(readFileSync(path, "utf8")) as { instanceId?: unknown };
      if (typeof value.instanceId === "string" && value.instanceId) return value.instanceId;
    } catch {
      // Replace malformed identity state without touching learning progress.
    }
  }
  const instanceId = randomUUID();
  mkdirSync(directory, { recursive: true });
  writeFileSync(path, `${JSON.stringify({ version: 1, instanceId }, null, 2)}\n`);
  return instanceId;
}

function observeWorkspace(db: DatabaseSync, root: string, now: number): string {
  const workspacePath = resolve(root);
  const existing = db.prepare("SELECT id FROM workspaces WHERE path = ?")
    .get(workspacePath) as { id: string } | undefined;
  if (existing) {
    db.prepare("UPDATE workspaces SET last_seen_at = ? WHERE id = ?").run(now, existing.id);
    return existing.id;
  }
  const workspaceId = workspaceIdFor(root);
  db.prepare(`
    INSERT INTO workspaces (id, path, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET path = excluded.path, last_seen_at = excluded.last_seen_at
  `).run(workspaceId, workspacePath, now, now);
  return workspaceId;
}

function currentDojoRun(db: DatabaseSync, workspaceId: string, dojo: string, now: number): string {
  const current = db.prepare(`
    SELECT id FROM dojo_runs WHERE workspace_id = ? AND dojo = ?
    ORDER BY started_at DESC LIMIT 1
  `).get(workspaceId, dojo) as { id: string } | undefined;
  const id = current?.id ?? randomUUID();
  if (current) {
    db.prepare("UPDATE dojo_runs SET last_seen_at = ? WHERE id = ?").run(now, id);
  } else {
    db.prepare(`
      INSERT INTO dojo_runs (id, workspace_id, dojo, started_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, workspaceId, dojo, now, now);
  }
  return id;
}

function observeSession(db: DatabaseSync, root: string, session: HarnessSession, now: number): string {
  const existing = db.prepare("SELECT id FROM sessions WHERE harness = ? AND native_id = ?")
    .get(session.harness, session.nativeId) as { id: string } | undefined;
  const id = existing?.id ?? randomUUID();
  db.prepare(`
    INSERT INTO sessions (id, harness, native_id, cwd, transcript_path, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(harness, native_id) DO UPDATE SET
      cwd = excluded.cwd,
      transcript_path = COALESCE(excluded.transcript_path, sessions.transcript_path),
      last_seen_at = excluded.last_seen_at
  `).run(id, session.harness, session.nativeId, resolve(root), session.transcriptPath ?? null, now, now);
  return id;
}

function attachSession(
  db: DatabaseSync,
  input: { workspaceId: string; dojoRunId: string; sessionId: string; kata: string | null; now: number },
): void {
  const exists = db.prepare(`
    SELECT 1 FROM events WHERE type = 'session_attached' AND dojo_run_id = ? AND session_id = ? LIMIT 1
  `).get(input.dojoRunId, input.sessionId);
  if (!exists) insertEvent(db, { type: "session_attached", ...input });
}

function insertEvent(
  db: DatabaseSync,
  input: {
    type: string;
    now: number;
    workspaceId: string;
    dojoRunId: string;
    sessionId?: string | null;
    kata?: string | null;
  },
): void {
  db.prepare(`
    INSERT INTO events (id, type, occurred_at, workspace_id, dojo_run_id, session_id, kata, data)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    randomUUID(), input.type, input.now, input.workspaceId, input.dojoRunId,
    input.sessionId ?? null, input.kata ?? null,
  );
}

function localEventType(event: CourseEventName): string | null {
  if (event === "started") return "kata_started";
  if (event === "kata_completed") return "kata_completed";
  if (event === "finished") return "dojo_run_completed";
  return null;
}
