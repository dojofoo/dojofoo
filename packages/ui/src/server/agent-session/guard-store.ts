import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createFileGuard, writeFileAtomic, type GuardVerdict } from "@dojofoo/harness/persona";
import { localStateDirectory, type LocalStateOptions } from "@dojofoo/config/local-state";
import type { GuardViolation } from "@dojofoo/protocol";

/** `$DOJOFOO_HOME/state/guard/<root key>`: the first 16 hex characters of the SHA-256 of the workspace's resolved folder, so a
 *  caller with only the folder (writeSolution) and one with a workspace id find the same store (step-5 plan, decision 25).
 *  This module imports nothing of the UI server, so the lesson services can use it without a cycle. */
const guardDirectory = (options: LocalStateOptions = {}) => join(localStateDirectory(options), "guard");
const resolved = (root: string) => { try { return realpathSync(root); } catch { return resolve(root); } };
export const rootKey = (root: string) => createHash("sha256").update(resolved(root)).digest("hex").slice(0, 16);
const storeOf = (root: string, options?: LocalStateOptions) => join(guardDirectory(options), rootKey(root));

export function guardFor(root: string, options?: LocalStateOptions) {
  return createFileGuard(storeOf(root, options));
}

/** A UI-server write of `path` while windows are open on it keeps the write (D21); the caller holds withPathLock(path). */
export async function updateOpenWindows(root: string, path: string, content: Uint8Array | string | null, options?: LocalStateOptions): Promise<void> {
  await guardFor(root, options).update(path, content);
}

/** Every persisted window in every store, verified (startup step 3). Returns the verdicts that acted. */
export async function verifyAllWindows(stateDirectory = localStateDirectory()): Promise<GuardVerdict[]> {
  const directory = join(stateDirectory, "guard");
  let stores: string[];
  try { stores = await readdir(directory); } catch { return []; }
  const acted: GuardVerdict[] = [];
  for (const store of stores) {
    const guard = createFileGuard(join(directory, store));
    for (const window of await guard.list()) {
      const verdict = await guard.verify(window.id);
      if (verdict && verdict.action !== "unchanged") acted.push(verdict);
    }
  }
  return acted;
}

/** A violation raised while no socket for its page key was open, shown once when one opens (decision 19). */
export interface GuardNotice { workspaceId: string; violation: GuardViolation }
const noticesFile = (root: string, options?: LocalStateOptions) => join(storeOf(root, options), "notices.json");
async function readNotices(file: string): Promise<GuardNotice[]> {
  try { return (JSON.parse(await readFile(file, "utf8")) as { notices: GuardNotice[] }).notices ?? []; }
  catch { return []; }
}
let noticeWrites: Promise<unknown> = Promise.resolve();
const queued = <T>(change: () => Promise<T>): Promise<T> => {
  const next = noticeWrites.then(change);
  noticeWrites = next.catch(() => {});
  return next;
};

export function addNotice(root: string, notice: GuardNotice, options?: LocalStateOptions): Promise<void> {
  const file = noticesFile(root, options);
  return queued(async () => {
    await writeFileAtomic(file, JSON.stringify({ notices: [...await readNotices(file), notice] }));
  });
}

/** Removes and returns the notices of one lesson page. */
export function takeNotices(root: string, courseId: string, lessonId: string, options?: LocalStateOptions): Promise<GuardNotice[]> {
  const file = noticesFile(root, options);
  return queued(async () => {
    const notices = await readNotices(file);
    const taken = notices.filter(notice => notice.violation.courseId === courseId && notice.violation.lessonId === lessonId);
    if (taken.length) await writeFileAtomic(file, JSON.stringify({ notices: notices.filter(notice => !taken.includes(notice)) }));
    return taken;
  });
}
