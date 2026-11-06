/** Eve session id → the sandbox its detached native turn still runs in. The sandboxes themselves stay in
 *  createLocalHarnessSandbox's live map; eviction stops one, and the next turn resumes from the checkpoint. */
type Tracked = { sandboxId: string; evict(): Promise<void> };
const key = Symbol.for("dojofoo.harness-sessions");
const sessions = ((globalThis as Record<symbol, unknown>)[key] ??= new Map<string, Tracked>()) as Map<string, Tracked>;

export function trackHarnessSession(eveSessionId: string, session: Tracked): void {
  sessions.set(eveSessionId, session);
}

export function forgetHarnessSession(eveSessionId: string): void {
  sessions.delete(eveSessionId);
}

/** Stops the sandbox of a detached session (killing its native processes). False when nothing was tracked. */
export async function evictHarnessSession(eveSessionId: string): Promise<boolean> {
  const tracked = sessions.get(eveSessionId);
  if (!tracked) return false;
  sessions.delete(eveSessionId);
  await tracked.evict();
  return true;
}
