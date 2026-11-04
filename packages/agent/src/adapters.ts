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
import { readOnlyAdapterSettings, withoutBuiltinFiltering, type HarnessMode } from "./read-only.js";

type CachedAdapter = ReturnType<typeof createClaudeCode> | ReturnType<typeof createCodex> | ReturnType<typeof createLocalCursor>
  | ReturnType<typeof createFx> | ReturnType<typeof createGrokBuild> | ReturnType<typeof createOpenCode>;
export type AgentAdapter = CachedAdapter | ReturnType<typeof createPi>;

type Settings = Record<string, unknown>;
const factories: Record<Exclude<AdapterId, "pi">, (settings: Settings) => CachedAdapter> = {
  "claude-code": settings => createClaudeCode({ port: 0, ...settings }),
  codex: settings => createCodex({ port: 0, ...settings }),
  cursor: () => createLocalCursor(),
  fx: settings => createFx({ ...settings }),
  "grok-build": settings => createGrokBuild({ port: 0, ...settings }),
  opencode: settings => createOpenCode({ port: 0, ...settings }),
};

// Read-only settings other than Pi's come from the registry row alone, so one adapter per agent and mode serves every call.
const adapters = new Map<string, CachedAdapter>();

/** The official AI SDK adapter for a coding agent. Cursor uses its installed CLI/login; the others keep their native auth.
 *  `read-only` merges the row's isolation settings and wraps the `deny` rows, so their adapters never receive a built-in filter. */
export async function agentAdapter(agent: AgentId, options: { mode?: HarnessMode; environment?: NodeJS.ProcessEnv } = {}): Promise<AgentAdapter> {
  const { mode = "full", environment = process.env } = options;
  const adapterId = isAgentId(agent) ? agentRow(agent).adapterId : undefined;
  if (!adapterId) throw new Error(`Unsupported coding agent: ${String(agent)}`);
  const settings = mode === "read-only" ? await readOnlyAdapterSettings(agent, environment) : {};
  const wrap = <A extends AgentAdapter>(adapter: A): A => mode === "read-only" && agentRow(agent).readOnly?.prevention === "deny"
    ? withoutBuiltinFiltering(adapter) : adapter;
  if (adapterId === "pi") {
    const { createPi } = await import("@ai-sdk/harness-pi");
    // A new HarnessAgent per call never reattaches a parked Pi session, and one whose turn is cancelled would stay in memory.
    if (mode === "read-only") return wrap(createPi({ reattachInProcess: false, ...settings }));
    // Custom providers (including credentials referenced by models.json) belong
    // to Pi's native setup. The adapter's default only discovers auth.json.
    return createPi({ agentDir: resolve(environment.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")), reattachInProcess: false });
  }
  const key = `${agent}:${mode}`;
  let adapter = adapters.get(key);
  if (!adapter) {
    adapter = wrap(factories[adapterId](settings));
    adapters.set(key, adapter);
  }
  return adapter;
}
