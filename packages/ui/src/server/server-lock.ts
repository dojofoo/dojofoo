import { closeSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { processStartTime } from "@dojofoo/harness/persona";

/** `<DOJOFOO_HOME>/ui.lock`: `{ pid, startedAt, url }` of the one UI server that owns this DOJOFOO_HOME (design, "Startup and recovery order", 1). */
type Holder = { pid: number; startedAt?: string; url?: string };
const lockFile = (stateHome: string) => join(stateHome, "ui.lock");
const alive = (pid: number) => {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "EPERM"; }
};
const read = (file: string): Holder | undefined => {
  try {
    const holder = JSON.parse(readFileSync(file, "utf8")) as Holder;
    return typeof holder.pid === "number" ? holder : undefined;
  } catch { return undefined; }
};
const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const releasing = new Set<string>();

/** Takes the lock, replacing one whose process is gone (or is this one, as when the dev runner loads this module twice); otherwise
 *  waits up to `waitMs` (synchronously: nothing may run before the lock), then prints the running server's URL and exits. */
export function acquireServerLock({ stateHome, url, waitMs = 15_000, exit = process.exit }: {
  stateHome: string; url: string; waitMs?: number; exit?: (code: number) => unknown;
}): boolean {
  mkdirSync(stateHome, { recursive: true });
  const file = lockFile(stateHome);
  const mine = JSON.stringify({ pid: process.pid, startedAt: processStartTime(process.pid), url });
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      const descriptor = openSync(file, "wx");
      try { writeSync(descriptor, mine); } finally { closeSync(descriptor); }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const holder = read(file);
    if (holder?.pid === process.pid) break;
    // A dead holder, or a live process that reused its pid, no longer owns the lock; a torn file is a crash mid-write
    if (!holder || !alive(holder.pid) || processStartTime(holder.pid) !== holder.startedAt) {
      const temporary = `${file}.${process.pid}.tmp`;
      writeFileSync(temporary, mine);
      renameSync(temporary, file);
      break;
    }
    if (Date.now() >= deadline) {
      console.error(`Dojofoo is already running at ${holder.url ?? "another address"}.`);
      exit(1);
      return false;
    }
    sleep(Math.min(250, Math.max(1, deadline - Date.now())));
  }
  if (!releasing.has(stateHome)) {
    releasing.add(stateHome);
    process.once("exit", () => releaseServerLock(stateHome));
  }
  return true;
}

/** Removes the lock only while it still names this process. */
export function releaseServerLock(stateHome: string): void {
  const file = lockFile(stateHome);
  if (read(file)?.pid === process.pid) rmSync(file, { force: true });
}

/** The address a second server prints: DOJO_UI_BASE_URL, else http://<HOST or 127.0.0.1>:<PORT>. */
export function serverUrl(environment: NodeJS.ProcessEnv = process.env): string {
  if (environment.DOJO_UI_BASE_URL) return environment.DOJO_UI_BASE_URL;
  const host = environment.HOST?.trim();
  return `http://${!host || ["0.0.0.0", "::", "[::]"].includes(host) ? "127.0.0.1" : host}:${environment.PORT || "4567"}`;
}
