import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/** One open guard window: a byte copy of `path` from before a persona's turn (design, "Write guard", rule 1). */
export interface GuardWindow {
  id: string;
  /** The Eve session id */
  owner: string;
  path: string;
  existed: boolean;
  sha256?: string;
  openedAt: string;
  meta: Record<string, string>;
}
export interface GuardVerdict {
  window: GuardWindow;
  action: "unchanged" | "restored" | "recreated" | "removed";
  /** The other version's path in the quarantine, when there was one */
  quarantined?: string;
}

const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";
async function readOptional(path: string): Promise<Buffer | undefined> {
  try { return await readFile(path); } catch (error) { if (missing(error)) return undefined; throw error; }
}

/** Temp file and rename */
export async function writeFileAtomic(path: string, content: Uint8Array | string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = join(dirname(path), `.${randomUUID()}.tmp`);
  try {
    await writeFile(temp, content);
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

const lockKey = Symbol.for("dojofoo.file-guard.locks");
// Process-global: route modules may be loaded twice by the dev runner
const locks = ((globalThis as Record<symbol, unknown>)[lockKey] ??= new Map<string, Promise<unknown>>()) as Map<string, Promise<unknown>>;

/** One in-process lock per resolved path, shared by writeSolution and verify */
export function withPathLock<T>(path: string, run: () => Promise<T>): Promise<T> {
  const key = resolve(path);
  const previous = locks.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  const tail = next.catch(() => undefined);
  locks.set(key, tail);
  void tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return next;
}

/** The guard store in `directory`: `windows/<id>.copy` then `windows/<id>.json` (the record is the marker, written last),
 *  `quarantine/<sha256(path)>` with `quarantine/<sha256(path)>.json` (one per path, replaced at the next violation on it). */
export function createFileGuard(directory: string) {
  const windows = join(directory, "windows");
  const quarantine = join(directory, "quarantine");
  const recordPath = (id: string) => join(windows, `${id}.json`);
  const copyPath = (id: string) => join(windows, `${id}.copy`);

  async function list(): Promise<GuardWindow[]> {
    let names: string[];
    try { names = await readdir(windows); } catch (error) { if (missing(error)) return []; throw error; }
    const found: GuardWindow[] = [];
    for (const name of names.filter(name => name.endsWith(".json")).sort()) {
      const text = await readOptional(join(windows, name));
      if (!text) continue;
      try { found.push(JSON.parse(text.toString("utf8")) as GuardWindow); } catch { /* a torn record is no window */ }
    }
    return found.sort((a, b) => a.openedAt.localeCompare(b.openedAt));
  }
  const find = async (owner: string) => (await list()).find(window => window.owner === owner);
  async function close(window: GuardWindow) {
    await rm(recordPath(window.id), { force: true });
    await rm(copyPath(window.id), { force: true });
  }

  return {
    /** Rule 1: a byte copy of `path`, written before the window record; returns the owner's open window if it has one */
    async open(owner: string, path: string, meta: Record<string, string> = {}): Promise<GuardWindow> {
      const open = await find(owner);
      if (open) return open;
      const absolute = resolve(path);
      const content = await readOptional(absolute);
      const window: GuardWindow = {
        id: randomUUID(), owner, path: absolute, existed: content !== undefined,
        ...(content !== undefined ? { sha256: sha256(content) } : {}), openedAt: new Date().toISOString(), meta,
      };
      await writeFileAtomic(copyPath(window.id), content ?? "");
      await writeFileAtomic(recordPath(window.id), JSON.stringify(window));
      return window;
    },
    find,
    list,
    /** A UI-server write while windows are open on `path` (null: the file was removed) updates their copies; the caller holds withPathLock(path) */
    async update(path: string, content: Uint8Array | string | null): Promise<void> {
      const absolute = resolve(path);
      for (const window of (await list()).filter(window => window.path === absolute)) {
        const updated: GuardWindow = { ...window, existed: content !== null, ...(content !== null ? { sha256: sha256(content) } : {}) };
        if (content === null) delete updated.sha256;
        await writeFileAtomic(copyPath(window.id), content ?? "");
        await writeFileAtomic(recordPath(window.id), JSON.stringify(updated));
      }
    },
    /** Rule 2: a delivery that opened the window was refused */
    async discard(windowId: string): Promise<void> {
      await rm(recordPath(windowId), { force: true });
      await rm(copyPath(windowId), { force: true });
    },
    /** Rule 3: restore a changed file from the copy, quarantine the other version, close the window; a closed window is a no-op */
    async verify(windowId: string): Promise<GuardVerdict | undefined> {
      const text = await readOptional(recordPath(windowId));
      if (!text) return undefined;
      const window = JSON.parse(text.toString("utf8")) as GuardWindow;
      return withPathLock(window.path, async () => {
        // Another verify may have closed it while this one waited for the lock
        if (!await readOptional(recordPath(windowId))) return undefined;
        const current = await readOptional(window.path);
        const keep = async (other: Buffer) => {
          const key = sha256(window.path);
          await writeFileAtomic(join(quarantine, key), other);
          await writeFileAtomic(join(quarantine, `${key}.json`), JSON.stringify({ path: window.path, at: new Date().toISOString() }));
          return join(quarantine, key);
        };
        let verdict: GuardVerdict;
        if (window.existed && current !== undefined && sha256(current) === window.sha256) verdict = { window, action: "unchanged" };
        else if (!window.existed && current === undefined) verdict = { window, action: "unchanged" };
        else if (window.existed) {
          const copy = await readFile(copyPath(window.id));
          const quarantined = current !== undefined ? await keep(current) : undefined;
          await writeFileAtomic(window.path, copy);
          verdict = { window, action: current === undefined ? "recreated" : "restored", ...(quarantined ? { quarantined } : {}) };
        } else {
          const quarantined = await keep(current!);
          await rm(window.path, { force: true });
          verdict = { window, action: "removed", quarantined };
        }
        await close(window);
        return verdict;
      });
    },
  };
}
export type FileGuard = ReturnType<typeof createFileGuard>;
