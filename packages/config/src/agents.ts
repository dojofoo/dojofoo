/** Agent identity and installation metadata shared by the CLI, API and UI. */
export type AgentId = "claude" | "codex" | "cursor" | "agy" | "grok" | "opencode" | "fx" | "pi";
export type AgentDefinition = {
  id: AgentId;
  name: string;
  short: string;
  command: string;
  install: string;
  docs: string;
  executableEnvironment?: string;
};

export const agentDefinitions: readonly AgentDefinition[] = [
  { id: "claude", name: "Claude Code", short: "Claude", command: "claude", install: "npm install -g @anthropic-ai/claude-code", docs: "docs.anthropic.com/claude-code" },
  { id: "codex", name: "Codex", short: "Codex", command: "codex", install: "npm install -g @openai/codex", docs: "developers.openai.com/codex", executableEnvironment: "CODEX_PATH" },
  { id: "cursor", name: "Cursor", short: "Cursor", command: "agent", install: "curl https://cursor.com/install -fsS | bash", docs: "cursor.com/cli" },
  { id: "agy", name: "Antigravity", short: "Antigravity", command: "agy", install: "", docs: "antigravity.google/docs/cli" },
  { id: "grok", name: "Grok Build", short: "Grok", command: "grok", install: "npm install -g @xai-official/grok", docs: "x.ai/cli" },
  { id: "opencode", name: "OpenCode", short: "OpenCode", command: "opencode", install: "brew install sst/tap/opencode", docs: "opencode.ai", executableEnvironment: "OPENCODE_BIN" },
  { id: "fx", name: "FX", short: "FX", command: "fx", install: "", docs: "dojo.foo/docs" },
  { id: "pi", name: "Pi", short: "Pi", command: "pi", install: "curl -fsSL https://pi.dev/install.sh | sh", docs: "pi.dev" },
];

export type AgentInstallation = AgentDefinition & { found: boolean; executable: string | null };
