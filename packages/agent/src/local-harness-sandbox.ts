import { createLocalSandbox } from "./local-sandbox.js";

type Session = Awaited<ReturnType<typeof createLocalSandbox>>;
type Options = NonNullable<Parameters<typeof createLocalSandbox>[1]>;

// A detached harness session leaves its sandbox running for the next call to
// resume. Hand that call the same sandbox, which owns the running processes.
const live = new Map<string, Session>();

/** Official harness sandbox lifecycle over a caller-owned local process host.
 * This is execution plumbing, not a filesystem security boundary.
 */
export function createLocalHarnessSandbox(directory: string, options: Omit<Options, "id"> & { providerId?: string } = {}) {
  const { providerId = "dojo-local", ...local } = options;
  const acquire = async (sessionId?: string) => {
    const session = await createLocalSandbox(directory, { ...local, id: sessionId });
    const stop = () => {
      if (live.get(session.id) === owned) live.delete(session.id);
      return session.stop();
    };
    const owned: Session = { ...session, stop, destroy: stop };
    live.set(owned.id, owned);
    return owned;
  };
  return {
    specificationVersion: "harness-sandbox-v1" as const,
    providerId,
    async createSession(input?: {
      sessionId?: string;
      abortSignal?: AbortSignal;
      onFirstCreate?: (session: Session, options: { abortSignal?: AbortSignal }) => Promise<void>;
    }) {
      input?.abortSignal?.throwIfAborted();
      const session = await acquire(input?.sessionId);
      try {
        await input?.onFirstCreate?.(session, { abortSignal: input.abortSignal });
        return session;
      } catch (error) {
        await session.stop();
        throw error;
      }
    },
    resumeSession: ({ sessionId, abortSignal }: { sessionId: string; abortSignal?: AbortSignal }) => {
      abortSignal?.throwIfAborted();
      return Promise.resolve(live.get(sessionId) ?? acquire(sessionId));
    },
    /** Stops a detached session's sandbox and its native processes; the next resume starts a fresh one. */
    async evict(sandboxId: string) {
      await live.get(sandboxId)?.stop();
    },
    /** A session that is stopping keeps its sandbox until its stop ends; the next resume starts a fresh one,
     *  which that stop cannot kill. */
    withdraw(sandboxId: string) {
      live.delete(sandboxId);
    },
  };
}
