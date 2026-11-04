import type { HarnessV1 } from "@ai-sdk/harness";
import { agentRow, type AgentId, type IsolationPlaceholder, type UserConfigIsolation } from "@dojofoo/protocol";
import { existsSync } from "node:fs";
import { lstat, mkdir, readFile, readlink, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type HarnessMode = "read-only" | "full";

/** Native names of the read-only built-ins, as the runtime reports them (the adapters' `builtinTools[key].nativeName`, else the key). */
const nativeBuiltins: Readonly<Record<AgentId, Readonly<Record<string, string>>>> = {
  claude: { read: "Read" },
  codex: {},
  cursor: { read: "readToolCall", glob: "globToolCall", grep: "grepToolCall", ls: "lsToolCall" },
  agy: {},
  grok: { read_file: "read_file", list_dir: "list_dir", grep: "grep", search_tool: "search_tool", use_tool: "use_tool" },
  opencode: { read: "view", glob: "glob", grep: "grep" },
  fx: { read: "read", grep: "grep", glob: "glob", ls: "ls" },
  pi: { read: "read", grep: "grep", glob: "find", ls: "ls" },
};

/** Built-ins a read-only call keeps beyond the row's list, because host tools are reached through them. */
const hostToolRelays: Partial<Record<AgentId, readonly string[]>> = { grok: ["search_tool", "use_tool"] };

/** How each agent names a host tool on the wire. FX discovers host tools through capability_search; Grok through search_tool and use_tool. */
const hostToolNames: Readonly<Record<AgentId, (name: string) => string[]>> = {
  claude: name => [`mcp__harness-tools__${name}`],
  codex: name => [name],
  cursor: name => [name],
  agy: name => [name],
  grok: () => [],
  opencode: name => [`harness-tools_${name}`],
  fx: name => [name, "capability_search"],
  pi: name => [name],
};

function profile(agent: AgentId) {
  const readOnly = agentRow(agent).readOnly;
  if (!readOnly) throw new Error(`${agentRow(agent).name} has no read-only profile.`);
  return readOnly;
}

/** HarnessV1 keys for activeTools, and the native names streams report (step-4 plan, "One name mapping"). */
export function readOnlyToolNames(agent: AgentId, eveToolNames: readonly string[]): { keys: string[]; native: string[] } {
  const builtins = [...profile(agent).builtinTools, ...(hostToolRelays[agent] ?? [])];
  return {
    keys: [...new Set([...builtins, ...eveToolNames])],
    native: [...new Set([...builtins.map(key => nativeBuiltins[agent][key] ?? key), ...eveToolNames.flatMap(hostToolNames[agent])])],
  };
}

/** activeTools = readOnlyToolNames(…).keys; permissionMode from the row. */
export function readOnlyHarnessSettings(agent: AgentId, eveToolNames: readonly string[]): { activeTools: string[]; permissionMode: "allow-reads" | "allow-all" } {
  return { activeTools: readOnlyToolNames(agent, eveToolNames).keys, permissionMode: profile(agent).permissionMode };
}

/** Whether a read-only call may approve this request: the gated call targets one of this call's Eve tools (Grok's use_tool by its tool_name). */
export function approvesHostTool(agent: AgentId, call: { toolName: string; input: unknown }, eveToolNames: readonly string[]): boolean {
  const named = (name: string) => eveToolNames.some(tool => name === tool || hostToolNames[agent](tool).includes(name) || name.endsWith(`__${tool}`));
  if (agent === "grok" && call.toolName === "use_tool") {
    const input = typeof call.input === "string" ? safeParse(call.input) : call.input;
    const target = input && typeof input === "object" ? (input as { tool_name?: unknown }).tool_name : undefined;
    return typeof target === "string" && eveToolNames.some(tool => target === tool || target.endsWith(`__${tool}`));
  }
  return named(call.toolName);
}

function safeParse(value: string): unknown {
  try { return JSON.parse(value); } catch { return undefined; }
}

/** Strips builtinToolFiltering in doStart (resume and continue included), for the `deny` rows (Cursor, Grok). */
export function withoutBuiltinFiltering<A extends HarnessV1>(adapter: A): A {
  return new Proxy(adapter, {
    get(target, property) {
      if (property !== "doStart") return Reflect.get(target, property, target);
      return (options: Parameters<A["doStart"]>[0]) => target.doStart({ ...options, builtinToolFiltering: undefined });
    },
  });
}

function placeholders(base: NodeJS.ProcessEnv, home: string): Record<IsolationPlaceholder, string> {
  const userHome = base.HOME ?? homedir();
  return {
    home,
    userHome,
    userCodexHome: base.CODEX_HOME ?? join(userHome, ".codex"),
    userGrokHome: base.GROK_HOME ?? join(userHome, ".grok"),
    userDataHome: base.XDG_DATA_HOME ?? join(userHome, ".local/share"),
  };
}

const fill = (value: string, values: Record<IsolationPlaceholder, string>) =>
  value.replace(/\{([A-Za-z]+)\}/gu, (match, name: string) => {
    if (!Object.hasOwn(values, name)) throw new Error(`Unknown isolation placeholder ${match}.`);
    return values[name as IsolationPlaceholder];
  });

/** The private home of a read-only agent, or undefined when its row has none. */
export function readOnlyHome(agent: AgentId, options: { stateDirectory: string; eveSessionId?: string }): string | undefined {
  const home = profile(agent).userConfig.home;
  if (!home) return undefined;
  const shared = resolve(options.stateDirectory, "read-only-homes", agent);
  if (home.scope !== "session") return shared;
  if (!options.eveSessionId?.trim() || /[/\\]|^\.\.?$/u.test(options.eveSessionId)) {
    throw new Error(`${agentRow(agent).name}'s read-only home is per session and needs its Eve session id.`);
  }
  return join(shared, "sessions", options.eveSessionId);
}

async function link(path: string, target: string) {
  const existing = await lstat(path).catch(() => undefined);
  if (existing?.isSymbolicLink() && await readlink(path) === target) return;
  if (existing) await rm(path, { recursive: true, force: true });
  await mkdir(dirname(path), { recursive: true });
  await symlink(target, path);
}

/** Only the `[models]` and `[model.*]` tables of a Grok config.toml, copied as text: every other table, MCP servers included, stays out. */
export function grokModelTables(source: string): string {
  const kept: string[] = [];
  let keep = false;
  for (const line of source.split(/\r?\n/u)) {
    const header = /^\s*\[\s*([^\]]+?)\s*\]\s*(#.*)?$/u.exec(line);
    if (header && !line.trimStart().startsWith("[[")) keep = header[1] === "models" || header[1]!.startsWith("model.");
    else if (/^\s*\[\[/u.test(line)) keep = false;
    if (keep) kept.push(line);
  }
  return kept.length ? `${kept.join("\n").trimEnd()}\n` : "";
}

/** The read-only sandbox environment: base, minus `unset`, plus `environment`, with the private home created, linked and written. */
export async function readOnlyEnvironment(agent: AgentId, base: NodeJS.ProcessEnv, options: { stateDirectory: string; eveSessionId?: string }): Promise<NodeJS.ProcessEnv> {
  const isolation: UserConfigIsolation = profile(agent).userConfig;
  const home = readOnlyHome(agent, options);
  // Resolved from the user's own environment, before isolation moves HOME
  const values = placeholders(base, home ?? "");
  if (home && isolation.home) {
    await mkdir(home, { recursive: true });
    for (const [path, target] of Object.entries(isolation.home.links)) {
      const resolved = fill(target, values);
      // tier-A Codex has no auth.json: it authenticates by API key
      if (!existsSync(resolved)) {
        await unlink(join(home, fill(path, values))).catch(() => {});
        continue;
      }
      await link(join(home, fill(path, values)), resolved);
    }
    for (const [path, content] of Object.entries(isolation.home.files ?? {})) {
      await mkdir(dirname(join(home, path)), { recursive: true });
      await writeFile(join(home, path), content);
    }
    if (agent === "grok") {
      const source = await readFile(join(values.userGrokHome, "config.toml"), "utf8").catch(() => "");
      await mkdir(join(home, ".grok"), { recursive: true });
      await writeFile(join(home, ".grok/config.toml"), grokModelTables(source));
    }
  }
  const environment: NodeJS.ProcessEnv = { ...base };
  for (const name of isolation.unset ?? []) delete environment[name];
  for (const [name, value] of Object.entries(isolation.environment)) environment[name] = fill(value, values);
  return environment;
}

/** Removes a per-session private home (Grok); a no-op for the shared ones. */
export async function removeReadOnlyHome(agent: AgentId, options: { stateDirectory: string; eveSessionId: string }): Promise<void> {
  if (profile(agent).userConfig.home?.scope !== "session") return;
  const home = readOnlyHome(agent, options);
  if (home) await rm(home, { recursive: true, force: true, maxRetries: 3 });
}

/** Pi's read-only credentials: the user's auth.json, read but never written (an expired login is refreshed by running Pi itself). */
function readOnlyPiCredentials(authPath: string) {
  let data: Record<string, unknown> | undefined;
  const load = async () => {
    if (data) return data;
    try {
      const parsed: unknown = JSON.parse((await readFile(authPath, "utf8")).replace(/^﻿/u, ""));
      data = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      data = {};
    }
    return data;
  };
  const refuse = async (): Promise<never> => { throw new Error("Read-only credential storage cannot modify auth.json"); };
  return {
    read: async (providerId: string) => structuredClone((await load())[providerId]) as never,
    list: async () => Object.entries(await load()).map(([providerId, credential]) => ({ providerId, type: (credential as { type?: unknown }).type })) as never,
    modify: refuse,
    delete: refuse,
  };
}

/** The read-only adapter settings: the row's adapterSettings, plus Pi's providers and credentials (step-4 plan, "Per-agent isolation"). */
export async function readOnlyAdapterSettings(agent: AgentId, base: NodeJS.ProcessEnv): Promise<Record<string, unknown>> {
  const settings: Record<string, unknown> = { ...profile(agent).userConfig.adapterSettings };
  if (agent === "pi") {
    const agentDir = resolve(base.PI_CODING_AGENT_DIR ?? join(base.HOME ?? homedir(), ".pi", "agent"));
    const models = await readFile(join(agentDir, "models.json"), "utf8").then(JSON.parse, () => undefined) as { providers?: unknown } | undefined;
    if (models?.providers && typeof models.providers === "object") settings.providers = models.providers;
    settings.credentials = readOnlyPiCredentials(join(agentDir, "auth.json"));
  }
  return settings;
}

export type PreventionRecord =
  | { type: "dojofoo.prevention"; kind: "approval-refused"; agent: AgentId; tool: string; eveSessionId?: string; at: string }
  | { type: "dojofoo.prevention"; kind: "native-call-outside-allow-list"; agent: AgentId; tool: string; failed: boolean; eveSessionId?: string; at: string };

/** A read-only turn asked for something it may not do. No statusCode, so Eve does not retry the step. */
export class PreventionError extends Error {
  readonly record: PreventionRecord;
  constructor(record: PreventionRecord) {
    super(`Sensei asked to use ${record.tool}, which a read-only persona may not use.`);
    this.name = "PreventionError";
    this.record = record;
  }
}
