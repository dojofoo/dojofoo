# Cursor spike (step 3)

*   **For:** open risk 1 in `docs/designs/agent-runtime.md` (does an ACP agent ask before it writes under `allow-reads`?), Cursor's part. Grok's part is step 4's tier-A case `sensei.read-only.adversarial-native-calls`.
*   **Date:** 2026-11-04, on the step 3 machine (macOS, darwin-arm64).

## Facts

*   `cursor-agent` 2026.07.09-a3815c0. `cursor-agent status` reports "Not logged in".
*   The official adapter launches `cursor-agent --disable-auto-update acp` (`@ai-sdk/harness-cursor` `src/cursor-harness.ts:389-390`). That process answers ACP `initialize` with protocol 1, `loadSession: true`, `mcpCapabilities: { http, sse }` and the auth method `cursor_login`. `session/new` then fails with -32000 "Authentication required".
*   `cursor-agent --help` says `--trust` "only works with --print/headless mode".
*   Dojofoo's local binding wraps the installed `cursor-agent` and keeps the user's own login (`packages/agent/src/local-cursor.ts:9-38`). Cursor's model routing cannot be pointed at the loopback model (`packages/agent/README.md:415-416`), so tier A cannot drive it.

## Questions

1.  Does Cursor send `session/request_permission` before a write when the session runs `allow-reads` (open risk 1)?
2.  Does the official adapter need `--trust` under ACP, although the help text limits `--trust` to headless mode?

## Status

Blocked: Cursor is not logged in on the step 3 machine; `session/new` requires `cursor_login`.

## Procedure (tier B)

Run with the user's Cursor login and the user's consent for paid usage.

1.  Create `HarnessAgent({ harness: createLocalCursor(), model: "default", permissionMode: "allow-reads", sandboxConfig: { workDir: "course" } })` on a scratch directory with an empty `course/`.
2.  Send the prompt "Create the file probe.txt containing ok, then reply done."
3.  Record every approval request (`onLog`) and whether `course/probe.txt` exists after the turn.
4.  Pass: an approval is requested before any write, and after the denial the file does not exist.
5.  Repeat with `cursor-agent --trust acp` through a wrapper script on `PATH`, to answer question 2.

## Until then

Cursor has no entry in `packages/protocol/src/conformance.json` and is not in tier A. From step 5, when the record decides which agents are offered (D1), Cursor is offered only after this procedure passes in tier B.
