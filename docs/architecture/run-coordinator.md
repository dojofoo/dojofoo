# Run coordination

Scope: this describes the existing **ACP learning path**, not the Eve-backed
authoring runtime. See [runtime consolidation](./agent-runtime-consolidation.md)
for their different ownership boundaries and the
[dependency ledger](./dependency-upgrade-ledger.md) for verified versions.

The current learning transport uses ACP SDK 1.9.0 and Codex ACP 2.2.2. Form
questions register through `createElicitation`; URL elicitation is not advertised.
Codex explicitly opts into `terminal_output_delta`, so command chunks still
produce the structured lesson-check report. Session loading still uses the
existing `loadSession` replay path. New resume/steering capabilities are not
claimed as product features merely because the SDK now exposes them.

A Dojofoo run is the application boundary. Browser connections, ACP harness threads,
and local tool processes are replaceable attachments to that run; none of them owns
the run or becomes a second session model.

The server coordinates three protocol edges:

- ACP owns harness turns, transcript projection, cancellation, and elicitation when
  the harness supports it.
- MCP exposes lesson tools to every harness.
- HTTP/WebSocket deliver local run commands and browser events. A future CLI-only
  effect transport may use a Unix-domain socket without changing the coordinator.

Native harness thread IDs remain native. Dojofoo persists only their binding to the
run. Local tool processes receive an ephemeral capability, not a run or thread ID.
The capability is valid only while its harness runtime is attached and lets the
coordinator route a command to that run.

The server injects a compact, private lesson context into every ACP turn. It contains
the start/resume phase, course and lesson identity, objective, progress state, learner
file, and latest check. This bootstrap survives harness compaction because it is owned
by the server, not chat history. Agents can recover fresh context with `dojo_context`
(`dojo.context`) and can ask an authored structured question with `dojo_ui_ask`
(`dojo.ui.ask`). Neither operation requires a session ID.
Authored `<Present>` content uses `dojo_ui_show` (`dojo.ui.show`). The coordinator
validates the fragment against the active lesson before the existing chat renderer
displays it; arbitrary agent-authored content cannot enter that surface.

Structured questions prefer protocol-native elicitation. OpenCode currently rejects
elicitation initiated by an MCP server, so the `dojo_lesson_complete` MCP tool uses the
same coordinator as a compatibility adapter: it blocks while the existing ACP chat
question component collects an answer, then returns that answer as the MCP tool
result. This compatibility is isolated from browser routing and persistent state.

Dojofoo does not persist browser connections, pending questions, capabilities, or
transcript copies. A daemon restart discards unfinished interactions and reconstructs
the run from course progress plus the harness-thread binding.
