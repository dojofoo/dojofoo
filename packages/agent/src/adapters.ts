import { createClaudeCode } from "@ai-sdk/harness-claude-code";
import { createCodex } from "@ai-sdk/harness-codex";
import { createFx } from "@ai-sdk/harness-fx";
import { createGrokBuild } from "@ai-sdk/harness-grok-build";
import { createOpenCode } from "@ai-sdk/harness-opencode";
import type { createPi } from "@ai-sdk/harness-pi";
import { agentRow, isAgentId, type AdapterId, type AgentId } from "@dojofoo/protocol";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createLocalCursor } from "./local-cursor.js";

type CachedAdapter = ReturnType<typeof createClaudeCode> | ReturnType<typeof createCodex> | ReturnType<typeof createLocalCursor>
  | ReturnType<typeof createFx> | ReturnType<typeof createGrokBuild> | ReturnType<typeof createOpenCode>;
export type AgentAdapter = CachedAdapter | ReturnType<typeof createPi>;

const factories: Record<Exclude<AdapterId, "pi">, () => CachedAdapter> = {
  "claude-code": () => createClaudeCode({ port: 0 }),
  codex: () => createCodex({ port: 0 }),
  cursor: () => createLocalCursor(),
  fx: () => createFx(),
  "grok-build": () => createGrokBuild({ port: 0 }),
  opencode: () => createOpenCode({ port: 0 }),
};

const adapters = new Map<AgentId, CachedAdapter>();

/** The official AI SDK adapter for a coding agent. Cursor uses its installed CLI/login; the others keep their native auth. */
export async function agentAdapter(agent: AgentId, environment: NodeJS.ProcessEnv = process.env): Promise<AgentAdapter> {
  const adapterId = isAgentId(agent) ? agentRow(agent).adapterId : undefined;
  if (!adapterId) throw new Error(`Unsupported coding agent: ${String(agent)}`);
  // Custom providers (including credentials referenced by models.json) belong
  // to Pi's native setup. The adapter's default only discovers auth.json.
  if (adapterId === "pi") {
    const { createPi } = await import("@ai-sdk/harness-pi");
    return createPi({ agentDir: resolve(environment.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")) });
  }
  let adapter = adapters.get(agent);
  if (!adapter) {
    adapter = factories[adapterId]();
    adapters.set(agent, adapter);
  }
  return adapter;
}
