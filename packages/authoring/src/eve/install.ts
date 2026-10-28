import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalSandbox, prepareHarnessEnvironment } from "@dojofoo/agent/experimental/local";
import { authoringHarness, type AuthoringHarness } from "./harness.ts";
import { authoringEnvironment } from "./environment.ts";

/** Run the adapter's own cached installation recipe without opening a chat. */
export async function prepareAuthoringHarness(harness: AuthoringHarness): Promise<void> {
  const agent = new HarnessAgent({ harness: await authoringHarness({ ...process.env, DOJOFOO_HARNESS: harness }) });
  const template = await agent.getSandboxTemplate();
  if (!template) return;
  const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-harness-install-")));
  try {
    const environment = await prepareHarnessEnvironment(await authoringEnvironment(harness));
    const sandbox = await createLocalSandbox(root, { environment });
    try { await template.prepare({ session: sandbox, abortSignal: AbortSignal.timeout(120_000) }); }
    finally { await sandbox.stop(); }
  } finally { await rm(root, { recursive: true, force: true }); }
}
