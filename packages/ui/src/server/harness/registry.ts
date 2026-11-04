import { resolveAgent } from "@dojofoo/config/runtime";
import { acpAgentIds, agentRow, isAcpAgentId, type AcpAgentId } from "@dojofoo/protocol";
import type { HarnessAdapter, HarnessKind } from "./adapter";
import { codexHarnessAdapter } from "./codex";
import { cursorHarnessAdapter, fxHarnessAdapter, grokHarnessAdapter } from "./native-acp";
import { opencodeHarnessAdapter } from "./opencode";
import { claudeHarnessAdapter } from "./claude";

const adapters: Record<AcpAgentId, HarnessAdapter> = {
  claude: claudeHarnessAdapter,
  codex: codexHarnessAdapter,
  cursor: cursorHarnessAdapter,
  fx: fxHarnessAdapter,
  grok: grokHarnessAdapter,
  opencode: opencodeHarnessAdapter,
};

export const lessonHarnesses: HarnessKind[] = [...acpAgentIds];

/** The workspace's coding agent, when the ACP lesson runtime can run it. */
export function lessonAgent(root: string): AcpAgentId {
  const agent = resolveAgent(root);
  if (!isAcpAgentId(agent)) throw new Error(`${agentRow(agent).name} can't teach lessons yet. Choose another coding agent for this workspace.`);
  return agent;
}

export function harnessAdapter(kind: HarnessKind): HarnessAdapter {
  return adapters[kind];
}
