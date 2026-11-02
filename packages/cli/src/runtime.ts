import { agentDefinitions, type AgentId } from "@dojofoo/config/agents";

export type RuntimeName = AgentId | "unknown";

export type RuntimeIdentity = {
  name: RuntimeName;
  sessionId?: string;
};

const SESSION_KEYS: Partial<Record<Exclude<RuntimeName, "unknown">, string[]>> = {
  pi: ["PI_SESSION_ID", "PI_THREAD_ID"],
  codex: ["CODEX_THREAD_ID", "CODEX_SESSION_ID"],
  claude: ["CLAUDE_SESSION_ID", "CLAUDE_CONVERSATION_ID"],
  opencode: ["OPENCODE_SESSION_ID"],
};

export function runtimeIdentity(environment: NodeJS.ProcessEnv = process.env): RuntimeIdentity {
  const name = runtimeName(environment);
  return {
    name,
    sessionId: environment.DOJOFOO_SESSION_ID ?? sessionId(environment, name),
  };
}

function runtimeName(environment: NodeJS.ProcessEnv): RuntimeName {
  const selected = environment.DOJOFOO_HARNESS;
  if (agentDefinitions.some(agent => agent.id === selected)) return selected as AgentId;
  if (environment.OPENCODE) return "opencode";
  if (environment.CLAUDECODE) return "claude";
  if (environment.PI_CODING_AGENT) return "pi";
  if (environment.CODEX_THREAD_ID || environment.CODEX_SESSION_ID) return "codex";
  if (environment.OPENCODE_SESSION_ID) return "opencode";
  return "unknown";
}

function sessionId(environment: NodeJS.ProcessEnv, runtime: RuntimeName): string | undefined {
  if (runtime === "unknown") return undefined;
  return (SESSION_KEYS[runtime] ?? []).map((key) => environment[key]).find(Boolean);
}
