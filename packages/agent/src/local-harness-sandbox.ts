import { createLocalSandbox } from "./local-sandbox.js";

type Session = Awaited<ReturnType<typeof createLocalSandbox>>;
type Options = NonNullable<Parameters<typeof createLocalSandbox>[1]>;

/** Official harness sandbox lifecycle over a caller-owned local process host.
 * This is execution plumbing, not a filesystem security boundary.
 */
export function createLocalHarnessSandbox(directory: string, options: Omit<Options, "id"> & { providerId?: string } = {}) {
  const { providerId = "dojo-local", ...local } = options;
  const acquire = (sessionId?: string) => createLocalSandbox(directory, { ...local, id: sessionId });
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
      return acquire(sessionId);
    },
  };
}
