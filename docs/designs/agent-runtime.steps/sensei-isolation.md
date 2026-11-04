<!-- Research for D34, collected 2026-11-04 by probing the CLIs installed on the author's machine. Inputs to the step 4 and step 5 plans. -->
# Sensei isolation per agent (for steps 4/5 registry rows)

## Grok Build 1.0.70 (not logged in on this machine; ACP session/new -> Authentication required)
- env: HOME=<empty dir>, GROK_HOME=~/.grok (keeps auth.json), GROK_MEMORY=0, GROK_{CLAUDE,CURSOR}_{MCPS,SKILLS,RULES,AGENTS,HOOKS}_ENABLED=false
- args: --rules <instr> --tools search_tool,use_tool --disallowed-tools run_terminal_cmd,write,search_replace,web_search,web_fetch,Agent --disable-web-search --no-subagents --permission-mode default agent stdio; deny permission requests client-side
- session cwd: empty dir outside any repo
- evidence: servers_updated lists [rea] from ~/.claude.json today; [] isolated. grok inspect isolated: no project instructions/plugins/MCP/hooks; 22 bundled skills remain
- cannot disable: 22 bundled skills, search_tool/use_tool, anything user adds under ~/.grok, project files under cwd
- unverified (needs login): empty built-in set, ACP mcpServers attach, GROK_AUTH_PATH
- probes: scratchpad/isolation-grok/

## FX 0.0.16
- fx acp: only --model/--ultrafast/--log-file; no config-dir env, no tool allow-list; modes ask/auto/full-access
- user config only via HOME override (all config under ~/.fx; skills from ~/.agents, ~/.claude, ~/.fx, ~/.codex/skills + workspace .agents/.claude/.fx/skills)
- ACP: ask mode + client reject_once blocks write_file (probed); write/shell/web_fetch/subagent/install_skill remain registered
- auth copy into fake HOME risks refresh-token rotation logging the user out: don't copy auth
- Eve path: @ai-sdk/harness-fx runs in-process libfx and filters built-ins (src/fx-session.ts:518-531) -> the design's step 4/5 route removes write/shell tools. Use that; only remaining issue is user skills/config dirs under HOME.

## Codex 0.165.0 / codex-acp 2.2.2 (probed, logged in)
- CODEX_HOME=<tmp> with auth.json symlink -> ~/.codex/auth.json and config.toml: web_search="disabled"; [skills] include_instructions=false; [skills.bundled] enabled=false; [features] apps, plugins, remote_plugin, shell_tool, unified_exec, image_generation, view_image, multi_agent, goals, tool_suggest, skill_search, browser_use, computer_use, in_app_browser, memories, sleep_tool = false
- HOME=<tmp> also needed (else ~/.agents/skills load); CODEX_PATH must be the real native binary (vite-plus shim exits silently with changed HOME)
- INITIAL_AGENT_MODE=read-only (overrides sandbox/approval in CODEX_CONFIG per turn)
- result: 0 skills, no MCP/apps/plugins; login + 8 models OK; ACP MCP server loads
- remains: exec/wait (code mode, needed), collaboration.*, apply_patch (catalog), request_user_input, clock, MCP resource tools. Client must approve only `_meta.is_mcp_tool_approval` permission requests, reject the rest
- unverified: token refresh through symlink; concurrent refresh race (separate auth.lock); AGENTS.md in cwd (project_doc_max_bytes=0 untested); CODEX_CONFIG thread-level keys; subagent inheritance
- Eve path: @ai-sdk/harness-codex filters built-ins (activeTools) per design

## Cursor CLI 2026.07.09 (not logged in on this machine)
- BUG: resolveAgentExecutable("cursor") looks up `agent`; ~/.grok/bin is first on PATH and ~/.grok/bin/agent -> Grok 1.0.46, so "Cursor" may start Grok. Prefer `cursor-agent` (~/.local/bin/cursor-agent). Check in step 2 registry.
- proposal: `cursor-agent --trust acp` without --yolo; session/set_mode ask; client approves only dojofoo MCP tools, rejects rest (Write/Shell/Delete/Mcp go to request_permission without force)
- HOME override hides user mcp.json/skills/plugins/AGENTS.md but breaks keychain auth -> needs CURSOR_API_KEY/CURSOR_AUTH_TOKEN
- cannot: session mcpServers add to (not replace) user mcp.json; read built-ins never ask; account-side user/team rules
- unverified: hidden --exclude-workspace-context/--allowed-tools/--exclude-tools ignored by ACP?; ask mode and web tools

## Claude Code (claude-agent-acp 0.99.1, from my own reading)
- adapter defaults settingSources ["user","project","local"], all built-ins; client override via newSession/loadSession `_meta.claudeCode.options` (tools, settingSources, disallowedTools, extraArgs, mcpServers, strictMcpConfig?)
- judges use: claude -p --tools "" --strict-mcp-config --setting-sources "" (packages/authoring/src/evaluation/judges.ts)
- unverified: whether strict MCP config drops claude.ai connectors

## OpenCode v2.0.28 (probed with a recording fake provider plus 2 real turns)
- `opencode acp` starts a private `serve --stdio` child; env on the acp process applies
- env: OPENCODE_CONFIG_DIR=<empty dir> (global config, AGENTS.md, skills, plugins), OPENCODE_DISABLE_PROJECT_CONFIG=1 (project opencode.json, .opencode/.claude/.agents, AGENTS.md walk), OPENCODE_TEST_HOME=<empty dir> (home skills; undocumented test hook; alternative HOME=<dir> + XDG_DATA_HOME=~/.local/share untested)
- auth in ~/.local/share/opencode stays usable
- OPENCODE_CONFIG_CONTENT: default_agent "dojofoo"; an explicit model; dojofoo MCP declared under `mcp.servers.<name>` with `codemode: false` (the old `mcp.<name>` form drops codemode); agent dojofoo: mode primary, permission {"*":"deny","dojofoo_*":"allow"}
- ACP mcpServers always sit behind the `execute` tool (model-written JS with unrestricted fetch); so declare dojofoo's server in config instead
- evidence: today 12 built-in tools + 44 user skills + /Users/tom/AGENTS.md, 35k-char prompt; isolated: tools ['dojofoo_lesson_ping'], 815-char prompt
- cannot: admin-managed config, remote org config, built-in modes/commands selectable via `mode`, sessions stored in ~/.local/share/opencode
- probes: scratchpad/isolation-opencode/

# On the Eve + @ai-sdk/harness-* path (step 4), read from adapter sources 2026-11-04

Applies to all: the local sandbox merges options.environment into every spawn (local-sandbox.ts:63,96); adapters are cached once per agent with only {port:0} (adapters.ts:16-23,37-41), so persona-specific adapter settings need their own factory or cache key.

- Claude Code (adapter 1.0.171/1.0.174, CLI 2.1.290): the bridge never passes settingSources/extraArgs; the SDK loads all sources by default. Use sandbox env CLAUDE_CODE_SAFE_MODE=1 (disables CLAUDE.md, skills, plugins, hooks, auto-discovered MCP, claude.ai MCP, agents; keeps auth/keychain; unverified whether settings.json values still load) and ENABLE_CLAUDEAI_MCP_SERVERS=false, plus strictMcpConfig:true. Avoid CLAUDE_CODE_SIMPLE (drops OAuth) and CLAUDE_CONFIG_DIR (drops keychain login unless CLAUDE_SECURESTORAGE_CONFIG_DIR=""). Filter: mode allow -> tools:[native] + disallowedTools; --tools limits built-ins only. allow-reads: harness-tools allowed, active non-edit non-bash allowed, everything else -> tool-approval-request (host must deny). Unknown native/user MCP tools default to edit.
- Codex (adapter 1.0.172, CLI 0.160.1): launch fixed (danger-full-access, approval never); no env/args settings; codexConfig goes to thread/start (features.apps=false, features.plugins=false, project_doc_max_bytes=0 unverified). Sandbox env CODEX_HOME=<empty> (config, MCP, AGENTS.md, plugins) + HOME=<fixed persona dir> (~/.agents/skills); auth is forwarded from the host. Adapter writes skills into $HOME/.agents/skills. Filter: shell_tool/view_image features, apply_patch via PreToolUse hook; no file-read tool. Only allow-all permission mode is accepted (no approvals).
- Grok Build (adapter 1.0.109, acp 1.0.110, CLI 1.0.49): launch fixed `grok agent stdio`; top-level flags unavailable. Env: GROK_HOME=<empty>, GROK_{CLAUDE,CURSOR}_{AGENTS,RULES,SKILLS,MCPS,HOOKS}_ENABLED=false, GROK_MANAGED_MCPS_ENABLED=false; codex compat needs HOME redirect or GROK_HOME config.toml. Protocol row's GROK_HOME=~/.grok keeps the real config (fix). Adapter appends to $HOME/.grok/AGENTS.md. No builtin filtering (ACP throws) -> deny mode; allow-reads auto-approves read/search/think/fetch kinds, the rest -> host approval. use_tool/search_tool must stay (host tools relay).
- OpenCode (adapter 1.0.173, CLI 1.18.34): OPENCODE_CONFIG_CONTENT merges on top of global/project/managed. Sandbox env XDG_CONFIG_HOME=<empty>, OPENCODE_DISABLE_PROJECT_CONFIG=1, OPENCODE_DISABLE_CLAUDE_CODE=1, OPENCODE_DISABLE_EXTERNAL_SKILLS=1, OPENCODE_PURE=1, OPENCODE_TEST_MANAGED_CONFIG_DIR=<empty>, unset OPENCODE_CONFIG/OPENCODE_CONFIG_DIR. Cannot: $HOME/.opencode scan, bridge-added $HOME/.agents/skills, built-in customize-opencode skill (filter out `skill`). Filter via permission deny; websearch via OPENCODE_PERMISSION. Host tools exposed directly as harness-tools_<name>. Bridge treats webfetch readonly: filter it out.
- FX (adapter 1.0.86, libfx 0.0.14): loads no user config (offline probe verified); MCP only from settings.mcpServers; protocol row's HOME override unnecessary. Filter via isHarnessV1BuiltinToolIncluded; allow-reads routes edit/bash to approval.
- Pi (adapter 1.0.173, pi-coding-agent 1.4.0): adapter already disables extensions/skills/context files; leak is dojofoo's agentDir (adapters.ts:35) loading the user's models.json/auth.json/settings.json (settings.packages may install) -> drop agentDir, pass providers/credentials, PI_OFFLINE=1. Parked Pi sessions leak (no TTL) -> reattachInProcess:false.
- Core harness 1.0.170: non-allow-all permission modes need supportsBuiltinToolApprovals (rules out Codex); run-prompt auto-denies only filtered-out built-ins, so dojofoo must deny approvals for active built-ins itself; harness-model.ts sets no permissionMode/builtinToolFiltering itself and detaches unfinished turns (parks Pi sessions).
