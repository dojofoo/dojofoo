# Cursor spike (step 3)

*   **For:** open risk 1 in `docs/designs/agent-runtime.md` (does an ACP agent ask before it writes under `allow-reads`?), Cursor's part. Grok's part is step 4's tier-A case `sensei.read-only.adversarial-native-calls`.
*   **Date:** 2026-11-04, on the step 3 machine (macOS, darwin-arm64).

## Facts

*   `cursor-agent` 2026.07.09-a3815c0. `cursor-agent status` reports "Not logged in".
*   The official adapter launches `cursor-agent --disable-auto-update acp` (`@ai-sdk/harness-cursor` `src/cursor-harness.ts:389-390`). That process answers ACP `initialize` with protocol 1, `loadSession: true`, `mcpCapabilities: { http, sse }` and the auth method `cursor_login`. `session/new` then fails with -32000 "Authentication required".
*   `cursor-agent --help` says `--trust` "only works with --print/headless mode".
*   Dojofoo's local binding wraps the installed `cursor-agent` and keeps the user's own login (`packages/agent/src/local-cursor.ts:9-38`). The public `cursor-agent` build cannot be pointed at the loopback model, so tier A cannot drive it (tested in "Tier A through the loopback model?" below).

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

## Tier A through the loopback model? (step 8 follow-up)

*   **For:** whether Cursor can join tier A as Grok Build did, by pointing its CLI at the loopback model. The earlier claim that it cannot had not been tested.
*   **Date:** 2026-11-04, macOS darwin-arm64, `@ai-sdk/harness-cursor` 1.0.85, installed `cursor-agent` 2026.07.09-a3815c0, not logged in. Every probe ran with a scratch `HOME` and no login; no request reached a model.
*   **Ran:**
    1.  Read the adapter (`src/cursor-harness.ts`, `src/cursor-subscription.ts`, `README.md`) and its documentation (ai-sdk.dev/providers/ai-sdk-harnesses/cursor).
    2.  Read `cursor-agent --help`, the structure of `~/.cursor/cli-config.json` (keys only), and the CLI bundle (`~/.local/share/cursor-agent/versions/2026.07.09-a3815c0/index.js`): every environment variable it reads, its hidden options, and the code behind each option that names a URL.
    3.  `cursor-agent --disable-auto-update <flag> -p hi` for each local-agent flag, the same with only the local-agent variables set, and `acp` with each (ACP `initialize`, then `session/new`).
    4.  `cursor-agent -e http://127.0.0.1:<port> --agent-endpoint http://127.0.0.1:<port> --auth-token fixture-only --trust -p "say hi"` (with `AGENT_CLI_CREDENTIAL_STORE=memory`) against a local listener that logs requests, first answering 404, then answering every unary call with an empty `200 application/proto`.
*   **Findings:**
    1.  The adapter has no routing setting. `CursorHarnessSettings` holds `auth`, `credentialForwarding`, `port`, `portEndpoint`, `startupTimeoutMs`, `reconnect`, `mcpServers` and `mintBridgeToken`; its comment says "The adapter cannot change provider routing and warns for explicit routing modes" (`cursor-harness.ts:25-30`). `auth: "direct"` and `"ai-gateway"` only print a warning that the route must be configured in Cursor (`cursor-harness.ts:358-360`, `445-457`). The only forwarded credential is `CURSOR_API_KEY` (`cursor-harness.ts:403`), and credential brokering matches `api2.cursor.sh` or `ai-gateway.vercel.sh/cursor/v1` (`cursor-harness.ts:404-441`). The adapter launches `agent --disable-auto-update acp` and maps the model to the ACP session config option `model` (`cursor-harness.ts:394-399`), so a model is one of the account's Cursor models.
    2.  The CLI's documented surface has no endpoint setting. `--help` lists `--api-key`, `-H/--header`, `--model` ("Model to use (e.g., gpt-5, sonnet-4-thinking)") and `--list-models`; `cli-config.json` has editor, display, permissions, approval, sandbox, network (`useHttp1ForAgent`) and attribution keys and no model or URL key. The bundle's only BYOK data is the team admin allow-list (`aiserver.v1.ModelAllowlistByok`), which the server returns. Cursor's "Override OpenAI Base URL" is an editor account setting whose requests go through Cursor's servers (Cursor forum, moderator reply in "Local agent mode": "There is currently no way to bypass this step"), so it needs a login and cannot reach `127.0.0.1`.
    3.  The bundle holds a local-agent mode that would fit tier A, but the public build does not enable it. `./src/local-agent-provider-config.ts` (`index.js` byte 2226948) reads `CURSOR_LOCAL_AGENT_BASE_URL` (or `ANTHROPIC_BASE_URL`), `CURSOR_LOCAL_AGENT_API_KEY` (or `ANTHROPIC_AUTH_TOKEN`) and `CURSOR_ENABLE_AUTHLESS`, and the hidden `--base-url` option reads "Provider base URL for agent-cli-local (OpenAI-compatible or Anthropic Messages; for example http://127.0.0.1:11434/v1 …)" (byte 1898491). All of them are gated on `localAgentRuntime`, which only a separate `agent-cli-local` build supplies: the entry `./src/main.tsx` (byte 2231423) calls the CLI's setup with no arguments, so `localAgentRuntime` is `undefined` (`function de`, byte 1894933). Probe 3 confirms it: `--base-url` prints "Error: --base-url can only be used with agent-cli-local", `--authless` prints "--authless can only be used with agent-cli-local" (exit 2), and `--local-agent-api-key` and `--enable-bedrock` fail the same way; with only `CURSOR_ENABLE_AUTHLESS=1`, `CURSOR_LOCAL_AGENT_BASE_URL`, `CURSOR_LOCAL_AGENT_API_KEY` and `CURSOR_AGENT_CLI_LOCAL_MODE=true` set, the CLI ignores them and stops at "Authentication required". Even in a local build, the hidden `acp` command (byte 1940257), which the adapter runs, passes no `localAgentRuntime` to `runAcp`; the chat commands do. Over ACP, `cursor-agent --disable-auto-update --base-url http://127.0.0.1:1/v1 acp` accepts the flag silently, and so does `acp` with the local-agent variables; both answer `initialize` and then fail `session/new` with -32000 "Authentication required".
    4.  The backend endpoint can be moved, but it speaks Cursor's private protocol, not a model API. `-e/--endpoint`, `--agent-endpoint` and `CURSOR_API_ENDPOINT` (`./src/utils/api-endpoint.ts`, byte 2320212) are honoured, and `--auth-token` stands in for the login: probe 4 sent Connect-RPC `application/proto` calls to the listener (`aiserver.v1.DashboardService/GetMe`, `GetUserPrivacyMode`, `ServerConfigService/GetServerConfig`, `AiService/AvailableModels`, `GetUsableModels`, `GetDefaultModelForCli` and others) and, with empty answers, stopped at "Error: No model found. Please check your model settings." The agent loop runs on that server: `agent.v1.AgentService` (`Run`, `RunSSE`, `RunPoll`) streams `AgentServerMessage`s (`interaction_update`, `exec_server_message`, `conversation_checkpoint_update`, `kv_server_message` and others) that tell the CLI what to show and which tool to run. The bundle defines 856 `agent.v1` message types.
    5.  Unverified: whether a newer public CLI enables local-agent mode for `acp`. The current install script names 2026.10.22-27dcf5f; downloading it to inspect was refused by this session's permission rules. A third-party release tracker reports `CURSOR_LOCAL_AGENT_HEADERS` in 2026.08.11-e8db854 (the version the adapter's tool table was captured from), which shows the mode is still being built, not that it ships.
*   **Decisions:**
    1.  **Cursor stays out of tier A.** No public route takes the installed CLI to an OpenAI-compatible or Messages endpoint (findings 1-3). The registry row keeps `tierA: false`, and no conformance wiring, `conformance:install` entry or CI job is added.
    2.  **Rejected: a fake Cursor backend behind `--endpoint`.** It would reimplement Cursor's undocumented Connect-RPC services, including the server-side agent loop and its streamed tool executions (finding 4), pinned to one CLI version. Tier A would then test that imitation's agent loop rather than Cursor's, and the loopback model would not be in the path.
    3.  **Rejected: the "Override OpenAI Base URL" (BYOK) route.** It is an editor account setting, it needs a Cursor login, and Cursor's servers make the request, so it cannot reach the loopback model (finding 2).
    4.  **Tier B stays Cursor's only path to a record.** The procedure above, with the user's login and consent for usage, is what can decide Cursor's personas today.
    5.  **Recheck when the CLI changes.** If a public `cursor-agent` honours `CURSOR_LOCAL_AGENT_BASE_URL` under `acp` (probe: with a scratch `HOME`, no login, `CURSOR_ENABLE_AUTHLESS=1` and the variable pointing at the loopback, `session/new` succeeds and the first `session/prompt` reaches the loopback), Cursor can join tier A as Grok did: the loopback's Chat Completions or Messages route and a fixture key in the wiring, and a private home that does not need the keychain login.
