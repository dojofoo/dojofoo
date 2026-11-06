import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/** SIGKILL a command's group and any group its processes started. OpenCode's
 * bridge runs its server in a group of its own, which it stops only gracefully. */
export function killTree(pid: number): void {
  let rows: number[][] = [];
  try {
    rows = execFileSync("ps", ["-axo", "pid=,ppid=,pgid="], { encoding: "utf8" })
      .trim().split("\n").map(line => line.trim().split(/\s+/u).map(Number));
  } catch {}
  const tree = new Set(rows.filter(([, , group]) => group === pid).map(([member]) => member!));
  for (let grown = true; grown;) {
    grown = false;
    for (const [member, parent] of rows) {
      if (!tree.has(member!) && tree.has(parent!)) { tree.add(member!); grown = true; }
    }
  }
  const own = rows.find(([member]) => member === process.pid)?.[2];
  const targets = new Set([pid, ...rows.filter(([member]) => tree.has(member!)).map(([, , group]) => group!)]);
  for (const group of targets) {
    if (group <= 1 || group === own) continue;
    try { process.kill(-group, "SIGKILL"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
  }
}

/** When the process started, as the operating system reports it; undefined once it has exited. */
export function processStartTime(pid: number): string | undefined {
  try {
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      // The command name may hold spaces and parentheses; fields resume after its last ")"
      return stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19];
    }
    return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], { encoding: "utf8" }).trim() || undefined;
  } catch {
    return undefined;
  }
}

/** Appends a spawned group to the record, so a later host start can kill it after a crash. */
export function recordProcessGroup(record: string, pid: number): void {
  const startedAt = processStartTime(pid);
  if (!startedAt) return;
  mkdirSync(dirname(record), { recursive: true });
  appendFileSync(record, `${JSON.stringify({ op: "add", pid, startedAt })}\n`);
}

export function forgetProcessGroup(record: string, pid: number): void {
  if (!existsSync(record)) return;
  appendFileSync(record, `${JSON.stringify({ op: "remove", pid })}\n`);
}

/** Kills every recorded group whose leader still runs with the recorded start time, then empties the record. */
export function reapProcessGroups(record: string): number[] {
  if (!existsSync(record)) return [];
  const live = new Map<number, string>();
  for (const line of readFileSync(record, "utf8").split("\n")) {
    let entry: { op?: unknown; pid?: unknown; startedAt?: unknown };
    try { entry = JSON.parse(line); } catch { continue; }
    if (typeof entry.pid !== "number") continue;
    if (entry.op === "add" && typeof entry.startedAt === "string") live.set(entry.pid, entry.startedAt);
    else if (entry.op === "remove") live.delete(entry.pid);
  }
  const reaped: number[] = [];
  for (const [pid, startedAt] of live) {
    // A reused pid belongs to someone else
    if (processStartTime(pid) !== startedAt) continue;
    try { killTree(pid); reaped.push(pid); } catch {}
  }
  writeFileSync(record, "");
  return reaped;
}

/** reapProcessGroups for every `*.jsonl` record in the directory. */
export function reapAllProcessGroups(directory: string): number[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter(name => name.endsWith(".jsonl")).flatMap(name => reapProcessGroups(join(directory, name)));
}
