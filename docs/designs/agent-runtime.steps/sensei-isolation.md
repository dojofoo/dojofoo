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
