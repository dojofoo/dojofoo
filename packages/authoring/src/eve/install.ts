import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalSandbox, prepareHarnessEnvironment } from "@dojofoo/agent/experimental/local";
import { agentAdapter } from "@dojofoo/agent/adapters";
import type { AgentId } from "@dojofoo/protocol";

/** Run the adapter's own cached installation recipe without opening a chat. The bootstrap lands under the environment's HOME. */
export async function prepareAuthoringHarness(agent: AgentId,
  options: { environment?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<void> {
  const harness = new HarnessAgent({ harness: await agentAdapter(agent) });
  const template = await harness.getSandboxTemplate();
  if (!template) return;
  const root = await realpath(await mkdtemp(join(tmpdir(), "dojo-harness-install-")));
  try {
    const environment = options.environment ?? await prepareHarnessEnvironment();
    const sandbox = await createLocalSandbox(root, { environment });
    try { await template.prepare({ session: sandbox, abortSignal: AbortSignal.timeout(options.timeoutMs ?? 120_000) }); }
    finally { await sandbox.stop(); }
  } finally { await rm(root, { recursive: true, force: true }); }
}
