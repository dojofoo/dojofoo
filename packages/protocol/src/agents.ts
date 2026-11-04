/** The coding agents dojofoo knows, as data: identity, install metadata and read-only capabilities. */
import { offeredFrom, shippedConformance, type ConformanceRecord } from "./conformance.js";
export const agentIds = ["claude", "codex", "cursor", "agy", "grok", "opencode", "fx", "pi"] as const;
export type AgentId = (typeof agentIds)[number];
/** Adapter ids stay inside the harness (D12). */
export type AdapterId = "claude-code" | "codex" | "cursor" | "fx" | "grok-build" | "opencode" | "pi";
export type PreventionMechanism = "filter" | "deny";
export type ReadOnlyPermissionMode = "allow-all" | "allow-reads";
/** The placeholders an isolation value may name; the harness resolves each from the user's own environment before isolation. */
export const isolationPlaceholders = ["home", "userHome", "userCodexHome", "userGrokHome", "userDataHome"] as const;
export type IsolationPlaceholder = (typeof isolationPlaceholders)[number];
/** How a read-only persona keeps the user's configuration from loading (D34). Values may hold `{placeholder}`s. */
export interface UserConfigIsolation {
  /** Set in the sandbox environment of every spawn. */
  environment: Readonly<Record<string, string>>;
  /** Removed from the sandbox environment. */
  unset?: readonly string[];
  /** Merged into the read-only adapter's settings. */
  adapterSettings?: Readonly<Record<string, unknown>>;
  /** A private home under `$DOJOFOO_HOME/state/read-only-homes/<agent>/`: `links` (path in the home → target) and `files` (path → content).
   *  `scope: "session"` gives every Eve session its own home (Grok writes each session's instructions into its home). */
  home?: { links: Readonly<Record<string, string>>; files?: Readonly<Record<string, string>>; scope?: "agent" | "session" };
  /** Whether tier A can show the isolation (D24). */
  tierA: boolean;
  note: string;
}
export interface ReadOnlyProfile {
  prevention: PreventionMechanism;
  permissionMode: ReadOnlyPermissionMode;
  /** HarnessV1 built-in tool keys allowed for read-only personas (step 4 builds the allow-list from them). */
  builtinTools: readonly string[];
  /** Applied when the CLI starts (step 4). */
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
  /** The command the "Log in" action shows (D33); empty when the agent has none. */
  login: string;
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

const codexConfig = [
  'web_search = "disabled"',
  "project_doc_max_bytes = 0",
  "",
  "[skills]",
  "include_instructions = false",
  "",
  "[skills.bundled]",
  "enabled = false",
  "",
  "[features]",
  ...["apps", "plugins", "remote_plugin", "shell_tool", "unified_exec", "image_generation", "view_image", "multi_agent", "goals",
    "tool_suggest", "skill_search", "browser_use", "computer_use", "in_app_browser", "memories", "sleep_tool"].map(feature => `${feature} = false`),
  "",
].join("\n");
const bootstrap = { ".ai-sdk-harness": "{userHome}/.ai-sdk-harness" } as const;

/** Onboarding shows the rows in this order, and the installed-CLI fallback walks it. */
export const agentRows: readonly AgentRow[] = [
  {
    id: "claude", name: "Claude Code", short: "Claude", command: "claude", install: "npm install -g @anthropic-ai/claude-code", docs: "docs.anthropic.com/claude-code",
    login: "claude, then /login",
    adapterId: "claude-code", acp: true,
    readOnly: {
      // Claude Code 2.1.290 offers no Glob or Grep tool (claude-spike.md, finding 6).
      prevention: "filter", permissionMode: "allow-reads", builtinTools: ["read"],
      userConfig: {
        environment: {
          CLAUDE_CODE_SAFE_MODE: "1", ENABLE_CLAUDEAI_MCP_SERVERS: "false",
          CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_DISABLE_BUNDLED_SKILLS: "1",
        },
        adapterSettings: { strictMcpConfig: true },
        tierA: true,
        note: "The adapter takes no CLI flags or settingSources, so safe mode stands in for --setting-sources \"\"; the login stays in the keychain or ~/.claude/.credentials.json.",
      },
    },
    modelDiscovery: { method: "cli-aliases", aliases: ["fable", "opus", "sonnet"] },
  },
  {
    id: "codex", name: "Codex", short: "Codex", command: "codex", install: "npm install -g @openai/codex", docs: "developers.openai.com/codex", executableEnvironment: "CODEX_PATH",
    login: "codex login",
    adapterId: "codex", acp: true,
    readOnly: {
      // Codex has no read-only file tool (bash, apply_patch, webSearch, view_image), so Codex Sensei reads through context.
      // Its adapter accepts no permission mode but allow-all (no built-in approvals).
      prevention: "filter", permissionMode: "allow-all", builtinTools: [],
      userConfig: {
        environment: { HOME: "{home}", CODEX_HOME: "{home}/.codex" },
        adapterSettings: { webSearch: false, codexConfig: { features: { apps: false, plugins: false } } },
        home: { links: { ...bootstrap, ".codex/auth.json": "{userCodexHome}/auth.json" }, files: { ".codex/config.toml": codexConfig } },
        tierA: true,
        note: "The app-server launch is fixed, so --ignore-user-config cannot be passed; a private CODEX_HOME and HOME move the user config, MCP servers, AGENTS.md, plugins and ~/.agents/skills, and auth.json is linked back.",
      },
    },
    modelDiscovery: { method: "native" },
  },
  {
    id: "cursor", name: "Cursor", short: "Cursor", command: "cursor-agent", install: "curl https://cursor.com/install -fsS | bash", docs: "cursor.com/cli",
    login: "cursor-agent login",
    adapterId: "cursor", acp: true,
    readOnly: {
      prevention: "deny", permissionMode: "allow-reads", builtinTools: ["read", "glob", "grep", "ls"],
      userConfig: {
        environment: {}, tierA: false,
        note: "None: a HOME override breaks Cursor's keychain login, and session MCP servers add to the user's mcp.json rather than replace it. Tier B decides; Cursor is not offered for either persona until then (D1, from step 5).",
      },
    },
    modelDiscovery: { method: "acp-probe" },
  },
  { id: "agy", name: "Antigravity", short: "Antigravity", command: "agy", install: "", docs: "antigravity.google/docs/cli", login: "", acp: false },
  {
    id: "grok", name: "Grok Build", short: "Grok", command: "grok", install: "npm install -g @xai-official/grok", docs: "x.ai/cli",
    login: "grok login",
    adapterId: "grok-build", acp: true,
    readOnly: {
      // Host tools are reached through search_tool and use_tool, which stay.
      prevention: "deny", permissionMode: "allow-reads", builtinTools: ["read_file", "list_dir", "grep"],
      userConfig: {
        environment: {
          HOME: "{home}", GROK_HOME: "{home}/.grok", ...Object.fromEntries(grokConfigSources),
          GROK_MANAGED_MCPS_ENABLED: "false", GROK_MEMORY: "0", GROK_SUBAGENTS: "0", GROK_WEB_FETCH: "0", GROK_DISABLE_AUTOUPDATER: "1",
        },
        home: { links: { ...bootstrap, ".grok/bin": "{userGrokHome}/bin" }, scope: "session" },
        tierA: true,
        note: "One private home per Eve session, because Grok writes each session's instructions into $HOME/.grok/AGENTS.md; its .grok/config.toml holds only the [models] and [model.*] tables of the user's config.toml, so custom models still resolve.",
      },
    },
    modelDiscovery: { method: "acp-probe" },
  },
  {
    id: "opencode", name: "OpenCode", short: "OpenCode", command: "opencode", install: "brew install sst/tap/opencode", docs: "opencode.ai", executableEnvironment: "OPENCODE_BIN",
    login: "opencode auth login",
    adapterId: "opencode", acp: true,
    readOnly: {
      prevention: "filter", permissionMode: "allow-reads", builtinTools: ["read", "glob", "grep"],
      userConfig: {
        environment: {
          HOME: "{home}", XDG_CONFIG_HOME: "{home}/.config", XDG_DATA_HOME: "{userDataHome}",
          OPENCODE_DISABLE_PROJECT_CONFIG: "1", OPENCODE_DISABLE_CLAUDE_CODE: "1", OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
          OPENCODE_PERMISSION: JSON.stringify({ websearch: "deny", webfetch: "deny", skill: "deny" }),
        },
        unset: ["OPENCODE_CONFIG", "OPENCODE_CONFIG_DIR"],
        home: { links: bootstrap },
        tierA: true,
        note: "$HOME/.opencode and $HOME/.agents/skills are always scanned, so only a private HOME hides them; XDG_DATA_HOME keeps the login.",
      },
    },
    modelDiscovery: { method: "native" },
  },
  {
    id: "fx", name: "FX", short: "FX", command: "fx", install: "", docs: "dojo.foo/docs",
    login: "fx login",
    adapterId: "fx", acp: true,
    readOnly: {
      prevention: "filter", permissionMode: "allow-reads", builtinTools: ["read", "grep", "glob", "ls"],
      userConfig: {
        environment: {}, tierA: true,
        note: "None needed: in-process libfx loads MCP servers only from adapter settings and skills only from those passed in; it reads only credentials from the user's home.",
      },
    },
    modelDiscovery: { method: "native" },
  },
  {
    id: "pi", name: "Pi", short: "Pi", command: "pi", install: "curl -fsSL https://pi.dev/install.sh | sh", docs: "pi.dev",
    login: "pi, then /login",
    adapterId: "pi", acp: false,
    readOnly: {
      prevention: "filter", permissionMode: "allow-reads", builtinTools: ["read", "grep", "glob", "ls"],
      userConfig: {
        environment: {}, tierA: true,
        note: "The read-only adapter has no agentDir; it gets the providers of the user's models.json and a read-only credential store over auth.json instead, so settings, packages and resources never load.",
      },
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

/** From step 5, the rows whose latest conformance entry passes both personas (design, "Offered agents"). The default record is
 *  read at call time, so the import cycle with `conformance.ts` resolves before any call. */
export function offeredAgents(record: ConformanceRecord = shippedConformance()): readonly AgentRow[] {
  return offeredFrom(record);
}

export const acpAgentIds = ["claude", "codex", "cursor", "grok", "opencode", "fx"] as const;
export type AcpAgentId = (typeof acpAgentIds)[number];

export function isAcpAgentId(value: unknown): value is AcpAgentId {
  return typeof value === "string" && (acpAgentIds as readonly string[]).includes(value);
}
