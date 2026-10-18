import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

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

/** Re-read on selection: global < project < environment < explicit UI choice. */
export function resolveRuntimeHarness(role: RuntimeRole, root: string, environment: NodeJS.ProcessEnv = process.env): string {
  const global = read(resolve(environment.DOJOFOO_HOME ?? resolve(homedir(), ".dojofoo"), "runtimes.json"));
  const project = read(resolve(root, ".dojo", "runtimes.json"));
  return environment[`DOJOFOO_${role.toUpperCase()}_HARNESS`] || environment.DOJOFOO_HARNESS || project[role] || global[role] || "opencode";
}

