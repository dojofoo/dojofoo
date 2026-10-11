import { realpath } from "node:fs/promises";
import type { createPi } from "@ai-sdk/harness-pi";

/** Local courses can be mounted by symlink. Pi compares real tool paths with
 * its workspace root; pass the canonical root to the official adapter too.
 * No auth, tool schema, inference, or session lifecycle is replaced here.
 */
export function canonicalLocalPi(adapter: ReturnType<typeof createPi>): ReturnType<typeof createPi> {
  return {
    ...adapter,
    doStart: async input => adapter.doStart({
      ...input, sessionWorkDir: await realpath(input.sessionWorkDir),
    }),
  };
}
