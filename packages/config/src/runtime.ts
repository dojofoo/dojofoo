import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { agentDefinitions } from "./agents";

export type RuntimeRole = "authoring" | "lesson";
type RuntimeConfig = Partial<Record<RuntimeRole, string>>;

function read(path: string): RuntimeConfig {
  if (!existsSync(path)) return {};
  const value = JSON.parse(readFileSync(path, "utf8")) as RuntimeConfig;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid runtime config: ${path}`);
  for (const role of ["authoring", "lesson"] as const) {
    if (value[role] !== undefined && (typeof value[role] !== "string" || !value[role]?.trim())) {
      throw new Error(`Invalid ${role} harness in ${path}`);
    }
  }
  return value;
}

function selectedRuntime(role: RuntimeRole, stateHome: string): string | undefined {
  const path = resolve(stateHome, "settings.json");
  if (!existsSync(path)) return undefined;
  const settings = JSON.parse(readFileSync(path, "utf8")) as { agents?: unknown; agent?: string };
  const selected = settings.agents ?? (settings.agent ? [settings.agent] : []);
  if (!Array.isArray(selected) || selected.some(id => typeof id !== "string")) throw new Error(`Invalid selected agents in ${path}`);
  return selected.find(id => agentDefinitions.some(agent => agent.id === id));
}

/** Re-read on selection: selected agents < global < project < environment < explicit UI choice. */
export function resolveRuntimeHarness(role: RuntimeRole, root: string, environment: NodeJS.ProcessEnv = process.env): string {
  const stateHome = environment.DOJOFOO_HOME ?? resolve(homedir(), ".dojofoo");
  const global = read(resolve(stateHome, "runtimes.json"));
  const project = read(resolve(root, ".dojo", "runtimes.json"));
  return environment[`DOJOFOO_${role.toUpperCase()}_HARNESS`] || environment.DOJOFOO_HARNESS || project[role] || global[role] || selectedRuntime(role, stateHome) || "opencode";
}

