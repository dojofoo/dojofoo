import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { AgentApiError, type SessionRecord } from "@dojofoo/harness/api";

/** A workspace's session records, next to its other `dojofoo` state in `.dojo/agent-sessions.json`. */
const file = (path: string) => join(path, ".dojo", "agent-sessions.json");

/** A record written before revisions existed reads as revision 0. */
const normalise = (record: SessionRecord): SessionRecord => ({ ...record, revision: typeof record.revision === "number" ? record.revision : 0 });

export async function readRecords(path: string): Promise<SessionRecord[]> {
  try { return (JSON.parse(await readFile(file(path), "utf8")) as { sessions: SessionRecord[] }).sessions.map(normalise); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

// One write queue per process: concurrent read-modify-writes of the same file never lose an update
let writing: Promise<unknown> = Promise.resolve();
function queued<T>(change: () => Promise<T>): Promise<T> {
  const write = writing.then(change);
  writing = write.catch(() => {});
  return write;
}
async function store(path: string, sessions: SessionRecord[]) {
  await mkdir(dirname(file(path)), { recursive: true });
  const temporary = `${file(path)}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ sessions }, null, 2)}\n`);
  await rename(temporary, file(path));
}

export function saveRecord(path: string, session: SessionRecord): Promise<void> {
  return queued(async () => store(path, [...(await readRecords(path)).filter(item => item.id !== session.id), session]));
}

/** One serialised read-modify-write of one record; 404 session_not_found when it does not exist. */
export function updateRecord(path: string, id: string, change: (record: SessionRecord) => SessionRecord): Promise<SessionRecord> {
  return queued(async () => {
    const sessions = await readRecords(path);
    const index = sessions.findIndex(item => item.id === id);
    if (index < 0) throw new AgentApiError(404, "session_not_found", "Session not found.");
    const updated = normalise(change(sessions[index]!));
    sessions[index] = updated;
    await store(path, sessions);
    return updated;
  });
}
