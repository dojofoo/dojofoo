import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { readDojoRc } from "./config";

type HarnessSession = {
  harness: string;
  nativeId: string;
  transcriptPath?: string | null;
};

type LocalStateOptions = {
  stateHome?: string;
  now?: number;
  session?: HarnessSession | null;
};

export type LocalContext = {
  workspaceId: string;
  dojoRunId: string | null;
  sessionId: string | null;
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
  const rcPath = resolve(root, ".dojorc");
  if (!existsSync(rcPath)) return null;
  const rc = readDojoRc(root);

  const now = options.now ?? Date.now();
  const db = openDatabase(options);
  try {
    const workspaceId = observeWorkspace(db, root, now);
    if (!rc.currentDojo || (!rc.currentKata && !rc.progress?.[rc.currentDojo])) {
      return { workspaceId, dojoRunId: null, sessionId: null };
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
  if (!existsSync(resolve(root, ".dojorc"))) return;
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

export function listWorkspaces(options: LocalStateOptions = {}): Array<Record<string, unknown>> {
  return readRows(options, `
    SELECT id, path, first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
    FROM workspaces ORDER BY first_seen_at
  `);
}

export function listDojoRuns(options: LocalStateOptions = {}): Array<Record<string, unknown>> {
  return readRows(options, `
    SELECT id, workspace_id AS workspaceId, dojo, started_at AS startedAt,
      last_seen_at AS lastSeenAt, completed_at AS completedAt
    FROM dojo_runs ORDER BY started_at
  `);
}

export function listSessions(options: LocalStateOptions = {}): Array<Record<string, unknown>> {
  return readRows(options, `
    SELECT id, harness, native_id AS nativeId, cwd, transcript_path AS transcriptPath,
      first_seen_at AS firstSeenAt, last_seen_at AS lastSeenAt
    FROM sessions ORDER BY first_seen_at
  `);
}

export function listEvents(options: LocalStateOptions = {}): Array<Record<string, unknown>> {
  return readRows(options, `
    SELECT id, type, occurred_at AS occurredAt, workspace_id AS workspaceId,
      dojo_run_id AS dojoRunId, session_id AS sessionId, kata, data
    FROM events ORDER BY occurred_at, rowid
  `);
}

function readRows(options: LocalStateOptions, sql: string): Array<Record<string, unknown>> {
  const db = openDatabase(options);
  try {
    return db.prepare(sql).all() as Array<Record<string, unknown>>;
  } finally {
    db.close();
  }
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
  if ((db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version >= 1) return;
  db.exec(`
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
  const workspaceId = workspaceIdFor(root);
  db.prepare(`
    INSERT INTO workspaces (id, path, first_seen_at, last_seen_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET path = excluded.path, last_seen_at = excluded.last_seen_at
  `).run(workspaceId, resolve(root), now, now);
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
