import { accessSync, constants, statSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { agentDefinitions, type AgentId, type AgentInstallation } from "./agents";

export type AgentDiscoveryOptions = { environment?: NodeJS.ProcessEnv; home?: string; platform?: NodeJS.Platform };

function executable(path: string): boolean {
  try { accessSync(path, constants.X_OK); return statSync(path).isFile(); }
  catch { return false; }
}

function installationDirectories(environment: NodeJS.ProcessEnv, home: string, platform: NodeJS.Platform): string[] {
  return [
    join(home, ".local/bin"), join(home, ".bun/bin"), join(home, ".vite-plus/bin"),
    join(home, ".npm-global/bin"), join(home, ".local/share/mise/shims"), join(home, ".asdf/shims"),
    join(home, ".opencode/bin"), join(home, ".claude/local"),
    ...(platform === "win32" ? [join(environment.APPDATA ?? join(home, "AppData/Roaming"), "npm"),
      join(environment.LOCALAPPDATA ?? join(home, "AppData/Local"), "Microsoft/WinGet/Links")]
      : ["/opt/homebrew/bin", "/usr/local/bin"]),
  ];
}

/** Resolve installations without launching CLIs, model calls, or login flows. */
export function resolveAgentExecutable(id: AgentId, options: AgentDiscoveryOptions = {}): string | null {
  const environment = options.environment ?? process.env;
  const home = options.home ?? environment.HOME ?? environment.USERPROFILE ?? homedir();
  const platform = options.platform ?? process.platform;
  const definition = agentDefinitions.find(agent => agent.id === id)!;
  const override = definition.executableEnvironment ? environment[definition.executableEnvironment] : undefined;
  if (override && (isAbsolute(override) || override.includes("/") || override.includes("\\"))) {
    return executable(resolve(override)) ? resolve(override) : null;
  }
  const command = override ?? definition.command;
  const path = (environment.PATH ?? "").split(delimiter).filter(Boolean);
  const directories = [
    ...(id === "opencode" ? [join(home, ".opencode/bin")] : []),
    ...path,
    ...installationDirectories(environment, home, platform),
  ];
  const extensions = platform === "win32" ? ["", ...(environment.PATHEXT ?? ".EXE;.CMD;.BAT").split(";").map(extension => extension.toLowerCase())] : [""];
  for (const directory of new Set(directories)) {
    for (const extension of extensions) {
      const candidate = resolve(directory, command + extension);
      if (executable(candidate)) return candidate;
    }
  }
  return null;
}

/** Fresh core inventory: newly installed or removed agents appear on the next read. */
export function discoverAgents(options: AgentDiscoveryOptions = {}): AgentInstallation[] {
  return agentDefinitions.map(agent => {
    const executable = resolveAgentExecutable(agent.id, options);
    return { ...agent, executable, found: executable !== null };
  });
}

/** Native runtimes inherit the same locations used by discovery. */
export function agentEnvironment(environment: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const home = environment.HOME ?? environment.USERPROFILE ?? homedir();
  // Include locations before an agent is installed, so a later native launch
  // uses the same inventory without needing to restart the daemon.
  const directories = installationDirectories(environment, home, process.platform);
  return { ...environment, PATH: [...new Set([...(environment.PATH ?? "").split(delimiter).filter(Boolean), ...directories])].join(delimiter) };
}
