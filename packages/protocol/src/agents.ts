/** The coding agents dojofoo knows, as data: identity, install metadata and read-only capabilities. */
export const agentIds = ["claude", "codex", "cursor", "agy", "grok", "opencode", "fx", "pi"] as const;
export type AgentId = (typeof agentIds)[number];
/** Adapter ids stay inside the harness (D12). */
export type AdapterId = "claude-code" | "codex" | "cursor" | "fx" | "grok-build" | "opencode" | "pi";
export type PreventionMechanism = "filter" | "deny";
export type ReadOnlyPermissionMode = "allow-all" | "allow-reads";
export type UserConfigIsolation =
  | { status: "flags"; args: readonly string[]; adapterSettings?: Readonly<Record<string, unknown>>; note: string }
  | { status: "environment"; home: "empty-directory"; environment: Readonly<Record<string, string>>; note: string }
  | { status: "none"; note: string }
  | { status: "pending"; candidates?: readonly string[]; note: string };
export interface ReadOnlyProfile {
  prevention: PreventionMechanism;
  permissionMode: ReadOnlyPermissionMode;
  /** HarnessV1 built-in tool keys allowed for read-only personas (step 4 builds the allow-list from them). */
  builtinTools: readonly string[];
  /** Data only in step 2; step 4 applies it when the CLI starts. */
  userConfig: UserConfigIsolation;
}
export type ModelDiscovery =
  | { method: "native" }
  | { method: "acp-probe" }
  | { method: "cli-aliases"; aliases: readonly string[] };
export interface AgentRow {
  id: AgentId;
  name: string;
  short: string;
  command: string;
  install: string;
  docs: string;
  executableEnvironment?: string;
  /** Undefined when no AI SDK adapter exists (agy). */
  adapterId?: AdapterId;
  /** Runs today's ACP Sensei path; removed in step 7. */
  acp: boolean;
  readOnly?: ReadOnlyProfile;
  modelDiscovery?: ModelDiscovery;
}
export type AgentInstallation = AgentRow & { found: boolean; executable: string | null };

const grokConfigSources = ["CLAUDE", "CURSOR"].flatMap(source =>
  ["MCPS", "SKILLS", "RULES", "AGENTS", "HOOKS"].map(kind => [`GROK_${source}_${kind}_ENABLED`, "false"] as const));

/** Onboarding shows the rows in this order, and the installed-CLI fallback walks it. */
export const agentRows: readonly AgentRow[] = [
  {
    id: "claude", name: "Claude Code", short: "Claude", command: "claude", install: "npm install -g @anthropic-ai/claude-code", docs: "docs.anthropic.com/claude-code",
    adapterId: "claude-code", acp: true,
    readOnly: {
      prevention: "filter", permissionMode: "allow-reads", builtinTools: ["read", "glob", "grep"],
      userConfig: {
        status: "flags", args: ["--strict-mcp-config", "--setting-sources", ""], adapterSettings: { strictMcpConfig: true },
        note: "The adapter passes tools from the built-in filter, but @ai-sdk/harness-claude-code 1.0.171 has no settingSources setting, so step 4 must find another way to pass --setting-sources \"\".",
      },
    },
    modelDiscovery: { method: "cli-aliases", aliases: ["fable", "opus", "sonnet"] },
  },
  {
    id: "codex", name: "Codex", short: "Codex", command: "codex", install: "npm install -g @openai/codex", docs: "developers.openai.com/codex", executableEnvironment: "CODEX_PATH",
    adapterId: "codex", acp: true,
    readOnly: {
      // Codex has no read-only file tool (bash, apply_patch, webSearch, view_image), so Codex Sensei reads through context.
      prevention: "filter", permissionMode: "allow-all", builtinTools: [],
      userConfig: {
        status: "pending", candidates: ["--ignore-user-config"],
        note: "The judges pass --ignore-user-config to codex exec; whether the app-server path takes it is unverified.",
      },
    },
    modelDiscovery: { method: "native" },
  },
  {
    id: "cursor", name: "Cursor", short: "Cursor", command: "cursor-agent", install: "curl https://cursor.com/install -fsS | bash", docs: "cursor.com/cli",
    adapterId: "cursor", acp: true,
    readOnly: {
      prevention: "deny", permissionMode: "allow-reads", builtinTools: ["read", "glob", "grep", "ls"],
      userConfig: { status: "none", note: "A HOME override breaks Cursor's keychain login; read-only relies on ask mode and rejecting permission requests." },
    },
    modelDiscovery: { method: "acp-probe" },
  },
  { id: "agy", name: "Antigravity", short: "Antigravity", command: "agy", install: "", docs: "antigravity.google/docs/cli", acp: false },
  {
    id: "grok", name: "Grok Build", short: "Grok", command: "grok", install: "npm install -g @xai-official/grok", docs: "x.ai/cli",
    adapterId: "grok-build", acp: true,
    readOnly: {
      prevention: "deny", permissionMode: "allow-reads", builtinTools: ["read_file", "list_dir", "grep"],
      userConfig: {
        status: "environment", home: "empty-directory",
        environment: Object.fromEntries([["GROK_HOME", "~/.grok"], ...grokConfigSources]),
        note: "HOME is an empty directory; GROK_HOME keeps the login in the user's real ~/.grok, and the Claude and Cursor config sources are off.",
      },
    },
    modelDiscovery: { method: "acp-probe" },
  },
  {
    id: "opencode", name: "OpenCode", short: "OpenCode", command: "opencode", install: "brew install sst/tap/opencode", docs: "opencode.ai", executableEnvironment: "OPENCODE_BIN",
    adapterId: "opencode", acp: true,
    readOnly: {
      prevention: "filter", permissionMode: "allow-reads", builtinTools: ["read", "glob", "grep"],
      userConfig: { status: "pending", note: "Research pending." },
    },
    modelDiscovery: { method: "native" },
  },
  {
    id: "fx", name: "FX", short: "FX", command: "fx", install: "", docs: "dojo.foo/docs",
    adapterId: "fx", acp: true,
    readOnly: {
      prevention: "filter", permissionMode: "allow-reads", builtinTools: ["read", "grep", "glob", "ls"],
      userConfig: { status: "environment", home: "empty-directory", environment: {}, note: "A HOME override only; filtering goes through @ai-sdk/harness-fx." },
    },
    modelDiscovery: { method: "native" },
  },
  {
    id: "pi", name: "Pi", short: "Pi", command: "pi", install: "curl -fsSL https://pi.dev/install.sh | sh", docs: "pi.dev",
    adapterId: "pi", acp: false,
    readOnly: {
      prevention: "filter", permissionMode: "allow-reads", builtinTools: ["read", "grep", "glob", "ls"],
      userConfig: { status: "pending", note: "No research yet." },
    },
    modelDiscovery: { method: "native" },
  },
];

/** Today's default when nothing else selects an agent. */
export const fallbackAgent: AgentId = "opencode";

export function isAgentId(value: unknown): value is AgentId {
  return typeof value === "string" && (agentIds as readonly string[]).includes(value);
}

export function agentRow(id: AgentId): AgentRow {
  return agentRows.find(row => row.id === id)!;
}

/** Steps 2-4: the rows today's ACP lesson registry runs. Step 5 switches this to the conformance record. */
export function offeredAgents(): readonly AgentRow[] {
  return agentRows.filter(row => row.acp);
}

export const acpAgentIds = ["claude", "codex", "cursor", "grok", "opencode", "fx"] as const;
export type AcpAgentId = (typeof acpAgentIds)[number];

export function isAcpAgentId(value: unknown): value is AcpAgentId {
  return typeof value === "string" && (acpAgentIds as readonly string[]).includes(value);
}
