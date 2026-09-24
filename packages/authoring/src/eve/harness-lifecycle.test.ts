import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalSandbox } from "@dojofoo/agent/experimental/local";
import { expect, it } from "vitest";
import { authoringHarness } from "./harness";
import { authoringEnvironment } from "./environment";

// No prompts or inference. Opt-in because official adapters may bootstrap their
// native binaries and discover the user's existing authentication configuration.
const enabled = process.env.DOJO_HARNESS_LIFECYCLE === "1";
it.skipIf(!enabled).each(["codex", "opencode", "pi", "cursor", "grok", "fx"])(
  "%s boots and reports its unprompted-session recovery capability",
  async name => {
    const environment = await authoringEnvironment(name as Parameters<typeof authoringEnvironment>[0], {
      ...process.env,
      PATH: `${fileURLToPath(new URL("../../node_modules/.bin", import.meta.url))}:${process.env.PATH}`,
    });
    const root = await realpath(await mkdtemp(join(tmpdir(), `dojo-${name}-lifecycle-`)));
    const sandbox = await createLocalSandbox(root, { environment });
    const agent = new HarnessAgent({
      harness: authoringHarness({ DOJOFOO_HARNESS: name }),
      sandboxConfig: { workDir: "course" },
    });
    try {
      const session = await agent.createSession({ sandboxSession: sandbox, abortSignal: AbortSignal.timeout(60_000) });
      expect(session.sessionId).toEqual(expect.any(String));
      if (["codex", "cursor", "grok", "fx"].includes(name)) {
        await expect(session.compact()).rejects.toMatchObject({
          name: "AI_HarnessCapabilityUnsupportedError",
          message: expect.stringMatching(/does not support manual compaction|ACP v1 does not define manual session compaction/),
        });
      }
      const checkpoint = await session.stop();
      expect(checkpoint).toBeDefined();
      const resume = agent.createSession({
        sandboxSession: sandbox, sessionId: session.sessionId,
        resumeFrom: JSON.parse(JSON.stringify(checkpoint)),
        abortSignal: AbortSignal.timeout(60_000),
      });
      // ACP adapters start the native conversation on the first prompt. Their
      // empty checkpoints intentionally lack the native ID/cold configuration.
      // This is not evidence about recovery after a real turn.
      if (["cursor", "grok", "fx"].includes(name)) {
        await expect(resume).rejects.toMatchObject({
          name: "AI_HarnessCapabilityUnsupportedError",
          message: "Cold ACP session restoration requires persisted cold-session configuration and an ACP session identifier.",
        });
        return;
      }
      const resumed = await resume;
      expect(resumed.sessionId).toBe(session.sessionId);
      await resumed.stop();
    } finally {
      await sandbox.stop();
      await rm(root, { recursive: true, force: true });
    }
  }, 150_000,
);
