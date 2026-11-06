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

/** The setting each adapter takes a model's effort as; OpenCode and Cursor take none */
const effortSetting: Partial<Record<AdapterId, string>> = { "claude-code": "effort", codex: "reasoningEffort", fx: "effort", "grok-build": "reasoningEffort", pi: "thinkingLevel" };

// Read-only settings other than Pi's come from the registry row alone, so one adapter per agent, mode and effort serves every call.
const adapters = new Map<string, CachedAdapter>();

/** The official AI SDK adapter for a coding agent. Cursor uses its installed CLI/login; the others keep their native auth.
 *  `read-only` merges the row's isolation settings and wraps the `deny` rows, so their adapters never receive a built-in filter.
 *  `effort` is a level the agent lists for its model (models API); without it the model runs at its own default. */
export async function agentAdapter(agent: AgentId, options: { mode?: HarnessMode; environment?: NodeJS.ProcessEnv; effort?: string } = {}): Promise<AgentAdapter> {
  const { mode = "full", environment = process.env, effort } = options;
  const adapterId = isAgentId(agent) ? agentRow(agent).adapterId : undefined;
  if (!adapterId) throw new Error(`Unsupported coding agent: ${String(agent)}`);
  const effortKey = effort ? effortSetting[adapterId] : undefined;
  const settings = { ...(mode === "read-only" ? await readOnlyAdapterSettings(agent, environment) : {}), ...(effortKey ? { [effortKey]: effort } : {}) };
  const wrap = <A extends AgentAdapter>(adapter: A): A => mode === "read-only" && agentRow(agent).readOnly?.prevention === "deny"
    ? withoutBuiltinFiltering(adapter) : adapter;
  if (adapterId === "pi") {
    const { createPi } = await import("@ai-sdk/harness-pi");
    // A new HarnessAgent per call never reattaches a parked Pi session, and one whose turn is cancelled would stay in memory.
    if (mode === "read-only") return wrap(createPi({ reattachInProcess: false, ...settings }));
    // Custom providers (including credentials referenced by models.json) belong
    // to Pi's native setup. The adapter's default only discovers auth.json.
    return createPi({ agentDir: resolve(environment.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")), reattachInProcess: false, ...settings });
  }
  const key = `${agent}:${mode}:${effortKey ? effort : ""}`;
  let adapter = adapters.get(key);
  if (!adapter) {
    adapter = wrap(factories[adapterId](settings));
    adapters.set(key, adapter);
  }
  return adapter;
}

// The rest of what makes a model call: HarnessAgent, the harness model, the local sandbox and one-shot calls
export * from "./harness.js";
export * from "./harness-model.js";
export * from "./local-runtime.js";
export * from "./one-shot.js";
