import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { agentRow, fallbackAgent, isAgentId, offeredAgents, type AgentId } from "@dojofoo/protocol";
import { resolveAgentExecutable, type AgentDiscoveryOptions } from "./agent-installations";

export type AgentSelectionOptions = { environment?: NodeJS.ProcessEnv; discovery?: AgentDiscoveryOptions };

/** Removed: each workspace keeps its coding agent in `.dojo/runtimes.json`. */
export const ignoredAgentVariables = ["DOJOFOO_HARNESS", "DOJOFOO_LESSON_HARNESS", "DOJOFOO_AUTHORING_HARNESS",
  "DOJOFOO_MODEL", "DOJOFOO_LESSON_MODEL", "DOJOFOO_AUTHORING_MODEL"] as const;

const warned = new Set<string>();
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(message);
}

const offered = (id: string): id is AgentId => isAgentId(id) && offeredAgents().some(row => row.id === id);

function readRuntimes(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid agent in ${path}`);
  return value as Record<string, unknown>;
}

function savedAgent(root: string): AgentId | undefined {
  const path = resolve(root, ".dojo", "runtimes.json");
  const { agent, authoring, lesson } = readRuntimes(path);
  if (authoring !== undefined || lesson !== undefined) {
    warnOnce(`roles:${path}`, `The authoring and lesson keys in ${path} are ignored: each workspace has one coding agent, saved as "agent".`);
  }
  if (agent === undefined) return undefined;
  if (typeof agent !== "string") throw new Error(`Invalid agent in ${path}`);
  if (offered(agent)) return agent;
  warnOnce(`offered:${path}`, `The coding agent "${agent}" in ${path} isn't offered; choose another one in the composer's agent menu.`);
  return undefined;
}

function onboardingAgent(stateHome: string): AgentId | undefined {
  const path = resolve(stateHome, "settings.json");
  if (!existsSync(path)) return undefined;
  const settings = JSON.parse(readFileSync(path, "utf8")) as { agents?: unknown; agent?: string };
  const selected = settings.agents ?? (settings.agent ? [settings.agent] : []);
  if (!Array.isArray(selected) || selected.some(id => typeof id !== "string")) throw new Error(`Invalid selected agents in ${path}`);
  return (selected as string[]).find(offered);
}

/** Highest first: <root>/.dojo/runtimes.json `agent`; the first offered agent in $DOJOFOO_HOME/settings.json `agents`
 * (or legacy `agent`); the first offered agent whose CLI resolveAgentExecutable finds; fallbackAgent. */
export function resolveAgent(root: string, options: AgentSelectionOptions = {}): AgentId {
  const environment = options.environment ?? process.env;
  for (const name of ignoredAgentVariables) {
    if (environment[name]) {
      warnOnce(`variable:${name}`, `${name} is ignored: each workspace keeps its coding agent in .dojo/runtimes.json; choose it in the composer's agent menu.`);
    }
  }
  const stateHome = environment.DOJOFOO_HOME ?? resolve(homedir(), ".dojofoo");
  return savedAgent(root) ?? onboardingAgent(stateHome)
    ?? offeredAgents().find(row => resolveAgentExecutable(row.id, { environment, ...options.discovery }))?.id
    ?? fallbackAgent;
}

/** Saves <root>/.dojo/runtimes.json { ...other keys, agent } through a temp file and rename; drops `authoring`/`lesson`. */
export function writeAgent(root: string, agent: AgentId, _options: AgentSelectionOptions = {}): void {
  if (!isAgentId(agent)) throw new Error(`Unsupported coding agent: ${String(agent)}`);
  if (!offered(agent)) throw new Error(`${agentRow(agent).name} isn't available yet. Choose another coding agent.`);
  const path = resolve(root, ".dojo", "runtimes.json");
  const { authoring: _authoring, lesson: _lesson, ...other } = readRuntimes(path);
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ ...other, agent }, null, 2)}\n`);
  renameSync(temporary, path);
}

/** A per-agent map in <root>/.dojo/runtimes.json: `models` (D26) or `efforts` */
type AgentSetting = "models" | "efforts";
function readAgentSetting(root: string, key: AgentSetting, agent: AgentId): string | undefined {
  const map = readRuntimes(resolve(root, ".dojo", "runtimes.json"))[key];
  if (!map || typeof map !== "object" || Array.isArray(map)) return undefined;
  const value = (map as Record<string, unknown>)[agent];
  return typeof value === "string" && value.trim() ? value : undefined;
}
/** Saves `<key>[agent]` through a temp file and rename, keeping `agent` and every other key. */
function writeAgentSetting(root: string, key: AgentSetting, agent: AgentId, value: string): void {
  if (!isAgentId(agent)) throw new Error(`Unsupported coding agent: ${String(agent)}`);
  const path = resolve(root, ".dojo", "runtimes.json");
  const current = readRuntimes(path);
  const map = current[key] && typeof current[key] === "object" && !Array.isArray(current[key]) ? current[key] as Record<string, unknown> : {};
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ ...current, [key]: { ...map, [agent]: value } }, null, 2)}\n`);
  renameSync(temporary, path);
}

/** The workspace's last model for a coding agent: <root>/.dojo/runtimes.json `models[agent]` (D26). */
export const readAgentModel = (root: string, agent: AgentId) => readAgentSetting(root, "models", agent);
/** Saves `models[agent]` in <root>/.dojo/runtimes.json. */
export const writeAgentModel = (root: string, agent: AgentId, model: string) => writeAgentSetting(root, "models", agent, model);
/** The workspace's last effort for a coding agent: `efforts[agent]`, for its next new conversation. */
export const readAgentEffort = (root: string, agent: AgentId) => readAgentSetting(root, "efforts", agent);
/** Saves `efforts[agent]` in <root>/.dojo/runtimes.json. */
export const writeAgentEffort = (root: string, agent: AgentId, effort: string) => writeAgentSetting(root, "efforts", agent, effort);
