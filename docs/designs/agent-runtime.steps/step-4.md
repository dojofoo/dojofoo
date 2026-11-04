# Step 4 plan: persona hosts, sessions, host port, lifecycle, prevention, interactive Sensei

*   **Design:** `docs/designs/agent-runtime.md`, "Implementation Roadmap", Step 4 (Approved 2026-11-03), plus D34 (user, 2026-11-04).
*   **Revised** after the implementation-readiness and codebase-details reviews (2026-11-04), at HEAD `d14c033` (no cited file changed between `510ff3f` and `d14c033`). Every finding is applied below or rejected under "Decisions made in this plan". The orchestrator's answer to the Cursor question is decision 19.
*   **Written against:** branch `eve-1`, HEAD `510ff3f`, worktree `.worktree/mobile`, on 2026-11-04. Steps 0-2 are done; step 3 is done through its commit 6 (`8e42b91`); its commit 7 (the first tier-A record from CI) lands before this step's last commit. Between `8e42b91` and `510ff3f`, `origin/main` was merged (dependency bumps, below), the local sandbox gained `stat`, directory listing and file deletion (`b9b38a9`), and the UI chat client moved to TanStack AI 1.0 (`6ed18e8`). Line numbers were re-checked at `510ff3f`; where a file is likely to move, functions are named instead.
*   **Reader:** the implementer has only this plan and the design. Where the two disagree on a current line number, this plan is right; where they disagree on behaviour, the design is right unless "Decisions made in this plan" says otherwise and why.
*   **Versions at HEAD** (they differ from the design's "Cited versions"): `@ai-sdk/harness` 1.0.170, `harness-claude-code` 1.0.174, `harness-codex` 1.0.172, `harness-cursor` 1.0.85, `harness-fx` 1.0.86, `harness-grok-build` 1.0.109, `harness-opencode` 1.0.173, `harness-pi` 1.0.173, `@tanstack/ai` 1.0.1, `@tanstack/ai-client` 1.0.1. Bootstrapped CLIs are still Claude Code 2.1.290, Codex 0.160.1, OpenCode 1.18.34 and Grok 1.0.49 (step 3 fact 1); a different pin fails `conformance:install` until it is recorded.

## What this step delivers

Interactive courses run Sensei on Eve. To get there the step builds, in the harness (`packages/agent`, `packages/agent-api`): a read-only mode in the harness model with a per-call tool allow-list, per-agent user-config isolation (D34), an approval refusal for read-only personas, a session map with eviction, process-group records and a reaper; a host port (server skeleton, client, idempotency store, fixture server); a lifecycle hook that every persona host loads; and a generalised persona host with a per-start secret. In the agents package (`packages/authoring`): Kyoshi on that host, and a new Sensei Eve agent with its prepared build and its prompt contracts. In the UI server: Sensei hosts, the host-port handlers, the per-session lifecycle module with learner-evidence capture, `POST /sessions/default` for Sensei pages, the model routes, reaping at startup and idle stop. The interactive course page moves onto `AgentChat`, interactive Sensei's ACP code is deleted, and `test:interactive` is rewritten for Eve. Tier A gains the step-4 cases, including D34's isolation case for every agent tier A can drive.

Kata Sensei and evaluation trials stay on ACP and keep full write access until steps 5 and 7 ("Prevention applies to each Sensei path from the step that moves it to Eve"). The guard does not exist yet (step 5), so this step has no guard windows, held check reports, leave rule, switch lock or `interrupted` status.

Gate (design, Step 4): tier A for the cases this step makes pass; the rewritten `test:interactive`; the unchanged ACP `test:lesson`; `test:prepared` for both personas; the default-conversation, record, host-port and lifecycle tests; plus the common checks under "Verification Plan", from a clean `pnpm install --frozen-lockfile`.

## Facts checked for this plan (2026-11-04)

1.  **No adapter loads "nothing" by default, and none takes CLI flags.** Read from the adapter sources at the versions above by a research pass (recorded under "On the Eve + @ai-sdk/harness-* path (step 4)" in `agent-runtime.steps/sensei-isolation.md`) and spot-checked here. The only per-persona channels are adapter settings and the sandbox environment, which `createLocalSandbox` merges into every spawn (`packages/agent/src/local-sandbox.ts`, `createLocalSandbox`, `env` of `spawnProcess`). Adapters are cached per agent with only `{ port: 0 }` (`packages/agent/src/adapters.ts:16-23,37-42`).
2.  **Claude Code.** `@ai-sdk/harness-claude-code` 1.0.174 has `strictMcpConfig` (`src/claude-code-harness.ts:140`), `skillOverrides` (`:128`) and `env`, but no `settingSources` or `extraArgs`. Its bridge never passes `settingSources` to the Agent SDK, whose default is to load the user, project and local sources. The bundled CLI 2.1.290 binary (`claude-code-darwin-arm64/claude`) contains `CLAUDE_CODE_SAFE_MODE`, `ENABLE_CLAUDEAI_MCP_SERVERS`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS` and `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS`, and the help text "Start with all customizations (CLAUDE.md, skills, installed plugins, hooks, MCP servers, custom commands and agents, output styles, workflows, custom themes, keybindings, and more) disabled" (checked with `grep -a` on this machine). So `--setting-sources ""` has an environment equivalent: `CLAUDE_CODE_SAFE_MODE=1`. Whether safe mode still applies `settings.json` permission rules is unverified; the D34 case decides. The step-3 spike found no `Glob` or `Grep` tool in 2.1.290's offer (`claude-spike.md`, finding 6), so the row's read-only built-ins become `["read"]`.
3.  **Codex.** Settings include `codexConfig` (`src/codex-harness.ts:110`) and `webSearch` (`:124`); the launch is fixed (`codex … app-server --stdio`, environment from the sandbox), so `--ignore-user-config` (a `codex exec` flag) cannot be used. `CODEX_HOME` and `HOME` from the sandbox environment move the user config, MCP servers, `AGENTS.md`, plugins and `~/.agents/skills`. The ACP probe in `sensei-isolation.md` showed a private `CODEX_HOME` with `auth.json` linked and a `config.toml` that turns off skills, apps, plugins and the other features keeps the login and loads nothing.
4.  **Grok Build.** No setting adds CLI arguments; the launch is `grok agent stdio`. The ACP adapter throws when `builtinToolFiltering` is set (`acp-v1-harness.ts`, per the research pass), which is why the design gives Grok and Cursor the `deny` mechanism. Login is read on the host and passed to the child as `XAI_API_KEY`, so a private `GROK_HOME` may keep the login (unverified; tier A uses an API key). The adapter writes the session's system instructions to `.grok/AGENTS.md` (`instructionMapping`, `src/grok-build-harness.ts:370-373`), so two sessions sharing one home overwrite each other's instructions. Its `use_tool` built-in, through which host tools are called, declares no `toolUseKind` (`:247-252`), so under `allow-reads` a host-tool call may arrive as an approval request (unverified which). Tier A's loopback models live in the case `GROK_HOME/config.toml` (`packages/authoring/src/eve/conformance.fixture.ts:111-120`).
5.  **OpenCode.** The SDK starts `opencode serve` with `{ ...process.env, OPENCODE_CONFIG_CONTENT }`, so the sandbox environment reaches it. `$HOME/.opencode` and `$HOME/.agents/skills` are always scanned, so only a private `HOME` hides them. Auth lives under `XDG_DATA_HOME`. Host tools are exposed directly as `harness-tools_<name>`.
6.  **FX** (`libfx` in-process) loads MCP servers only from adapter settings and skills only from the HarnessV1 skills passed in; it reads only credentials from the host home. Nothing needs turning off.
7.  **Pi.** `@ai-sdk/harness-pi` hard-codes `noExtensions`, `noSkills`, `noContextFiles` and friends; the only user-config path is dojofoo's own `agentDir` (`adapters.ts:33-36`). Its settings include `reattachInProcess` (`src/pi-harness.ts:53`), `providers` and `credentials` (same interface). A detached Pi session is parked in a module-level map. A resume with the same id retires it (`pi-session.ts:456-474`), but reattaching in process needs reference-equal settings, so with a new `HarnessAgent` per call it is not reused, and one whose turn is cancelled and never resumed stays in memory: this is the design's "one extra cleanup step" for Pi. `PI_OFFLINE` is read by `pi-coding-agent` from its own process environment (`dist/main.js`, `dist/core/package-manager.js`, `dist/core/model-runtime.js`), never from a sandbox environment, so it cannot be set per persona for the in-process adapter. Without `agentDir`, Pi does not read the user's `models.json`, while `piModels` (`packages/authoring/src/eve/models.ts:122-136`) still lists its custom providers' models.
8.  **`HarnessAgent`** takes `activeTools`/`inactiveTools` and `permissionMode` (`@ai-sdk/harness` `src/agent/harness-agent.ts:263-290`). Its auto-denial covers only approval requests for built-ins that the filter made inactive; approvals for active built-ins and unknown tools reach the consumer (Eve). Host tools outside `activeTools` are denied. There is no eviction by id; a session ends through `detach()`, `stop()` or `destroy()`. A `permissionMode` other than `allow-all` needs `supportsBuiltinToolApprovals`, which Codex does not set (hence `allow-all` for Codex in the registry).
9.  **`packages/agent/src/harness-model.ts`** sets neither `permissionMode` nor a tool filter today; both would come through the `runtime` spread (`:111-112`). It creates a new `HarnessAgent` and session per call (`:111,141`), re-emits approval requests (`:235-239`), and at the end of a turn detaches an unfinished session or stops a finished one (`:282`). Its callers outside itself (`git grep experimental_createHarnessModel` at HEAD): Kyoshi's `packages/authoring/src/eve/agent.ts:32-37`; in `packages/agent/experiments/model-provider/`, `provider.test.mjs` (imported as `createHarnessModel` at `:10`, 45 calls from `:121`, run by `run.mjs:99`), `pi.test.mjs:62` (`run.mjs:101`), `pi-local-continuation.test.mjs:27` (the `test` script, `packages/agent/package.json:591`), `recovery-worker.mjs:72`, `opencode-recovery-worker.mjs:10`, `opencode-startup.test.mjs:55,83`, `authored-agent.fixture.ts:6`, `host-agent.fixture.ts:123`, `cli-host.test.mjs:74`, `native-host.test.mjs:52`, and the type checks `consumer-types.ts` and `adapter-types.ts`; and the examples in `packages/agent/README.md:200,223` and `experiments/model-provider/README.md:244`. `experimental_compact` builds its own `HarnessAgent({ ...runtime })` (`:67-68`).
10. **Eve.** `startProductionServer` spawns the built server as a child with `{ ...process.env, HOST, PORT }` and no other environment option (`dist/eve/dist/src/internal/nitro/host/start-production-server.js`), so per-host settings must travel through the app folder's `runtime.json`, as Kyoshi's do. Hooks are files under `agent/hooks/`, named by path (Eve docs/guides/hooks.md, `packages/agent/dist/eve/docs/guides/hooks.md`), and `/eve/v1/info` lists them as `hooks: [{ slug, eventNames, … }]` (`dist/eve/dist/src/client/agent-info-types.d.ts:123-126,251`). `agent/instructions/` may hold several `.ts` files, each `defineInstructions` or `defineDynamic` (`packages/agent/dist/eve/docs/instructions.mdx:42-48`). `eveChannel({ onMessage })` can return `clientContext` for one turn, which reaches every model call of that turn and is not kept in history; `ctx.eve.sessionId` is set for follow-ups (`dist/eve/dist/src/eve-channel/types.d.ts:43-84`). A send returns `202 { ok, sessionId, deliveryId }`. Interaction kinds are `approval`, `question`, `sign-in` and `budget`. `transcriptOf(events)` returns `{ role, text }` messages of the current conversation (`dist/eve/dist/src/client/transcript.d.ts`).
11. **The loopback model** already has `selectResponsesTool`, `selectChatTool` and `selectMessagesTool` (`packages/agent/experiments/model-provider/loopback-openai.mjs:15`), so a script can choose a tool for one prompt only.
12. **CI** runs `test:interactive` and `test:lesson` after a global `@opencode/cli@2.0.28` install (`.github/workflows/verify.yml:68-73`) but does not run `test:prepared` at all. Both jobs have `timeout-minutes: 40` (`:14,89`).
13. **Eve's TypeScript client takes no idempotency key.** `SendTurnOptions` (`packages/agent/dist/eve/dist/src/client/types.d.ts:96-132`) has none; only the JSON body of `POST /eve/v1/session/{id}` accepts `idempotencyKey` (Eve docs/channels/eve.mdx:58).
14. **The conformance record is not shipped.** `@dojofoo/protocol` builds only `dist` and exports only `.`; `conformance.json` stays in `src` (`packages/protocol/package.json`).
15. **The local sandbox already maps live detached sandboxes** (`packages/agent/src/local-harness-sandbox.ts:8`, `live`), and `killTree` (`local-sandbox.ts:27-47`) kills a group and every group its processes started, which OpenCode needs because its bridge runs its server in a group of its own.

## Per-agent isolation and prevention (D34, D18)

D34 asks for the per-agent findings here. Each row below becomes the registry's read-only profile (commit 1) and is applied by the harness (commit 2). "Private home" is `$DOJOFOO_HOME/state/read-only-homes/<agent>/`, one per agent, shared by every read-only persona on that agent, except Grok's, which is one per Eve session (`read-only-homes/grok/sessions/<eveSessionId>/`, removed by the lifecycle hook at `session.ended`) because Grok writes each session's instructions into its home (fact 4); dojofoo creates it, links the named paths back to the user's real ones, and writes the named files. Linking `.ai-sdk-harness` keeps the adapter's bootstrap (fact 1 of step 3: a symlinked bootstrap is accepted). Values are resolved from the user's own environment before isolation, so tier A, whose "user" is the case `HOME`, gets the fixture's homes.

| agent | prevention | permission | read-only built-ins | user-config isolation (sandbox environment unless noted) | tier A can show it |
| --- | --- | --- | --- | --- | --- |
| claude | `filter` (adapter `tools`) | `allow-reads` | `read` | `CLAUDE_CODE_SAFE_MODE=1`, `ENABLE_CLAUDEAI_MCP_SERVERS=false`, `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`, `CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1`; adapter `strictMcpConfig: true`. No private home: the login lives in the keychain or `~/.claude/.credentials.json`. Safe mode also turns off "MCP servers", which may include the adapter's own `harness-tools` server; commit 5's check decides, and the fallback is the same row without `CLAUDE_CODE_SAFE_MODE`, plus `skillOverrides` that turn off every user skill (decision 1). | yes |
| codex | `filter` (shell, `view_image` and `apply_patch` off) | `allow-all` | none | private home with `.ai-sdk-harness` and `.codex/auth.json` linked; `HOME={home}`, `CODEX_HOME={home}/.codex`; dojofoo writes `{home}/.codex/config.toml` with the keys the ACP probe verified (`web_search = "disabled"`, `[skills] include_instructions = false`, `[skills.bundled] enabled = false`, `[features]` `apps`, `plugins`, `remote_plugin`, `shell_tool`, `unified_exec`, `image_generation`, `view_image`, `multi_agent`, `goals`, `tool_suggest`, `skill_search`, `browser_use`, `computer_use`, `in_app_browser`, `memories`, `sleep_tool` all `false`, `project_doc_max_bytes = 0`); adapter `webSearch: false`, `codexConfig: { features: { apps: false, plugins: false } }` | yes |
| cursor | `deny` (wrapper) | `allow-reads` | `read`, `glob`, `grep`, `ls` | none: a `HOME` override breaks Cursor's keychain login, and session MCP servers add to the user's `mcp.json` rather than replace it | no (tier B); interactive Sensei refuses Cursor until a passing Sensei record exists (decision 19) |
| grok | `deny` (wrapper) | `allow-reads` | `read_file`, `list_dir`, `grep` (host tools also need `search_tool` and `use_tool`) | private home per Eve session with `.ai-sdk-harness` and `.grok/bin` linked (`.grok/bin` to `{userGrokHome}/bin`, so Grok runs the binary it runs today); dojofoo writes `{home}/.grok/config.toml` with only the `[models]` and `[model.*]` tables copied from `{userGrokHome}/config.toml` (parsed with `smol-toml`; every other table, MCP servers included, is left out), so the user's custom models, which the model menu lists, still resolve, and tier A's loopback models too; `HOME={home}`, `GROK_HOME={home}/.grok`, the ten `GROK_{CLAUDE,CURSOR}_{MCPS,SKILLS,RULES,AGENTS,HOOKS}_ENABLED=false`, `GROK_MANAGED_MCPS_ENABLED=false`, `GROK_MEMORY=0`, `GROK_SUBAGENTS=0`, `GROK_WEB_FETCH=0`, `GROK_DISABLE_AUTOUPDATER=1` | yes |
| opencode | `filter` (inactive tools become `permission[name] = "deny"`) | `allow-reads` | `read`, `glob`, `grep` | private home with `.ai-sdk-harness` linked; `HOME={home}`, `XDG_CONFIG_HOME={home}/.config`, `XDG_DATA_HOME={userDataHome}` (keeps the login), `OPENCODE_DISABLE_PROJECT_CONFIG=1`, `OPENCODE_DISABLE_CLAUDE_CODE=1`, `OPENCODE_DISABLE_EXTERNAL_SKILLS=1`, `OPENCODE_PERMISSION={"websearch":"deny","webfetch":"deny","skill":"deny"}`; `OPENCODE_CONFIG` and `OPENCODE_CONFIG_DIR` removed | yes |
| fx | `filter` | `allow-reads` | `read`, `grep`, `glob`, `ls` | none needed (fact 6) | yes |
| pi | `filter` | `allow-reads` | `read`, `grep`, `glob`, `ls` | the read-only adapter has no `agentDir`; instead dojofoo passes adapter `providers` (the `providers` object of the user's `models.json` in `PI_CODING_AGENT_DIR` or `~/.pi/agent`) and `credentials` (a read-only store over that folder's `auth.json`), so the user's providers and login survive while settings, packages and resources do not; adapter `reattachInProcess: false` (both personas, decision 9). No `PI_OFFLINE` (fact 7). Pi is not offered before step 5; if `credentials` cannot be mapped onto `auth.json` at 1.0.173, step 4's read-only Pi runs only in tier A (fixture `auth`) and the step 5 plan settles the login. | yes |

Placeholders: `{home}` the private home; `{userHome}` the user's `HOME`; `{userCodexHome}` `CODEX_HOME` or `{userHome}/.codex`; `{userGrokHome}` `GROK_HOME` or `{userHome}/.grok`; `{userDataHome}` `XDG_DATA_HOME` or `{userHome}/.local/share`. A link whose target does not exist is skipped (tier-A Codex has no `auth.json`; it authenticates by API key).

What cannot be removed, per agent, and what refuses it (D34's "its permission request is refused"):

*   Built-ins that stay registered (Grok's 22 bundled skills, FX's write tools, Codex's `exec` and catalog tools, OpenCode's `customize-opencode` skill) are outside the allow-list. `HarnessAgent` auto-denies approval requests for inactive built-ins (fact 8). An approval that reaches the harness model in `read-only` mode is answered by the model itself, never shown as a card: it is approved when the call it gates targets one of this call's Eve tool names (Grok's `use_tool` with `tool_name` ending in that name; a host tool's own name for the others), so host-tool turns keep working (fact 4); any other approval ends the turn with `PreventionError` and a typed record (commit 2).
*   For Cursor nothing in this step can be shown without a login; tier B decides, and until then interactive Sensei refuses Cursor (decision 19).

**One name mapping.** The registry lists HarnessV1 keys (`read`, `read_file`), but streams and the loopback report native names (`Read`, `read_file`, `mcp__harness-tools__dojo_context`, `harness-tools_dojo_context`, `use_tool`). `packages/agent/src/read-only.ts` exports `readOnlyToolNames(agent, eveToolNames): { keys: string[]; native: string[] }`: `keys` feed `activeTools`; `native` are the read-only built-ins' native names (taken from the adapter's `builtinTools[key]` metadata, or a per-agent table where the adapter has none), the host tools under the agent's prefix (Claude `mcp__harness-tools__`, OpenCode `harness-tools_`, FX through `capability_search`, Grok through `search_tool` and `use_tool`, the rest bare). The prevention records, the approval rule above and tier A's `sensei.read-only.tool-list` all compare against `native`.

## Session API interface (written before implementation, as the step's constraint asks)

```ts
// packages/agent-api/src/runtime.ts
export type LifecycleStatus = "idle" | "working" | "paused" | "interrupted";   // "interrupted" is written from step 5
export interface SessionLifecycle {
  status: LifecycleStatus;
  /** The turn the last turn.paused named; cleared at turn.settled */
  turnId?: string;
  /** Set while the begin turn has not settled; resent with the same key on the next open (D29) */
  beginPending?: { idempotencyKey: string; sentAt: string };
  /** The harness reported a failed resume (resume.failed); the record is unusable once that turn settles */
  resumeFailedAt?: string;
  updatedAt: string;
}
export interface SessionRecord {
  id: string; agent: string; persona: Persona; createdAt: string;
  courseId?: string; lessonId?: string;
  model?: string;
  /** Raised by every model change; a missing value reads as 0 */
  revision: number;
  endedAt?: string;
  replacedBy?: string;
  lifecycle?: SessionLifecycle;
}
export interface DefaultSessionRequest {
  course: string;
  /** Kata lessons only (step 5); an interactive course has no lesson */
  lesson?: string;
  /** From the URL or a history pick: honoured only if it belongs to the page key, the workspace and the selected agent, and is usable */
  session?: string;
  /** Skip the lookup and create a new conversation */
  new?: true;
  /** With `new`: the session this one replaces. `replacedBy` is recorded on it, the new one is seeded from learner evidence (Sensei),
   *  and a second request with the same `from` returns the same replacement instead of making another (D28). */
  from?: string;
}
export interface DefaultSessionResponse {
  session: SessionRecord;
  /** The browser must put this session in the URL (or drop the one it sent) */
  rewrite: boolean;
  /** "picked-unavailable": the requested session could not be continued and the default opened instead */
  notice?: "picked-unavailable";
}
export interface SessionPatch { model: string }
export interface ModelChoice { id: string; name: string; efforts: string[]; defaultEffort?: string }   // from @dojofoo/protocol
export type EveDelivery = { kind: "message"; text: string; idempotencyKey?: string } | { kind: "answer"; idempotencyKey?: string };
export interface AgentRuntime {
  agents(workspaceId: string): Promise<Agent[]>;
  start(workspaceId: string, agentId: string): Promise<Agent>;
  stop(workspaceId: string, agentId: string): Promise<Agent>;
  select(workspaceId: string, agentId: string): Promise<Agent>;
  connect(workspaceId: string, target: { agent: string; persona: Persona }): Promise<AgentEndpoint>;
  persona(workspaceId: string): Promise<Persona>;
  /** The coding agent's models (D7). 404 agent_not_found. */
  models(workspaceId: string, agentId: string): Promise<ModelChoice[]>;
  sessions: {
    list(workspaceId: string): Promise<SessionRecord[]>;
    get(workspaceId: string, sessionId: string): Promise<SessionRecord | undefined>;
    save(workspaceId: string, session: SessionRecord): Promise<void>;
    /** One serialised read-modify-write of one record (the store's write queue); 404 session_not_found */
    update(workspaceId: string, sessionId: string, change: (record: SessionRecord) => SessionRecord): Promise<SessionRecord>;
    /** POST /sessions/default (D29). 400 invalid_request for a draft workspace until step 6. */
    openDefault(workspaceId: string, request: DefaultSessionRequest): Promise<DefaultSessionResponse>;
    /** PATCH /sessions/{id}: writes `model`, raises `revision`, and saves the model as the workspace's last for that agent (D26) */
    patch(workspaceId: string, sessionId: string, patch: SessionPatch): Promise<SessionRecord>;
  };
  /** Called by the session API before it forwards a message or answer, and after Eve answers it */
  deliveries?: {
    before(workspaceId: string, session: SessionRecord, delivery: EveDelivery): Promise<unknown>;
    after(workspaceId: string, session: SessionRecord, delivery: EveDelivery, outcome: { handle: unknown; status: number; deliveryId?: string }): Promise<void>;
  };
  /** Presence for idle stop: every proxied request, and each open stream until it closes */
  activity?(workspaceId: string, kind: "request" | "stream"): () => void;
}
// `greeting` is removed.
```

Routes (all under `/api/v1/workspaces/{workspaceId}`, `packages/agent-api/src/app.ts`, schemas in `schema.ts`):

| route | request | response | errors |
| --- | --- | --- | --- |
| `POST /agents/{agentId}/select` (unchanged from step 2) | no body; launch token | `200 Agent` | 403 `launch_token_invalid`, `origin_forbidden`; 404 `workspace_not_found`, `agent_not_found`; 409 `agent_not_offered` |
| `GET /agents/{agentId}/models` (new, `routes.listModels`) | none | `200 { data: ModelChoice[], pagination }` | 404 `workspace_not_found`, `agent_not_found`; 502 `models_unavailable` with the discovery error's message |
| `POST /sessions/default` (new, `routes.openDefaultSession`) | `DefaultSessionRequest`; launch token | `200 DefaultSessionResponse` | 400 `invalid_request` (also for a draft workspace in this step); 403 as select; 404 `workspace_not_found`; 409 `agent_not_offered`; 503 `agent_failed` |
| `PATCH /sessions/{sessionId}` (new, `routes.updateSession`) | `{ model: string }` (min length 1) | `200 SessionRecord` | 400; 404 `session_not_found`; 409 `turn_paused` ("Change the model after Sensei's question is answered.") when the record's lifecycle is `paused` |
| `POST /sessions` (kept until step 6) | `{ agent?, message, clientContext? }`; `message` is now required | `201 SessionRecord` | as today |
| `GET /sessions`, `GET /sessions/{id}`, `ALL /sessions/{id}/eve/*` | unchanged shapes; records carry the new optional fields | | |

`sessionSummary` in `schema.ts` gains optional `courseId`, `lessonId`, `model`, `revision` (integer), `endedAt`, `replacedBy` and `lifecycle`. No other POST route matches `/sessions/default`'s static path: Elysia matches the static segment before `/sessions/:sessionId`, and the only `:sessionId` routes are `GET` and the `/eve/*` proxy (checked by a test, commit 6).

**The default lookup** (`openDefault`, `packages/ui/src/server/agent-session/default.ts`), under one in-process lock per page key `(workspace path, "sensei", course, lesson ?? "")`:

0.  **Cursor gate** (decision 19): before any lookup or Eve call, when the selected agent is `cursor` and `latestConformance(committedConformance(), "cursor")?.personas.sensei !== "pass"`, answer 409 `agent_not_offered` with "Cursor can't teach here yet: its Sensei checks haven't passed. Choose another coding agent." In step 4 this always refuses (`personaRecordedFrom.sensei` is 5). `committedConformance()` (new, `packages/ui/src/server/conformance.ts`) reads `@dojofoo/protocol/conformance.json` with `readFileSync` through `createRequire(import.meta.url).resolve` and `parseConformanceRecord`, cached per process; protocol exports and ships that file (commit 1, fact 14).
1.  `new: true`: if `from` names a record with `replacedBy`, return that record (`rewrite: true`). Otherwise create (below), then record `replacedBy` on `from` and end its Eve session if it has not ended.
2.  `session` given: honour it when it belongs to the page key (`courseId`, `lessonId`, `persona: "sensei"`), runs on the selected agent and is usable (below). Otherwise continue with 3 and answer `rewrite: true` and `notice: "picked-unavailable"` when the session existed.
3.  Take the newest record for the page key on the selected agent (`createdAt` descending). Usable: return it, `rewrite` true only when it differs from `session`. Unusable: the "Replacement rule" (end the old Eve session if it has not ended, create, record `replacedBy`, seed). None: create.
4.  **Usable** means: no `endedAt`, no `replacedBy`, no `resumeFailedAt`, and a bounded Eve snapshot read (`client.sessions.attach(id).snapshot({ signal: AbortSignal.timeout(2_000) })`) that neither fails with 409 `session_stranded`, 410 `session_expired` or 404, nor contains a `session.ended` event. A failure, or a `session.ended` event, writes `endedAt` (with the code in the log) so the next lookup needs no read. Whether a snapshot of a stranded session answers 409 is unverified; the browser's own 409 on send then takes path 1 (`new` and `from`), so no loop can form.
5.  **Create**: a bodyless Eve create (`client.sessions.create({ signal })`, detached from the browser request), then save the record (`courseId`, `lessonId`, `model` = the workspace's last model for the agent, else for Codex `configuredHarnessModel("codex")` read from the user's real `CODEX_HOME`, else none; `revision: 0`; `lifecycle: { status: "idle" }`). Then the begin turn: text `[dojo:begin] Begin the lesson.` plus, when the learner-evidence store has excerpts for the key, a blank line and the TURNS.md `evidence-seed` section followed by the excerpts; `lifecycle.beginPending: { idempotencyKey: "begin:<sessionId>:<n>", sentAt }` written before the send. Eve's TypeScript client takes no idempotency key (fact 13), so the UI server sends the begin as a plain `fetch` of `POST <host>/eve/v1/session/<id>` with the host's auth header and the JSON body `{ message, idempotencyKey }`, after the lifecycle's pre-delivery transition, retrying 409 `session_not_ready` for up to 20 seconds as Eve's client does. A send that still fails replaces the session once inside the same request (the browser gets the replacement in the response); a second failure answers 503 `agent_failed`.
6.  A record whose `beginPending` is still set when it is returned (a crash before the begin settled) gets the begin resent with the same key; Eve returns the original receipt if it was accepted.

The lock is an in-process `Map<string, Promise<unknown>>`. It is enough only while one UI server runs per `DOJOFOO_HOME`; step 5 adds the server lock. Until then a second UI server on the same state could create a second default session for a page key; this is the accepted interim the step's constraint names.

## Host port

*   **Route:** `POST /api/host-port/{workspaceId}/{persona}/{method}` in the UI server, `Authorization: Bearer <secret>`. Body `{ sessionId: string; idempotencyKey: string; input: unknown }`. Answers `200 { result }`; 401 `host_port_unauthorized` (missing or wrong secret, or an `Origin` header: browsers never call it); 404 `host_port_method_unknown`; 409 `idempotency_key_reused` (same key, different input; it reaches the Eve host only, never the chat); 422 `invalid_request`; 500 `{ error, message }`.
*   **Secret:** the persona host's per-start secret, `randomBytes(32).toString("hex")`, generated inside `start()`. It is the Eve channel's basic-auth password and the host port's bearer, so it authenticates both directions. It is written to `runtime.json`, whose mode is set to `0600` with `chmod` after every write.
*   **Idempotency:** keys are `<eveSessionId>:<callId>` for tool calls (Eve's tool `context.callId`), `<eveSessionId>:<turnId>:<event>` for lifecycle calls, and a random key for reads from instructions and `onMessage`. The server keeps the result of each call to a method marked `mutates` under `(workspaceId, persona, sessionId, idempotencyKey)` with the SHA-256 of its input, for the last 1,024 keys per host, in memory (process-global, `Symbol.for("dojofoo.host-port.idempotency")`). A repeat with the same input returns the stored result without running the handler; a different input answers 409. Reads (`mutates: false`) are never stored.
*   **Methods in this step:**

    | persona | method | mutates | input | result |
    | --- | --- | --- | --- | --- |
    | sensei | `session` | no | `{}` | `{ courseId, lessonId?, mode: "katas" \| "interactive", model?, revision }` from the record |
    | sensei | `context` | no | `{}` | interactive: `{ kind: "interactive", hash, course: { id, title }, guidance: <DOJO.md>, lesson: <getInteractiveLesson snapshot without references> }`; kata: 422 "Kata lessons still run on their own connection." until step 5 |
    | kyoshi | `evaluation.start` | yes | `{ lessonIds: string[] }` | `{ trialId }`; runs today's `evaluateFromAuthoring` in the background, keyed by `trialId` |
    | kyoshi | `evaluation.status` | no | `{ trialId }` | `{ status: "running" } \| { status: "finished", result } \| { status: "failed", error }` |
    | both | `turn.paused` | yes | `{ turnId, awaiting: string[] }` | `{ ok: true }` |
    | both | `turn.settled` | yes | `{ turnId, outcome: "completed" \| "failed" \| "cancelled", error?: { code?, message, id? } }` | `{ ok: true }` |
    | both | `session.ended` | yes | `{ outcome, error? }` | `{ ok: true }` |
    | both | `resume.failed` | yes | `ResumeFailure` | `{ ok: true }` |

    `observe` and `show` stay kata-shaped (`saveLearnerObservation`, `dojoLessonFragment`) and are not offered to interactive Sensei; `check` and `navigate` arrive with kata in step 5. Kyoshi's evaluate tool keeps calling `evaluateFromAuthoring` in-process until step 7 moves it onto these two methods.
*   **Harness parts** (`packages/agent/src/host-port/`): `server.ts` (secret check, idempotency, routing, `(request: Request) => Promise<Response>`), `client.ts` (`createHostPortClient({ url, workspaceId, persona, secret })` with `call(method, sessionId, input, idempotencyKey?)`, 10 s timeout, throws `HostPortError { status, code }`), `fixture.ts` (`startHostPortFixture({ handlers })`: a `node:http` server that accepts any bearer and records `{ method, sessionId, idempotencyKey, input, bearer }`; for tests only).

## Lifecycle (UI server, `packages/ui/src/server/agent-session/lifecycle.ts`)

The fields live on the record's `lifecycle` and are written only through `sessions.update`. Transitions in this step (the design's table minus the guard, held reports, leave and switch-timeout rows, which are step 5):

| event | from → to | side effect |
| --- | --- | --- |
| pre-delivery (message, answer, begin turn) | `idle`, `paused` → `working` | remembers the status before, as the handle |
| delivery answered non-2xx | `working` → the status before | none |
| `turn.paused` | `working` → `paused` | `turnId` |
| `turn.settled` | `working`, `paused` → `idle` | clears `turnId` and `beginPending`; Sensei: learner-evidence capture |
| `session.ended` | any → `idle` | `endedAt` |
| `resume.failed` | unchanged | `resumeFailedAt` (the record is unusable from the next lookup) |
| host ready, reconcile | `working`, `paused` with no open turn in Eve, or a 409/410 read → `idle` | as `turn.settled` |

**Evidence capture** (`packages/ui/src/server/agent-session/evidence.ts`): at a Sensei `turn.settled`, read the session's events with a bounded snapshot, take the whole `transcriptOf(events).messages` (no `maxMessages`, so each index is the message's absolute position in the current conversation), drop messages whose text starts with a `[dojo:` tag, map each to the `UIMessage` shape `retainLearnerEvidence` takes (`{ id: "transcript-<absolute index>", role, parts: [{ type: "text", content: text }] }`), and call the existing `retainLearnerEvidence(previous, messages, lessonId ?? courseId, sessionId)` (`packages/ui/src/server/lesson/learner-evidence.ts:10-26`), which keeps its bounds (8 excerpts, 400 characters) and its `sessionId:messageId` dedup key. An absolute index never names two different messages in one session, so the key cannot collide (a sliding window's index would). The result is stored in `<workspace>/.dojo/learner-evidence.json` (`{ version: 1, entries: { "<courseId>": LearnerEvidenceExcerpt[], "<courseId>/<lessonId>": … } }`). No host switch or session end touches the file. The kata ACP path keeps its `web.json` evidence until step 5.

**Delivery classification** (`classifyEveRequest(method, path, body)` in `packages/agent-api/src/delivery.ts`, used by the `/eve/*` proxy): `POST /eve/v1/session/{id}` with a JSON body that has `message` is a message delivery (its text is the string, or the text parts joined); with `answers` and no `message` it is an answer; an empty body or `{}` is a prepare; `/cancel`, `/clear`, `/compact`, `/end` are controls; `GET …/stream` is a read. Only deliveries call `deliveries.before`/`after`. The proxy reads `deliveryId` from the 202 JSON body (Eve docs/channels/eve.mdx:58,77) and passes it to `after`. Whether Eve ever accepts a delivery without starting a turn is unverified; if it does, the record stays `working` until the next reconcile, which is harmless in this step (nothing reads `working` before step 5).

## Persona hosts

*   `packages/agent/src/persona-host.ts`, export `./persona-host`:

    ```ts
    export interface PersonaHostOptions {
      /** The persona's app folder, `<workspace>/.dojo/<persona>-app/agents/<persona>` (prepared by the composition root) */
      appDir: string;
      /** Where this host's native process groups are recorded */
      processRecord: string;
      /** Called before every start; written to appDir/runtime.json, then chmod 0600 */
      runtimeConfig(start: { secret: string; processRecord: string }): Promise<Record<string, unknown>>;
      /** Called after the server answers /eve/v1/info, before the host counts as ready */
      verify?(info: AgentInfoResult): void;
    }
    export interface PersonaHost {
      start(): Promise<{ url: string; auth: { basic: { username: string; password: string } }; secret: string; exited: Promise<void> }>;
      close(): Promise<void>;
    }
    export function createPersonaHost(options: PersonaHostOptions): PersonaHost;
    ```

    `start()` reaps the record's process groups (below), generates the secret, writes `runtime.json` (with `auth: { username: "dojo-host", password: secret }`), starts `startProductionServer(appDir, { host: "127.0.0.1", port: 0 })`, reads `info` within 10 s, calls `verify`, and resolves. A host that exits on its own resets so the next `start()` starts again (today's behaviour, `packages/authoring/src/eve/runtime.ts:116`). It never imports a persona (D11): the composition root passes the folder and the config.
*   **Process records** (`packages/agent/src/process-groups.ts`): `recordProcessGroup(record, pid)` appends `{"op":"add","pid","startedAt"}` as one line with `appendFileSync`; `forgetProcessGroup(record, pid)` appends `{"op":"remove","pid"}`; `processStartTime(pid)` reads field 22 of `/proc/<pid>/stat` on Linux and `ps -o lstart= -p <pid>` on macOS; `reapProcessGroups(record)` folds the lines, kills (`SIGKILL` to `-pid`) every group whose pid and start time still match, and truncates the file; `reapAllProcessGroups(directory)` does this for every `*.jsonl`. `createLocalSandbox(directory, { processRecord? })` records each spawned group and forgets it when it closes (its `groups` set stays as the in-process exit handler). Records live in `$DOJOFOO_HOME/state/processes/<workspaceId>.<persona>.jsonl`.
*   **Idle stop** (UI server `AgentRuntime`): a host is idle when its workspace has had no proxied request for 15 minutes, no proxied stream is open, `authoringWatchers.watching(path)` is false, and no record on the host's agent has lifecycle `working` or `paused`. A 60-second unref'd interval stops idle hosts (`idleStopMs` option, default 900 000). The lesson and course page sockets that the design names for presence arrive in step 5 (decision 6).
*   **Nitro close:** `packages/ui/server/plugins/authoring.ts` closes every persona host through `closePersonaRuntimes()` (Kyoshi and Sensei) instead of only `closeKyoshiRuntimes` (`:6-9`).
*   **Startup** (`packages/ui/src/server/startup.ts`, `startUiServer`): after the kind backfill, `reapAllProcessGroups(<state>/processes)`. Reconcile runs per host when it becomes ready (`AgentRuntime` endpoint, before the endpoint resolves): every record on the host's agent with lifecycle `working` or `paused` gets the bounded read of `turnOpen` (`packages/ui/src/server/agent-api.ts:118-133`), and without an open turn takes the `turn.settled` transition. Recovery windows and guard verification are step 5 (no guard exists yet).
*   **Retention and limits:** Kyoshi's agent definition adds `experimental: { workflow: { retention: "default" } }`. Sensei's adds the same plus `limits: { sessionTimeoutMs: false, sessionUsage: false }`. Open risk 11's test is `an ended session stays readable after a host restart (retention "default", open risk 11)` in `packages/authoring/src/eve/runtime.test.ts` (commit 4) and the same check for Sensei in `verify-agent.mjs` (commit 5).

## Sensei on Eve

*   **Agent folder** `packages/authoring/agents/sensei/` (shipped like `agents/kyoshi`):
    *   `agent.ts`: `export default createSenseiAgent(runtime)`.
    *   `runtime.ts`: reads `runtime.json` (as `agents/kyoshi/runtime.ts`).
    *   `instructions/00-persona.ts`: `export { default } from "@dojofoo/authoring/sensei/instructions"` (static: `DOJOFOO.md` and `NATIVE.md`).
    *   `instructions/10-course.ts`: `defineDynamic` that memoises `hostPort.call("session")` and `hostPort.call("context")` under `["sensei-course", ctx.session.id]` and returns `defineInstructions({ content: senseiCourseInstructions({ mode, guidance }) })`: the style for the mode (`KATAS.md` or `INTERACTIVE.md`) and the course's `DOJO.md`. Instructions stay fixed for a session (decision 4).
    *   `channels/eve.ts`: the Kyoshi channel's auth, plus `onMessage` that calls `context` and returns `{ auth: defaultEveAuth(ctx), clientContext: [<the interactive lesson JSON>] }`, so each turn sees the current slide and answer, as ACP's per-turn context resources did (`packages/ui/src/server/interactive/conversation.ts:147-157`). A browser-sent `clientContext` is replaced, so a page cannot forge it.
    *   `hooks/dojofoo-lifecycle.ts`: `export default createLifecycleHook(async () => (await runtime()).hostPort)`.
    *   `tools/ask_question.ts`: `export { default } from "@dojofoo/agent/tools/ask_question"`.
    *   `tools/dojo_context.ts`: `createSenseiContextTool(runtime)`, description from `lessonCapabilities.context.description`, no input, calls `context` with key `<sessionId>:<callId>`.
    *   `sandbox/sandbox.ts`: an empty just-bash environment (`JustBashSandbox.environment({ autoInstall: false })`), so Eve's sandbox never mounts learner files.
*   **Tool set for interactive Sensei:** `ask_question` and `dojo_context`, with `defaultTools: false`. Kata tools (`check`, `complete`, `observe`, `show`) arrive in step 5 as dynamic tools that return `null` for interactive courses (D17).
*   **Model** (`packages/authoring/src/sensei/agent.ts`, `createSenseiAgent`): `defineDynamic(async ctx => …)` reads `runtime.json`, memoises `hostPort.call("session")` under `["sensei-model", ctx.turn?.id ?? "none"]`, builds `readOnlyEnvironment(agent, await prepareHarnessEnvironment(), { stateDirectory, eveSessionId: ctx.session.id })`, and returns `experimental_createHarnessModel({ sandbox: createLocalHarnessSandbox(harnessRoot, { environment, processRecord, providerId: "dojo-sensei-local" }), sandboxConfig: { workDir: "scratch" }, harness: await agentAdapter(agent, { mode: "read-only" }), model }, { mode: "read-only", agent, eveSessionId: ctx.session.id, onResumeFailure: failure => hostPort.call("resume.failed", …) })`. Memoising per turn applies a model change from the next turn started by a new delivery, never on the resume of a paused turn (D26).
*   **Working directory:** `harnessRoot = $DOJOFOO_HOME/state/sensei/<workspaceId>/` with an empty `scratch/`, outside the workspace (design, "Write prevention"). The Eve app and its World stay in `<workspace>/.dojo/sensei-app`.
*   **Contracts:** `packages/ui/src/server/lesson/contracts/{DOJOFOO,KATAS,TURNS}.md` move to `packages/authoring/src/sensei/contracts/`, exported as `"./sensei/contracts/*.md": "./src/sensei/contracts/*.md"` and shipped through `files` (`"src/sensei/contracts/*.md"`). New `INTERACTIVE.md` holds today's interactive instructions (`interactive/conversation.ts:22-27`) as a teaching style. New `NATIVE.md`: "Your native file and shell tools can only read. If a tool is refused, carry on without mentioning it." TURNS.md gains `## evidence-seed`: "Excerpts from this learner's earlier conversation in this course, for continuity. Don't quote them back or treat them as proof of mastery."

## Interactive courses on `AgentChat`

*   `packages/ui/src/components/interactive-course.tsx` drops `useChat`, `fetchServerSentEvents`, `loadConversation`, `send`, `answerTool`, `changeAgent`, `changeModel` and the `/conversation`, `/configuration/*` and `/messages` calls (`:4,55-68,121-186,236-253`). The page passes `conversation={<AgentChat embedded workspaceId={workspace} persona="sensei" page={{ course: lesson.dojo }} agents={workspaceAgent.agents} onAgentChange={workspaceAgent.request} agentChanging={workspaceAgent.switching} />}` to `AgentChatWorkspace` (as the authoring page does, `packages/ui/src/routes/authoring.tsx:359-366`), keeps `askAssistant`/`onCommand` by sending through a ref to the chat, and keeps `workspaceAgent.notice`/`dialog`. `useWorkspaceAgent`'s `onSwitched` increments a key on `AgentChat` so it asks for the new agent's default conversation.
*   `packages/ui/src/components/agent-chat.tsx`:
    *   New prop `page?: { course: string; lesson?: string }`. With it, the session comes from `launchFetch(POST …/sessions/default, { course, lesson, session })`; `onSession` becomes optional and is called when `rewrite` is true. Without it (Kyoshi), today's lookup stays until step 6, and `create` sends `{ message: KYOSHI_START, clientContext }`.
    *   When the conversation reports `session_not_active` (not retryable), `session_stranded`, `session_expired`, `session_version_unsupported` or `agent_unavailable` (today's `ended` test, `:142-144`), a Sensei page calls `POST /sessions/default` with `{ course, lesson, new: true, from: <id> }`; Kyoshi keeps `onEnded`.
    *   The composer gets the model menu for Sensei: `GET …/agents/{agent}/models`, `model` from the record, `PATCH …/sessions/{id}` on change; the menu is disabled while a turn is working or paused (`activeTurn(view)` from Eve's view). `AuthoringChat` (`packages/ui/src/components/authoring-chat.tsx:13-50`) gains `model`, `models`, `modelChanging`, `onModelChange` and passes them to `Composer` instead of `models={[]}`.
    *   Failures map to actions through `chatFailure(error)` (new `packages/ui/src/lib/chat-failure.ts`), rendered in `AuthoringChat` in place of the bare `error` paragraph (`:41-42`). "Try again" keeps the existing "Reload conversation" button text, which the specs click.

    | input | action |
    | --- | --- |
    | 409 `agent_unavailable`, 404 `session_not_found` | default open (Sensei: `POST /sessions/default`; Kyoshi: today's recovery) |
    | 409 `session_not_active` (not retryable), `session_stranded`, `session_version_unsupported`, 410 `session_expired` | Sensei: `new` + `from`; Kyoshi: `onEnded` (step 6 adds read-only history) |
    | 409 `session_not_active` on cancel | the turn shows as stopped, no alert |
    | 404 `workspace_not_found` | "Back to the dashboard" |
    | 400 `invalid_request`, 404 `agent_not_found`, 404 `not_found` | "Reload the page" |
    | 403 `launch_token_invalid` | `launchFetch` retries once; then "Reload the page" |
    | 413, 415 | the composer keeps the message; "Remove <file> and send again." |
    | 503 `agent_failed` | "Choose another agent" (the offered agents as buttons calling `onAgentChange`) plus "Try again" |
    | 409 `agent_not_offered` | "Choose another agent" (the offered agents as buttons, leaving out the agent that was refused, so Cursor is not offered back to a Sensei page, decision 19) |
    | failed turn, sign-in | "Log in to <agent>" with the row's `login` command, plus "Try again" |
    | failed turn, rate limit | "Try again", with the provider's retry time when the message has one |
    | failed turn, native crash | "Try again"; the second crash in a row also offers "Choose another agent" |
    | other 5xx, network | "Try again" (button text "Reload conversation") |

    `agent_switching` cannot occur before step 5's switch lock and has no branch yet. **Failed-turn classification** (`classifyTurnFailure`): the source field is `turn.settled.data.error` from the Eve view (Eve docs/concepts/sessions-runs-and-streaming.md:202); `code` is tested first, then `message`, with `sign-in` for `/sign.?in|log.?in|auth|unauthori[sz]ed|credential|401|403/i`, `rate-limit` for `/rate.?limit|quota|429|too many requests/i`, `native-crash` for `/exited|crash|signal|ECONNRESET|EPIPE|spawn/i`, and `other` (Try again) as the default. The per-adapter codes stay unverified until tier A records them.

## Commits

Each commit type-checks and builds (`pnpm build && pnpm -r --if-present types:check`), passes `pnpm lint:deps` and the unit tests of the packages it touches, and leaves Kyoshi authoring, kata Sensei (ACP), interactive Sensei and evaluation working. No dependency is added; `pnpm-lock.yaml` changes only if a `package.json` `files` or `exports` edit requires it (it does not).

### Commit 1: Protocol types, tags and the read-only rows

*   **Add** `packages/protocol/src/tags.ts`:

    ```ts
    export const dojoTags = { begin: "[dojo:begin]", check: "[dojo:check]", beginAuthoring: "[dojo:begin-authoring]" } as const;
    export function tagged(tag: (typeof dojoTags)[keyof typeof dojoTags], text: string): string;   // `${tag} ${text}`
    /** Hidden in the chat: a message that starts with a [dojo:<name>] tag (not a dojo:// link) */
    export function isTaggedTurn(text: string): boolean;                                           // /^\[dojo:[a-z-]+\]/u
    ```
*   **Add** `packages/protocol/src/sessions.ts`: `ModelChoice`, `ResumeFailure { sessionId: string; agent: AgentId; message: string; at: string }`, `HostPortRequest { sessionId; idempotencyKey; input }`, `HostPortErrorCode`, and the Sensei host-port result types (`SenseiSessionInfo`, `InteractiveContext`). `packages/authoring/src/eve/models.ts`'s `HarnessModelChoice` becomes `export type HarnessModelChoice = ModelChoice` (removed in step 7 with `SessionModelConfiguration`).
*   **Change** `packages/protocol/src/agents.ts`:
    *   `UserConfigIsolation` becomes `{ environment: Readonly<Record<string, string>>; unset?: readonly string[]; adapterSettings?: Readonly<Record<string, unknown>>; home?: { links: Readonly<Record<string, string>>; files?: Readonly<Record<string, string>> }; tierA: boolean; note: string }` with the placeholders under "Per-agent isolation". The four-status union and `grokConfigSources` (`:42-43`, kept as the helper for the ten Grok variables) are replaced.
    *   The rows' `readOnly` values become the table under "Per-agent isolation" (Claude `builtinTools: ["read"]`).
    *   `AgentRow` gains `login: string` (the command the D33 "Log in" action shows): claude `claude` then `/login`, codex `codex login`, cursor `cursor-agent login`, grok `grok login`, opencode `opencode auth login`, fx `fx login`, pi `pi` then `/login`, agy `""`. Each is checked with `<cli> --help` where the CLI is installed when this commit is written; one that does not exist is replaced by the row's `docs` URL.
    *   `index.ts` appends `export * from "./tags.js"; export * from "./sessions.js";`.
*   **Change** `packages/protocol/package.json`: `exports["./conformance.json"] = "./src/conformance.json"` and `files` adds `"src/conformance.json"`, so the UI server's Cursor gate can read the committed record (fact 14). `conformance-compare.mjs` and `conformance-record.mjs` keep their paths.
*   **Change** `packages/protocol/src/agents.test.ts`: `every offered row has an adapter and a read-only profile` stays; new `every isolation placeholder is one the harness resolves`, `Grok's private home is per session`, `Claude Code offers only Read among its read-only built-ins (claude-spike.md)`, `Codex runs allow-all because its adapter accepts nothing else`. **Add** `packages/protocol/src/tags.test.ts`: `hides tagged turns but not dojo:// links`.
*   Check: `pnpm --filter @dojofoo/protocol test`, `pnpm --filter "@dojofoo/config..." build`.

### Commit 2: Read-only harness model, isolation, eviction and process records (with Kyoshi on `mode: "full"`, B4)

*   **Add** `packages/agent/src/read-only.ts`, export `./read-only`:

    ```ts
    export type HarnessMode = "read-only" | "full";
    /** HarnessV1 keys for activeTools, and the native names streams report (under "One name mapping") */
    export function readOnlyToolNames(agent: AgentId, eveToolNames: readonly string[]): { keys: string[]; native: string[] };
    /** activeTools = readOnlyToolNames(…).keys; permissionMode from the row */
    export function readOnlyHarnessSettings(agent: AgentId, eveToolNames: readonly string[]): { activeTools: string[]; permissionMode: "allow-reads" | "allow-all" };
    /** Whether a read-only call may approve this request: the gated call targets one of this call's Eve tools (Grok's use_tool by its tool_name) */
    export function approvesHostTool(agent: AgentId, call: { toolName: string; input: unknown }, eveToolNames: readonly string[]): boolean;
    /** Strips builtinToolFiltering in doStart (resume and continue included), for the `deny` rows (Cursor, Grok) */
    export function withoutBuiltinFiltering<A extends HarnessV1>(adapter: A): A;
    /** The read-only sandbox environment: base, minus `unset`, plus `environment`, with the private home created, linked and written */
    export async function readOnlyEnvironment(agent: AgentId, base: NodeJS.ProcessEnv, options: { stateDirectory: string; eveSessionId?: string }): Promise<NodeJS.ProcessEnv>;
    /** Removes a per-session private home (Grok); a no-op for the shared ones */
    export async function removeReadOnlyHome(agent: AgentId, options: { stateDirectory: string; eveSessionId: string }): Promise<void>;
    /** The read-only adapter settings: the row's adapterSettings, plus Pi's providers and credentials (under "Per-agent isolation") */
    export async function readOnlyAdapterSettings(agent: AgentId, base: NodeJS.ProcessEnv): Promise<Record<string, unknown>>;
    export class PreventionError extends Error { readonly record: PreventionRecord }   // no statusCode, so Eve does not retry
    export type PreventionRecord =
      | { type: "dojofoo.prevention"; kind: "approval-refused"; agent: AgentId; tool: string; eveSessionId?: string; at: string }
      | { type: "dojofoo.prevention"; kind: "native-call-outside-allow-list"; agent: AgentId; tool: string; failed: boolean; eveSessionId?: string; at: string };
    ```
*   **Change** `packages/agent/src/adapters.ts`: `agentAdapter(agent, options: { mode?: HarnessMode; environment?: NodeJS.ProcessEnv } = {})`, replacing today's positional `environment` (`:28`). The cache key becomes `${agent}:${mode}`. `read-only` merges `readOnlyAdapterSettings(agent, environment)` into the factory settings (Claude `strictMcpConfig`, Codex `webSearch`/`codexConfig`, Pi `providers`/`credentials`), wraps `deny` rows with `withoutBuiltinFiltering`, and builds Pi with no `agentDir`. The read-only path is the only one, so production and tier A build read-only adapters through the same code (only the fixture's `auth` differs, commit 10). Both modes build Pi with `reattachInProcess: false` (decision 9). The default mode here is `"full"` (callers name the mode they run; the harness model is where a missing mode fails closed).
*   **Change** `packages/agent/src/harness-model.ts`:
    *   `sessionOptions` becomes `{ sandboxSession?; mode?: HarnessMode; agent?: AgentId; eveSessionId?: string; onResumeFailure?(failure: ResumeFailure): Promise<void> | void; onPrevention?(record: PreventionRecord): void }`. A missing `mode` is `read-only`. `read-only` without `agent` throws "A read-only harness model needs its coding agent." before any session starts.
    *   One helper, `harnessAgentSettings(runtime, sessionOptions, eveToolNames)`, builds the `HarnessAgent` settings for both `doStream` (`:111`) and `experimental_compact` (`:67-68`), so compaction runs with the same allow-list, permission mode and fail-closed check. For `read-only` it spreads `readOnlyHarnessSettings(agent, eveToolNames)` after `runtime`, so a caller cannot widen it; compaction passes the tool names of the checkpointed call, or none.
    *   A `tool-approval-request` part (today's `:235-239`) in `read-only` mode is answered by the model, never enqueued: when `approvesHostTool` holds for the gated call, the same `doStream` approves it: once the stream ends with that approval pending, its drain loop (`:192-202`) calls `agent.continueStream({ session, toolApprovalContinuations: [{ type: "tool-approval-response", approvalId, approved: true }] })` on the same session, as Eve's own answer would arrive (`:140,165`), and keeps draining; otherwise it records `approval-refused` through `onPrevention` (default: `console.warn(JSON.stringify(record))`) and ends the stream with `PreventionError`. A provider-executed `tool-call` whose name is not in `readOnlyToolNames(…).native` records `native-call-outside-allow-list` with `failed` from its result.
    *   **Session map:** only Eve session id to sandbox id; the sandboxes themselves stay in `createLocalHarnessSandbox`'s existing `live` map (`local-harness-sandbox.ts:8`, fact 15). New module `packages/agent/src/harness-sessions.ts` keeps a process-global `Map<string, { sandboxId: string; evict(): Promise<void> }>` (`Symbol.for("dojofoo.harness-sessions")`) with `trackHarnessSession`, `forgetHarnessSession` and `evictHarnessSession(eveSessionId): Promise<boolean>`. `createLocalHarnessSandbox` gains `evict(sandboxId)`, which stops and removes its `live` entry. `doStream` records the sandbox id that `runtime.sandbox.createSession`/`resumeSession` was called with; when the turn ends detached (`:282`) it tracks `{ sandboxId, evict: () => runtime.sandbox.evict?.(sandboxId) }`, and when it ends stopped it forgets it. Eviction stops that sandbox (killing the native processes); the next turn resumes from the checkpoint through the adapter's own recovery (HarnessV1 `src/v1/harness-v1-session.ts`). Exported from `./experimental` next to the model.
    *   **Failed resume:** when a checkpoint is present (`continuing`, or `resumeFrom` on a new prompt) and `agent.createSession` or `agent.continueStream` throws, call `onResumeFailure({ sessionId: eveSessionId ?? "", agent, message, at })` once, then throw `ResumeFailedError` (no `statusCode`, so Eve fails the turn without retrying).
*   **Change** `packages/agent/src/local-sandbox.ts`: `createLocalSandbox(directory, { id?, environment?, processRecord? })` records and forgets each spawned group (above); `killTree` (`:27-47`) moves to `process-groups.ts` and is imported back, so the reaper kills a recorded group and every group its processes started (OpenCode's server, fact 15), not only `-pid`. **Add** `packages/agent/src/process-groups.ts` (above), export `./process-groups`. `createLocalHarnessSandbox` passes `processRecord` through.
*   **Add** `localStateDirectory(options?)` to `packages/config/src/local-state.ts` (`<stateHome>/state`, the same `stateHome` rule as `:335`), used from commit 4 on.
*   **Change** every caller to name its mode:
    *   `packages/authoring/src/eve/agent.ts:24-37` (B4): `defineDynamic(async ctx => …)` and `experimental_createHarnessModel({ … }, { mode: "full", agent: settings.harness, eveSessionId: ctx.session.id })`; `agentAdapter(settings.harness, { mode: "full" })`.
    *   In `packages/agent/experiments/model-provider/`: `provider.test.mjs` replaces its import alias (`:10`) with `const createHarnessModel = (runtime, options = {}) => experimental_createHarnessModel(runtime, { mode: "full", ...options })`, which covers its 45 calls; `pi.test.mjs:62`, `pi-local-continuation.test.mjs:27`, `recovery-worker.mjs:72`, `opencode-recovery-worker.mjs:10`, `opencode-startup.test.mjs:55,83`, `authored-agent.fixture.ts:6`, `host-agent.fixture.ts:123`, `cli-host.test.mjs:74` and `native-host.test.mjs:52` add `mode: "full"` to the second argument (or pass `{ mode: "full" }` where there is none). `consumer-types.ts:11-21` and `adapter-types.ts:30-45` are type checks and gain one `{ mode: "read-only", agent: "codex" }` line each. A test that relies on a native tool or approval card (the experiments are harness-level tests of a full-access path) is exactly why they name `full`.
    *   The examples in `packages/agent/README.md:200,223` and `experiments/model-provider/README.md:244` show the second argument with `mode`.
*   **Tests** (`packages/agent/test/`, Vitest), with a minimal fake HarnessV1 adapter that records `doStart` options and replays scripted parts:
    *   `read-only.test.ts`: `a read-only call allows only the row's built-ins plus that call's Eve tools`; `a missing mode is read-only and needs an agent`; `full mode passes no filter and no permission mode`; `compaction uses the same allow-list and permission mode`; `an approval request in read-only mode ends the turn with PreventionError and records it`; `an approval for one of the call's Eve tools, including Grok's use_tool, is approved without a card`; `native names map per agent (Read, read_file, mcp__harness-tools__x, harness-tools_x)`; `Grok gets one private home per Eve session, holding only the model tables of the user's config.toml`; `Pi's read-only settings carry the user's providers and credentials, not its agentDir`; `a deny row's adapter never receives builtinToolFiltering, on start, resume and continue`; `the read-only environment links the bootstrap, skips missing link targets, writes Codex's config and removes OpenCode's config variables`; `placeholders resolve from the user's environment, not the private home`.
    *   `harness-sessions.test.ts`: `a detached session is tracked under its Eve session id and evicted by stopping its sandbox`; `a stopped session is forgotten`; `a failed resume is reported once and rethrown without a status code`.
    *   `process-groups.test.ts`: `records and forgets a spawned group`; `reaps a recorded group that is still running, with the groups it started`; `never kills a recorded pid whose start time changed` (record a fake start time for a live pid).
    *   `adapters.test.ts`: `:21,23` call `agentAdapter("pi", { environment: {} })` and `agentAdapter("pi", { environment: { PI_CODING_AGENT_DIR: "/tmp/custom-pi" } })`, keeping the `agentDir` assertions (now with `reattachInProcess: false`); new `read-only adapters are cached apart from full ones`, `Pi never reattaches in process`, `a read-only Pi adapter has no agentDir`.
*   Check: `pnpm --filter @dojofoo/agent test` (its `run.mjs` packed-consumer tests use `mode: "full"`), `pnpm --filter @dojofoo/authoring test --exclude '**/*.live.test.ts'`, and `DOJO_CONFORMANCE_AGENTS=claude,codex pnpm --filter @dojofoo/authoring conformance` locally (Kyoshi still passes on `mode: "full"`).

### Commit 3: Host port, lifecycle hook and persona host in the harness

*   **Add** `packages/agent/src/host-port/server.ts`, `client.ts`, `fixture.ts` (under "Host port"); exports `./host-port` (server and client) and `./host-port/fixture`.
*   **Add** `packages/agent/src/lifecycle.ts`, export `./lifecycle`:

    ```ts
    export const lifecycleHookSlug = "dojofoo-lifecycle";
    /** An Eve hook for every persona host: reports turn.paused/settled and session.ended to the host port, evicting first when a turn
     *  settles cancelled or failed or the session ends. Catches and logs its own errors. Without a binding it only evicts. */
    export function createLifecycleHook(binding: () => Promise<HostPortBinding | undefined>): HookDefinition;
    export interface HostPortBinding { url: string; workspaceId: string; persona: Persona; secret: string }
    ```

    Keys: `<sessionId>:<turnId>:paused:<awaiting joined>`, `<sessionId>:<turnId>:settled`, `<sessionId>:ended`. At `session.ended` the hook also calls `removeReadOnlyHome(agent, { stateDirectory, eveSessionId })` when the binding names a read-only agent (Grok's per-session home).
*   **Add** `packages/agent/src/persona-host.ts` (under "Persona hosts"), export `./persona-host`.
*   **Tests:** `packages/agent/test/lifecycle.test.ts` also covers `an ended Grok session's private home is removed`. `packages/agent/test/host-port.test.ts`: `refuses a missing or wrong secret and any request with an Origin`, `routes to the persona's method handler`, `a repeated mutating call returns the stored result without running again`, `a reused key with different input answers 409 idempotency_key_reused`, `reads are never stored`, `the client times out after 10 s and reports the server's code`. `lifecycle.test.ts` (handler functions called with a fake context): `reports a pause and a settle with stable keys`, `evicts before reporting a cancelled or failed settle and an ended session`, `a host-port failure is logged, never thrown`. `persona-host.test.ts` (with a stub `startProductionServer` injected through an internal option): `a new secret on every start`, `runtime.json is mode 0600 after every write, also when it already existed`, `reaps recorded groups before starting`, `a host that exits on its own starts again`.
*   **Change** `.dependency-cruiser.cjs`: nothing; the new files import only `@dojofoo/protocol`, Node and Eve subpaths.
*   Check: `pnpm --filter @dojofoo/agent test`, `pnpm lint:deps`.

### Commit 4: Kyoshi on the persona host, with the lifecycle hook

*   **Change** `packages/authoring/src/eve/prepare.ts`: `preparePersonaApp(courseRoot, persona)`, `preparePersonaOutput(app, persona)` (links `dist/prepared/<persona>`) and `preparePersonaHarness(courseRoot)` (Kyoshi's `kyoshi-harness` with its `course` link); `prepareKyoshiApp`, `prepareKyoshiOutput` and `prepareKyoshiHarness` stay as one-line wrappers, so `prepare.test.ts` and `routes.test.ts:318,336` are untouched. The manifest name becomes `dojo-<persona>-runtime`; an existing `dojo-kyoshi-runtime` manifest is still accepted.
*   **Change** `packages/authoring/src/eve/runtime.ts`: `createKyoshiRuntime(courseRoot, { model?, agent?, workspaceId?, hostPortUrl? })` builds a `createPersonaHost` with `appDir`, `processRecord` (`<state>/processes/<workspaceId ?? workspaceIdFor(root)>.kyoshi.jsonl`) and a `runtimeConfig` that writes today's fields (`:97-108`) plus `hostPort` (when `hostPortUrl` is given) and `processRecord`. The secret moves out of the factory (`:76`) into `start()`. `acquireKyoshiRuntime(root, target?)` passes the target on. New `closePersonaRuntimes()` closes Kyoshi's (and, from commit 5, Sensei's) runtimes. `start()` resolves `{ url, auth, exited, secret }`.
*   **Add** `packages/authoring/agents/kyoshi/hooks/dojofoo-lifecycle.ts`: `export default createLifecycleHook(async () => (await runtime()).hostPort)`; `KyoshiRuntime` gains `hostPort?: HostPortBinding` and `processRecord?: string`; `createKyoshiAgent` adds `experimental: { workflow: { retention: "default" } }` and passes `processRecord` to `createLocalHarnessSandbox`. Kyoshi's tool files (`bash`, `read_file`, `write_file` disabled) stay as they are (decision 11).
*   **Change** `packages/authoring/src/eve/runtime.ts` `start()` verifies `info.hooks.some(hook => hook.slug === lifecycleHookSlug)` through the host's `verify`, else fails with "The prepared Kyoshi build lacks dojofoo's lifecycle hook. Reinstall Dojofoo."
*   **Tests** (`packages/authoring/src/eve/runtime.test.ts`): `a new secret on every start, and runtime.json stays 0600` (start, read `auth.password`, close, start again, compare, `stat().mode & 0o777`); `the prepared host lists dojofoo's lifecycle hook`; `an ended session stays readable after a host restart (retention "default", open risk 11)` (bodyless create, `end()`, close, start, snapshot contains `session.ended` and no 410).
*   Check: `pnpm --filter "@dojofoo/authoring..." build`, `pnpm --filter @dojofoo/authoring test --exclude '**/*.live.test.ts'`, `pnpm --filter @dojofoo/authoring test:prepared`.

### Commit 5: The Sensei Eve agent, its contracts and its prepared build

*   **Move** `packages/ui/src/server/lesson/contracts/DOJOFOO.md`, `KATAS.md`, `TURNS.md` to `packages/authoring/src/sensei/contracts/` (git mv). **Add** `INTERACTIVE.md`, `NATIVE.md` and the `evidence-seed` section of `TURNS.md` (under "Sensei on Eve").
*   **Change** `packages/authoring/package.json`: `files` adds `"agents/sensei"` and `"src/sensei/contracts/*.md"`; `exports` adds `"./sensei/contracts/*.md"`, and TypeScript entries `"./sensei/agent"`, `"./sensei/instructions"`, `"./sensei/context-tool"`, `"./sensei/runtime"` in the same `types`/`development`/`import`/`default` shape (tsup entries derive from them, `tsup.config.ts:5-10`).
*   **Add** `packages/authoring/src/sensei/instructions.ts` (`senseiInstructions` default export from `DOJOFOO.md` + `NATIVE.md` through `readPrompt`; `senseiCourseInstructions({ mode, guidance })`), `agent.ts` (`createSenseiAgent`, under "Sensei on Eve"), `context-tool.ts` (`createSenseiContextTool`), `runtime.ts` (`createSenseiRuntime(workspaceRoot, { agent?, model?, workspaceId?, hostPortUrl? })`, `acquireSenseiRuntime`, `closeSenseiRuntimes`; the app folder is `.dojo/sensei-app/agents/sensei`, `harnessRoot` and `scratch/` under `$DOJOFOO_HOME/state/sensei/<workspaceId>/`). `createSenseiAgent`'s `build.externalDependencies` repeats Kyoshi's list.
*   **Add** `packages/authoring/agents/sensei/` (files under "Sensei on Eve").
*   **Change** the readers of the moved contracts:
    *   `packages/ui/src/server/lesson/instructions.ts:2-4`: `readPrompt("sensei/contracts/DOJOFOO.md")` etc. from `@dojofoo/authoring/prompts` instead of `?raw`.
    *   `packages/ui/src/server/lesson/instructions.test.ts:2-4` and `service-state.test.ts:10`: the same.
    *   `packages/evals/src/transformation.ts:15,19`, `introduction-scenario.ts:33,37`, `lifecycle.ts:22,26`: `packages/authoring/src/sensei/contracts/…`.
    *   `packages/authoring/src/evaluation/material-support.live.test.ts:36` and `lesson-design.live.test.ts:80`: the URL becomes ``new URL(`../sensei/contracts/${file}.md`, import.meta.url)``.
    *   `packages/ui/src/server/lesson/teaching-comparison.live.test.ts:139` reads the policy at a baseline commit with `git show`: it tries `packages/authoring/src/sensei/contracts/<name>.md` and falls back to the old `packages/ui/src/server/lesson/contracts/<name>.md`, so baselines from before this step still resolve.
    *   Comments: `packages/ui/src/server/lesson/codex-client.ts:9-11`, `instructions.ts:21` and `check-observation.test.ts:7` name the new path; `packages/evals/README.md:20` and `packages/evals/authoring/README.md:247-248` likewise.
    *   `docs/research/kata-teaching/evidence.json:133` is a recorded research artefact naming where the file was when it was captured; it stays unchanged (decision 20).
*   **Change** `packages/authoring/scripts/build-agent.mjs`: build every persona in `["kyoshi", "sensei"]` (source `agents/<persona>`, destination `dist/prepared/<persona>`, label `source: dojofoo/<persona>@…`), copying `skills/` only for Kyoshi. `agentSourceHash` is called per persona folder.
*   **Change** `packages/authoring/scripts/verify-agent.mjs` (constraint 11): the checks at `:25-29` and the cold-open, cold-resume, warm-resume, relocated-copy and no-compiler checks run for both personas, through `createKyoshiRuntime` and `createSenseiRuntime`. For Sensei it also asserts that `info.hooks` has `dojofoo-lifecycle`, that the static tools are exactly `ask_question` and `dojo_context` (no `bash`, `read_file`, `write_file`, `web_fetch`, `web_search` or `agent`), and that an ended session is readable after a restart (open risk 11). The printed JSON gains a `personas` key.
*   **Change** `packages/cli/scripts/test-packed-ui.mjs:39-42`: also read `dist/prepared/sensei/build.json` and require its labels.
*   **Tests:** `packages/authoring/src/sensei/instructions.test.ts`: `persona instructions are DOJOFOO and NATIVE only`, `the course instructions carry the mode's style and the course DOJO.md`, `an interactive course gets INTERACTIVE.md, never KATAS.md`. `packages/authoring/src/sensei/runtime.test.ts`: `owns a real packaged Sensei server and releases it without launching a model`, `Sensei's scratch directory is outside the workspace and empty`, `runtime.json carries the host port, the agent and the process record`.
*   **Claude Code safe-mode check** (before commit 10 writes the tier-A bodies): a scratch script outside the repository, run from `packages/authoring` as step 3's Claude spike was, starts the prepared Sensei host on Claude Code against the loopback (Messages route) with a host-port fixture and the read-only environment, sends one message, and records whether the first request offers `mcp__harness-tools__dojo_context` and whether the tool runs. If safe mode hides the host tools, Claude's row switches to the fallback in this commit (no `CLAUDE_CODE_SAFE_MODE`; `skillOverrides` that turn every user skill off; the other three variables and `strictMcpConfig` stay) and the finding is appended to `claude-spike.md`. `sensei.interactive.host-tool-turn` on Claude (commit 10) is the lasting check.
*   Check: as commit 4, plus `pnpm --filter @dojofoo/ui test --exclude '**/*.live.test.ts'` (instructions readers), `pnpm --filter dojofoo test:package`.

### Commit 6: Session records, models and the record store; `greeting` removed

*   **Change** `packages/agent-api/src/runtime.ts`, `schema.ts`, `app.ts` (the interface block above): `SessionRecord` fields; `sessions.update` and `sessions.patch`; `models`; routes `GET /agents/{agentId}/models` and `PATCH /sessions/{sessionId}`; `POST /sessions` requires `message` and stops calling `greeting`, and `routes.createSession`'s description (`schema.ts:66`) drops "or the persona's greeting"; `greeting` is deleted from the interface (`:51-52`) and from `packages/agent-api/src/fixtures.ts:67`. `deliveries` and `activity` join the interface in commit 7 and `sessions.openDefault` in commit 8, together with their implementations, so each commit type-checks; the fixture runtime gains them in those commits as described below.
*   **Change** `packages/agent-api/src/fixtures.ts`: `testRuntime` gains in-memory `update`, `patch` (with `revision`), `models` (`[{ id: "fixture-model", name: "Fixture model", efforts: [] }]`), and `openDefault` that returns the newest record with the same `courseId` or creates one with a bodyless create on `endpoint`.
*   **Change** `packages/ui/src/server/agent-api.ts`: the record store (`read`/`save`, `:96-115`) moves to `packages/ui/src/server/agent-session/records.ts` with `updateRecord(path, id, change)` on the same write queue, normalising a missing `revision` to 0. `models(workspaceId, agentId)` calls authoring's `harnessModels`. `sessions.patch` refuses a `paused` record with 409 `turn_paused`, writes `model` and `revision + 1`, and calls `writeAgentModel(path, record.agent, model)`.
*   **Change** `packages/config/src/runtime.ts`: `readAgentModel(root, agent): string | undefined` and `writeAgentModel(root, agent, model)` read and write `.dojo/runtimes.json` `models: { [agent]: model }`, keeping `agent` and other keys (temp file and rename, as `writeAgent`). (`localStateDirectory` arrived in commit 2.)
*   **Change** `packages/authoring/src/eve/models.ts`: `harnessModels` for `acp-probe` calls new `acpModels(agent: "cursor" | "grok", signal, options?: { executable?, args?, environment? })`: spawn `cursor-agent --disable-auto-update acp` or `grok agent stdio` in an empty temp directory, `initialize` (protocol 1), `session/new { cwd, mcpServers: [] }`, read Cursor's `configOptions` select whose `id` or `category` is `model` (as `codex-client.ts:352-356` reads them) or Grok's `models.availableModels`, send `session/close` when `initialize` advertised it, then end stdin and kill the child; timeout 15 s; `[]` when the CLI is missing. The comment at `:35` goes.
*   **Change** `packages/ui/src/components/agent-chat.tsx:49-51`: `create` sends `{ message: KYOSHI_START, clientContext }` (Kyoshi is the only caller of `POST /sessions` in this step). `packages/ui/e2e/agent-chat.fixture.ts:15`: `greetingReply = \`Echo: ${KYOSHI_START}\``.
*   **Tests:**
    *   `packages/agent-api/src/app.test.ts` (record tests): `:113` becomes `creates a session on the selected coding agent, whose first turn is the message in the body`; `:127-138` sends a message; new `a record carries course, lesson, model, revision and lifecycle through the API`, `PATCH sets the model and raises the revision`, `PATCH refuses a paused session with 409 turn_paused`, `lists a coding agent's models in the collection shape`, `POST /sessions without a message is invalid_request`.
    *   `packages/ui/src/server/agent-session/records.test.ts`: `concurrent updates to two records in one workspace both land`, `a record without a revision reads as revision 0`, `an update of a missing record answers session_not_found`.
    *   `packages/cli/test/agent-selection.test.ts`: new `the workspace keeps one last model per agent next to its agent`.
    *   `packages/authoring/src/eve/models.test.ts`: new `lists Cursor models from an ACP probe's configOptions`, `lists Grok models from an ACP probe's session models`, `closes the probe session when the agent supports it and always stops the probe` (both with `process.execPath -e <fake ACP server>`), `lists no ACP models when the CLI is missing`.
*   Check: `pnpm --filter @dojofoo/agent-api test`, `pnpm --filter @dojofoo/ui test --exclude '**/*.live.test.ts'`, `pnpm --filter dojofoo test`, the browser specs in `verify.yml`.

### Commit 7: Sensei hosts, the host port and the lifecycle in the UI server

*   **Change** `packages/ui/src/server/agent-api.ts`:
    *   `createLocalAgentRuntime({ runtime(root, target: { persona, workspaceId, hostPortUrl }), state?, switchSettleMs?, idleStopMs? })`; the `host` option and `EVE_BASE_URL` (`:35,76,221`) are deleted.
    *   `connect` drops the 409 `persona_unavailable` (`:190`) and starts the persona the workspace's kind runs; the endpoint resolves only after the host's reconcile (under "Persona hosts").
    *   `connect` and `start` answer 409 `agent_not_offered` when the saved selection is no longer offered, or, for Cursor, when `resolveAgentExecutable("cursor")` finds nothing (the other agents bootstrap their own CLI or run in-process; decision 7).
    *   `connect` for persona `sensei` applies the Cursor gate of `openDefault` step 0 (decision 19) before starting a host. `select` does not: kata Sensei on ACP keeps Cursor.
    *   Each host start registers its secret for the host port under `(workspaceId, persona)` and removes it on exit or close.
    *   Idle stop and `activity` (under "Persona hosts"); `deliveries` from the lifecycle module.
    *   `agentApi` (`:220-228`): `runtime: (root, target) => target.persona === "kyoshi" ? acquireKyoshiRuntime(root, target) : acquireSenseiRuntime(root, target)`.
*   **Add** `packages/ui/src/server/host-port.ts`: `hostPortUrl()` (`http://<host>:<PORT ?? 4567>/api/host-port`, where host is `HOST` unless it is empty or a wildcard (`0.0.0.0`, `::`, `[::]`), else `127.0.0.1`; decision 8), the handlers (Sensei `session`, `context`; Kyoshi `evaluation.start`, `evaluation.status`; both personas' lifecycle methods through `lifecycle.ts`), and `hostPortServer = createHostPortServer({ secret, handlers })`. **Change** `packages/ui/src/server/app.ts`: `app.post("/api/host-port/*", c => hostPortServer(c.req.raw))` before the `/api/v1` mount.
*   **Add** `packages/ui/src/server/agent-session/lifecycle.ts` and `evidence.ts` (under "Lifecycle"). `learner-evidence.ts` is reused unchanged.
*   **Add** `packages/agent-api/src/delivery.ts` (`classifyEveRequest`). **Change** `packages/agent-api/src/app.ts:92-116`: classify each proxied request; call `deliveries.before` before forwarding a delivery and `deliveries.after` with the status and `deliveryId`; call `activity` for every request and hold a stream's release until its body ends.
*   **Change** `packages/ui/src/server/authoring-watch.ts`: `watching(path): boolean` (`entries.has(realpathSync(path))`).
*   **Change** `packages/ui/src/server/startup.ts`: `startUiServer` reaps every recorded process group after the backfill; the comment at `:12` says step 5 adds the server lock.
*   **Change** `packages/ui/server/plugins/authoring.ts:6-9`: `closePersonaRuntimes()` (constraint 10).
*   **Change** the `EVE_BASE_URL` users: `packages/authoring/src/eve/browser.fixture.mjs:67`, `packages/ui/scripts/verify-lesson-runtime.mjs:62`, `verify-interactive-runtime.mjs:27` (rewritten in commit 9) and `packages/ui/src/server/nitro-close.integration.test.ts:24` drop the variable; `packages/agent/README.md:187,266,331` drop the override ("tests use the fixture runtime").
*   **Tests:**
    *   `packages/ui/src/server/agent-api.test.ts`: `:82-88` becomes `refuses unknown workspaces and other coding agents` (the `persona_unavailable` line goes) plus new `connects a learner workspace to its Sensei host` (the `runtime` stub records `target.persona === "sensei"`), `refuses a saved selection that is no longer offered with 409 agent_not_offered`, `stops a host after the idle bound when nothing uses it`, `keeps a host with a paused session`, `reconciles a working record without an open turn to idle when the host is ready`, `connect refuses Cursor for Sensei with 409 agent_not_offered while no passing Sensei record exists` (a learner workspace whose `runtimes.json` names `cursor`; the `runtime` stub is never called), `connect still starts Kyoshi on Cursor for a draft`, `select still accepts Cursor for a learner workspace` (kata Sensei on ACP keeps it).
    *   `packages/ui/src/server/host-port.test.ts` (mounted `app.fetch`): `serves Sensei's session and interactive context for a registered host`, `refuses an earlier start's secret`, `refuses a browser request`, `a pause then a settle moves the record from working to paused to idle`, `a settle of a Sensei session captures learner evidence without tagged turns`, `resume.failed marks the record unusable`, `Kyoshi's evaluation.start returns a trial id and evaluation.status reports it` (with `evaluateFromAuthoring` mocked), `hostPortUrl uses loopback for a wildcard HOST`.
    *   `packages/ui/src/server/agent-session/lifecycle.test.ts`: one test per transition row, plus `a rejected delivery restores the status before it`.
    *   `packages/agent-api/src/delivery.test.ts`: `a message, an answer, a prepare, the four controls and a stream read are told apart`, `a message's text is read from a string or its text parts`.
    *   `packages/agent-api/src/app.test.ts`: `the proxy tells the runtime about each delivery before and after it, with Eve's deliveryId`, `a rejected delivery reaches after with its status`, `a stream counts as activity until it closes`.
    *   `packages/ui/src/server/startup.test.ts`: new `reaps recorded process groups at startup`.
*   Check: `pnpm --filter @dojofoo/agent-api test`, `pnpm --filter @dojofoo/ui test --exclude '**/*.live.test.ts'`, `pnpm --filter @dojofoo/ui test:lesson` (kata on ACP unchanged), the browser specs.

### Commit 8: The default conversation for Sensei pages

*   **Add** `packages/ui/src/server/agent-session/default.ts` (`openDefault`, under "Session API interface"). **Change** `packages/ui/src/server/agent-api.ts` to expose it as `sessions.openDefault`.
*   **Change** `packages/agent-api/src/app.ts`: `POST /workspaces/:workspaceId/sessions/default` calls `options.authorize?.(request)` (the second token-checked route, design "Session API"), then `runtime.sessions.openDefault`. `schema.ts` adds `routes.openDefaultSession`.
*   **Tests** (the gate's default-conversation tests):
    *   `packages/ui/src/server/agent-session/default.test.ts`, against a real Eve fixture host (`startEve` from `@dojofoo/agent-api/fixtures`) through `createLocalAgentRuntime` with a `runtime` stub returning it: `opens the newest usable conversation for the course on the selected agent`; `creates one with a bodyless create, then sends the hidden begin turn`; `the begin turn carries learner evidence when the course has some`; `two concurrent opens for one course create one session`; `another agent's conversation is never the default`; `a URL session from another course, workspace or agent is replaced and the URL rewritten`; `an ended newest conversation is replaced, recording replacedBy, and seeded`; `a stranded or expired newest conversation is replaced`; `a resume failure replaces the session exactly once across two tabs` (two `new` + `from` requests return the same replacement); `a begin left pending by a crash is resent with the same idempotency key`; `a failed begin replaces the session once, then answers agent_failed`; `the begin turn is posted with its idempotencyKey in the JSON body`; `a draft workspace answers invalid_request until step 6`; `Cursor is refused before any Eve call while its Sensei record has not passed`.
    *   `packages/agent-api/src/app.test.ts`: `POST /sessions/default needs the launch token`, `no other POST route matches /sessions/default`.
    *   `packages/ui/src/server/launch-token.test.ts`: `the mounted default-session route refuses an earlier launch's token` (open risk 12).
*   Check: as commit 7.

### Commit 9: Interactive courses on `AgentChat`; interactive Sensei's ACP use deleted

*   **Change** `packages/ui/src/components/interactive-course.tsx`, `agent-chat.tsx`, `authoring-chat.tsx` (under "Interactive courses on `AgentChat`"). `interactive-course.tsx:31` imports the type `InteractiveConversation` from the deleted `conversation.ts`; the import goes with the code that used it. **Add** `packages/ui/src/lib/chat-failure.ts`.
*   **Change** `packages/authoring/src/eve/messages.ts:12-13`: `eveChatMessages` hides every user message whose first text part satisfies `isTaggedTurn` (the begin turn, Kyoshi's start, step 5's check reports), not only a first-position `KYOSHI_START`.
*   **Delete** (Step 4 "Deletes"):
    *   `packages/ui/src/server/interactive/routes.ts`: `GET /conversation`, `PUT /configuration/harness`, `PUT /configuration/model`, `POST /messages` (`:34-65`), the `agui-stream` import (`:11`), the conversation import (`:10`) and the `@tanstack/ai` import (`:3`).
    *   `packages/ui/src/server/interactive/conversation.ts` (every function in it uses `acpClient`; its instructions moved to `INTERACTIVE.md`) and `conversation.test.ts`.
    *   `packages/ui/src/server/interactive/service.ts`: the `HarnessKind` import (`:4`), `InteractiveConversationBinding` (`:6`), the `conversations` and `conversationAgents` state fields (`:26-27`), `readInteractiveConversation` and `writeInteractiveConversation` (`:51-65`). `readState` returns only `{ version, courses }`, so the next progress write drops `pendingRuntime` and the per-agent bindings from `.dojo/interactive.json`; progress fields stay.
    *   The Sensei 409 `persona_unavailable` (commit 7), `EVE_BASE_URL` (commit 7), `AgentRuntime.greeting` (commit 6).
*   **Change** the tests that import the removed code (constraint 12): `packages/ui/src/server/interactive/routes.test.ts` drops `:9` and the tests at `:63-86` and `:88-101`, and gains `the removed conversation, configuration and messages routes answer 404`. `conversation.test.ts` is deleted.
*   **Change** the specs: `packages/ui/e2e/learner-pages.spec.ts:121` and `course-materials.spec.ts:19` drop their `/interactive/conversation` branch (the chat now talks to `/api/v1`, which these specs do not exercise). Unverified: whether `interactive-progression.spec.ts` and `learner-model-runtime.spec.ts` (not in the CI list) mock the removed routes; the implementer runs them and fixes or records them.
*   **Rewrite** `packages/ui/scripts/verify-interactive-runtime.mjs` (under "The rewritten `test:interactive`").
*   **Tests:** `packages/ui/src/lib/chat-failure.test.ts`: one case per row of the outcome table, `classifies sign-in, rate-limit and native-crash turn failures from code, then message`, `an unknown failure is Try again`. `packages/authoring/src/eve/messages.test.ts`: `hides tagged turns anywhere in the conversation, but not dojo:// links`.
*   **Change** `.github/workflows/verify.yml` (under "verify.yml"): the `test:prepared` step, the renamed interactive step and the `verify` job's 50-minute limit.
*   Check: `pnpm --filter @dojofoo/ui test --exclude '**/*.live.test.ts'`, the browser specs, `pnpm --filter @dojofoo/ui test:interactive`, `pnpm --filter @dojofoo/ui test:lesson`; the PR's `verify` run time is noted in the PR description.

### Commit 10: Tier A for step 4

*   **Change** `packages/authoring/src/eve/conformance.test.ts`: `implementedStep = 4`; bodies for the cases under "Conformance cases"; `ConformanceCase.agents` becomes `"tier-a" | "scripted" | readonly TierAAgent[]` and the runner registers a listed case only for those agents.
*   **Change** `packages/authoring/src/eve/conformance.fixture.ts`. Read-only cases go through production code; only credentials come from the fixture:
    *   `readOnlyAdapter(endpoint, home)` builds the adapter with the wiring's `auth` merged into `readOnlyAdapterSettings(agent, caseEnvironment)` and wraps `deny` rows with `withoutBuiltinFiltering`, both imported from `@dojofoo/agent/read-only`, so the adapter settings tier A runs are the ones `agentAdapter(…, { mode: "read-only" })` builds (Pi without `agentDir`).
    *   `runSenseiModel(context, endpoint, tools)` builds the sandbox environment with the production `readOnlyEnvironment(agent, context.environment(endpoint), { stateDirectory: <case DOJOFOO_HOME>/state, eveSessionId })` and drives `experimental_createHarnessModel(…, { mode: "read-only", agent, eveSessionId, onPrevention })` with `doStream`, collecting prevention records.
    *   Grok needs no fixture-only home preparation: its loopback models are `[models]` and `[model.*]` tables in the case `GROK_HOME/config.toml` (`:111-120`), which `readOnlyEnvironment` copies into the private home (fact 4).
    *   The host child's `DOJOFOO_HOME` is `<case home>/.dojofoo` (`caseBaseEnvironment`, step 3), so the private homes, Sensei's scratch directory and the process records all sit under the case root and the native-process markers cover them.
    *   `nativeNames` is `readOnlyToolNames(agent, eveToolNames).native` from `@dojofoo/agent/read-only`, plus the wiring's named extras with a reason each; `adversarialCalls` and `nativeWrite` give per agent the native names and the input shape of the adapter's `builtinTools[<key>]` schema at the pinned version.
    *   `runHost(scenario, persona, …)` replaces `runKyoshiHost`, with the host-port fixture's URL.
*   **Change** `packages/authoring/scripts/conformance-host.mjs`: scenarios `ask-answer-across-restart`, `cancel-pending-host-tool`, `resume-after-eviction`, `crash-after-park` and `restart-only` for `kyoshi` and `sensei`, plus `host-tool-turn` and `model-switch` for `sensei`; argument `--persona`, `--host-port <url>`, `--workspace-id`; each `started` line prints the start's secret.
*   **Change** `packages/authoring/scripts/conformance-record.mjs`: nothing (it already reads `observations.absolutePathReads` and `userConfig`, `:49-50`).
*   **Change** `.github/workflows/verify.yml`: the `conformance` job's `timeout-minutes` from 40 to 60 (decision 13).
*   Check, from a clean install and `pnpm --filter "@dojofoo/authoring..." build`: `pnpm --filter @dojofoo/authoring conformance` on this machine passes every step-3 and step-4 case for claude, codex, grok, opencode, fx and pi; the PR's `conformance` job is green. If `sensei.isolation.user-config` fails for an agent, the implementer stops and reports it with the observed markers (D24); it is not marked expected-fail (step 3 decision 4).

### Commit 11: The step-4 tier-A record, from the Linux CI run

*   As step 3's commit 7: download the `conformance` artifact of the PR's run at commit 10, run `DOJO_CONFORMANCE_OUT=<artifact> pnpm --filter @dojofoo/authoring conformance:record`, and commit the six appended entries (tier `A`, step 4, `personas.kyoshi: "pass"`, `personas.sensei: "untested"` (enforced before step 5), `userConfig.kyoshi` and `userConfig.sensei`, `absolutePathReads` from the case).
*   **Change** `docs/designs/agent-runtime.md` (same commit, text only):
    *   "Coding-agent registry", the user-config bullet: "User-config isolation for read-only personas: the sandbox environment, private home and adapter settings that keep the user's configuration from loading (D34), per agent in `agent-runtime.steps/step-4.md`, 'Per-agent isolation and prevention'".
    *   "Write prevention", the "User config" bullet: the same reference instead of "the CLI with the row's user-config isolation flags".
    *   Open risks 1, 3, 8, 10, 11 and 13 each gain "Step 4: <case id>; see the conformance record" for the agents tier A covers.
    *   D34's row appends: "Until a passing Sensei conformance record exists for an agent tier A cannot drive (Cursor), interactive Sensei refuses it (step 4).".
*   Check: the PR's `conformance` job is green and its compare step reports `kyoshi pass` for six agents, now and recorded.

## Conformance cases (step 4)

Levels: **harness** runs the adapter under `HarnessAgent`; **model** runs `experimental_createHarnessModel` in `read-only` mode, the path Sensei's model takes; **host** runs the persona's prepared Eve host in a child (`conformance-host.mjs`) against the host-port fixture in the test process. Every case still ends with `expectNoNativeProcesses`; the private home and Sensei's scratch directory are under the case root, so the markers cover them.

| id | agents | level | asserts |
| --- | --- | --- | --- |
| `kyoshi.host.cancel-pending-host-tool` | tier A | host | Kyoshi parks on `dojo_ui_ask`; the driver cancels with the paused `turnId`; the fixture records `turn.settled` `cancelled`; 0 native processes within 10 s (the hook evicted). |
| `kyoshi.host.resume-after-eviction` | tier A | host | Park, cancel (evicts), then "Continue the lesson." replies "Ready to teach." and its main-loop request carries "Help me author a course.". |
| `kyoshi.host.processes-after-host-crash` | tier A | host | `crash-after-park`: after the park, the fixture `SIGKILL`s the driver's process group; native groups survive (out-of-process agents: count > 0); `restart-only` starts and closes a host for the root (the reaper runs before start); 0 native processes. |
| `kyoshi.harness.native-write` | tier A | harness | The loopback requests the agent's native write of `course/native.md` (`nativeWrite`); the file exists with the content. Control for Sensei's denials. |
| `sensei.interactive.host-tool-turn` | tier A | host | The loopback calls `dojo_context` once (suffix match, the agent's discovery step); the fixture's `context` ran for the tool call once with key `<session>:<callId>`; a later request carries the context marker; the first request carries the `onMessage` context marker exactly once; the reply is "Ready to teach.". |
| `sensei.interactive.ask-answer-across-restart` | tier A | host | `ask_question` parks ("Which learner?"); the fixture records `turn.paused`; the host restarts with a new secret (the bearer the fixture sees changes); a plain-text answer "Beginner" (a message, not structured answers) continues the turn; reply "Ready to teach."; `turn.settled` `completed` recorded. |
| `sensei.interactive.cancel-pending-host-tool` | tier A | host | The fixture's `context` waits until the case cancels; `turn.settled` `cancelled`; 0 native processes; no loopback request for 2 s after. |
| `sensei.interactive.resume-after-eviction` | tier A | host | As Kyoshi's form, on Sensei. |
| `sensei.interactive.model-switch` | tier A | host | The fixture's `session` answers the first model, then (from the second turn) the second; the second turn's main-loop request has the second wire model, carries the first prompt, and the session id is unchanged. |
| `sensei.read-only.tool-list` | tier A | model | One turn with the Eve tools `ask_question` and `dojo_context`: every recorded `toolLists` entry is within the row's read-only native names, the host tools under the agent's prefix, and the wiring's named extras. |
| `sensei.read-only.adversarial-native-calls` | tier A | model | For each of the agent's native write, edit, create, delete and shell calls (`adversarialCalls`, requested by name whether offered or not): the course and scratch snapshots are unchanged; no `tool-approval-request` part leaves the model stream; every attempted call either has a prevention record or a failed native result; a `native-call-outside-allow-list` record with `failed: false` fails the case. Settles open risk 1 for Grok. |
| `sensei.read-only.user-mcp-write` | tier A | model | The user-config seeds are written; the loopback asks for `dojo_seeded_write` by suffix; `seeded-mcp-wrote` does not exist. Open risk 10. |
| `sensei.isolation.user-config` | tier A | model | D34: with the seeds written to the user's home and config homes (step 3's `userConfigSeeds`), one read-only turn replies "Ready to teach."; no request contains `DOJO_SEEDED_SKILL_MARKER` or `DOJO_SEEDED_RULES_MARKER`; `seeded-mcp.log` does not exist; observed as `userConfig.sensei`. Kyoshi's `userConfig.kyoshi` from step 3 is the control. |
| `sensei.read-only.absolute-path-reads` | tier A | model | The loopback requests a native read of `<root>/outside/secret.txt` (a marker); whether the marker reaches a later request is recorded as `absolutePathReads`; the case passes either way (open risk 13). |
| `sensei.resume-failure.one-replacement` | tier A | model | First turn with a real sandbox; the second call's prompt carries that checkpoint, and the sandbox provider's `resumeSession` throws: `onResumeFailure` ran once, the call failed with `ResumeFailedError` and no `statusCode`, and a fresh model call with no checkpoint (the replacement the UI server makes) replies "Ready to teach.". The UI server's "exactly once" is `default.test.ts`'s two-tab test. |
| `sensei.host-port.rerun-no-duplicate` | tier A | host | The driver kills the host child right after the fixture saw `dojo_context`'s call, restarts it, and Eve reruns the step: the fixture's handler ran once per distinct key, and the rerun reused the same key. |
| `sensei.acp.rerun-after-model-change` | grok | model | Turn on the first model, then a rerun of the same call (same prompt and checkpoint) on the second: it completes, or fails with a typed error; the outcome is observed (accepted residual risk). |
| `sensei.acp.model-probe` (new) | grok | harness | `acpModels("grok", …)` under the fixture `GROK_HOME` and key lists the fixture models; a snapshot of `GROK_HOME` (without `bin`) is unchanged after the probe (open risk 3, Grok's part). Cursor's part is tier B. |

Step 5's and later cases stay `it.todo`. `sensei.*` results appear in `cases` but `personas.sensei` stays `"untested"` until step 5 (step 3's record schema).

## The rewritten `test:interactive` (`packages/ui/scripts/verify-interactive-runtime.mjs`)

The setup stays: the built CLI, two interactive courses (`first`, `second`) with private `DOJO.md` guidance, the loopback model, a fresh `DOJOFOO_HOME`, `XDG_*` scratch dirs, `OPENAI_API_KEY`/`OPENAI_BASE_URL` for the loopback, and `OPENCODE_BIN` for model discovery. The workspace's `.dojo/runtimes.json` is `{ "agent": "opencode", "models": { "opencode": "openai/gpt-4o" } }`. `EVE_BASE_URL` and `OPENCODE_CONFIG_CONTENT` go (the adapter writes its own config; OpenCode reads the OpenAI variables, as in tier A's host child). The loopback uses `selectResponsesTool` to call `ask_question` only for the prompt "Ask me which example I prefer.". Checks, in order:

1.  Opening `/session/<runId of first>` shows the material and creates exactly one Sensei record for `(first)` (via `GET /api/v1/workspaces/<id>/sessions`), with `courseId: "first"` and `model: "openai/gpt-4o"`.
2.  **Begin turn hidden:** a main-loop request carries "Begin the lesson." and `PRIVATE-GUIDANCE-first`; the chat shows "Ready to teach." and neither "Begin the lesson." nor `[dojo:begin]`.
3.  A reload opens the same session id and sends no second begin request.
4.  A learner message gets "Ready to teach."; its request carries `PRIVATE-GUIDANCE-first` and "Material from first" and not `PRIVATE-GUIDANCE-second`.
5.  Answering "sidebar" on the question slide, then a message: the request carries `"answer":"sidebar"` (the per-turn context).
6.  **Model switch:** the composer's Model menu lists `openai/gpt-4o-mini`; picking it answers 200 on `PATCH`; the next request's wire model is `gpt-4o-mini`; the record has `revision: 1` and `runtimes.json` `models.opencode` is the new id.
7.  **Cancel:** a held response, then Stop: the loopback connection closes, the stream's `turn.settled` is `cancelled`, the record's lifecycle is `idle`, and no process under `.harness-bootstrap/opencode` remains within 10 s.
8.  **`ask` answered by text:** "Ask me which example I prefer." shows the question; typing "the second one" in the composer and sending answers it; the reply is "Ready to teach." and a later request carries "the second one".
9.  **No approval prompt:** the session's events (snapshot through the session API) have no `interaction.opened` of kind `approval` or `budget`, and the page showed no approval card at any point.
10. A server restart opens the same session, with the model kept and the transcript restored ("Explain what I missed" visible, the begin turn still hidden).
11. The second course opens its own session (a different id, its own begin turn); returning to the first reopens its session.
12. The course source is unchanged, `PRIVATE-GUIDANCE-` never appears in the visible chat, and the page logged no errors; the desktop and phone screenshots are kept as before.

`--context-only` keeps its purpose through the API: it reads the launch token from `GET /api/control/launch-token`, opens `POST /sessions/default` for each course, sends one message with Eve's client at the session's URL, and checks own-course guidance only.

## verify.yml

Final diff of `.github/workflows/verify.yml` for the step:

*   After `pnpm --filter @dojofoo/authoring test --exclude '**/*.live.test.ts'` (`:46`), add `- run: pnpm --filter @dojofoo/authoring test:prepared` (commit 9; the gate's `test:prepared` for both personas, not run in CI today, fact 12).
*   The step "Verify interactive courses with native local inference" (`:72-73`) is renamed "Verify interactive courses on Eve with local inference"; the command is unchanged. Its first run bootstraps OpenCode 1.18.34 into the runner's `~/.ai-sdk-harness` through mise, which the job already provides.
*   The global `@opencode/cli@2.0.28` install stays: `test:lesson` (ACP) and OpenCode model discovery use it.
*   The browser spec list is unchanged (no spec joins or leaves in this step; two specs only drop a dead mock).
*   The `conformance` job's `timeout-minutes` becomes 60 (commit 10).
*   The `verify` job's `timeout-minutes` becomes 50 (commit 9, decision 21).

## Constraints for this step's plan, one by one

1.  **B4.** Commit 2 makes `read-only` the default for a missing mode, and in the same commit Kyoshi's model (`packages/authoring/src/eve/agent.ts:32-37`) passes `mode: "full"`, `agent` and `eveSessionId: ctx.session.id` in `sessionOptions`, and `agentAdapter(…, { mode: "full" })`. Every other caller names `mode: "full"` too (fact 9).
2.  **Pre-delivery classification and `deliveryId`.** `classifyEveRequest` and the proxy's `deliveries.before`/`after` with Eve's `deliveryId` land in commit 7; step 5 adds only the `course` and `lesson` list filters.
3.  **Interactive Sensei's context, instructions and tools.** Context source: `getInteractiveLesson` (without references) and `DOJO.md`, through host-port `context`, delivered per turn by the channel's `onMessage` `clientContext` and on demand by `dojo_context`. Instructions: `DOJOFOO.md` + `NATIVE.md` (static), and `INTERACTIVE.md` + the course's `DOJO.md` (dynamic, per session); `INTERACTIVE.md` is today's `conversation.ts:22-27` text. Tools: `ask_question` and `dojo_context`. The kata-shaped `observe` and `show` handlers (`saveLearnerObservation`, `dojoLessonFragment`, `formatLessonContext`) are not offered to interactive Sensei; `context` is generalised by course type.
4.  **Isolation, limits, retention, open risk 11.** Isolation from the registry rows is applied when the CLI starts, through `readOnlyEnvironment` (sandbox environment and private home) and `agentAdapter(…, { mode: "read-only" })` (adapter settings) on every Sensei model call. Sensei sets `limits.sessionTimeoutMs: false`, `limits.sessionUsage: false` and `retention: "default"`; Kyoshi sets `retention: "default"`. Open risk 11's test: `an ended session stays readable after a host restart (retention "default", open risk 11)` (`runtime.test.ts`), repeated for Sensei in `verify-agent.mjs`.
5.  **Session API shapes as an interface block.** Under "Session API interface": `select` (unchanged), `POST /sessions/default` with `{ session, rewrite, notice? }` and what `from` does, `sessions.update`, the default lookup (`openDefault`), `PATCH /sessions/{id}`, and the models route.
6.  **The default lookup** takes the newest record for the page key on the selected agent: usable → return it; unusable → the Replacement rule; none → create (`openDefault`, steps 2-5).
7.  **The in-process lock** assumes one UI server per `DOJOFOO_HOME`; step 5's server lock closes the gap. Accepted interim, stated under "Session API interface".
8.  **Failed-turn classification** reads `turn.settled.data.error` (`code`, then `message`) with "Try again" as the default (`classifyTurnFailure`); per-adapter codes stay unverified until tier A records them.
9.  **Prompt contracts** move to `packages/authoring/src/sensei/contracts/` with the `./sensei/contracts/*.md` export, and every reader changes: `service-state.test.ts:10`, `packages/evals/src/transformation.ts:15,19`, `introduction-scenario.ts:33,37`, `lifecycle.ts:22,26`, `packages/ui/src/server/lesson/instructions.ts:2-4`, `instructions.test.ts:2-4`, `packages/authoring/src/evaluation/material-support.live.test.ts:36`, `lesson-design.live.test.ts:80`, `packages/ui/src/server/lesson/teaching-comparison.live.test.ts:139` (old and new path), plus the two READMEs and three comments; `docs/research/kata-teaching/evidence.json:133` stays (decision 20). Authoring's tsup entries derive from `exports`; no tsup edit.
10. **Nitro close** closes every persona host (`closePersonaRuntimes()`, commit 7).
11. **`verify-agent.mjs`** covers Kyoshi and Sensei (commit 5), and CI runs it (commit 9).
12. **Tests importing the removed interactive code:** `interactive/conversation.test.ts` is deleted; `interactive/routes.test.ts:9` and its two ACP tests go, and a 404 test joins (commit 9).

## Gate

From a clean `pnpm install --frozen-lockfile`:

*   `pnpm build`, then `pnpm -r --if-present types:check`; `pnpm lint:deps`.
*   Unit tests: `pnpm --filter @dojofoo/protocol test`, `pnpm --filter @dojofoo/ui test --exclude '**/*.live.test.ts'`, `pnpm --filter @dojofoo/authoring test --exclude '**/*.live.test.ts'`, `pnpm --filter @dojofoo/agent test`, `pnpm --filter @dojofoo/agent-api test`, `pnpm --filter dojofoo test`, `pnpm --filter dojofoo test:package`.
*   The named tests, by area:
    *   default conversation: `packages/ui/src/server/agent-session/default.test.ts`, the two `/sessions/default` cases in `packages/agent-api/src/app.test.ts`, the launch-token case in `packages/ui/src/server/launch-token.test.ts`
    *   records: `packages/ui/src/server/agent-session/records.test.ts`, the record cases in `app.test.ts`, `packages/cli/test/agent-selection.test.ts`
    *   host port: `packages/agent/test/host-port.test.ts`, `packages/ui/src/server/host-port.test.ts`, `packages/agent/test/persona-host.test.ts`
    *   lifecycle: `packages/agent/test/lifecycle.test.ts`, `packages/ui/src/server/agent-session/lifecycle.test.ts`, `packages/agent-api/src/delivery.test.ts`, `packages/ui/src/server/agent-api.test.ts` (idle stop, reconcile)
    *   prevention and isolation: `packages/agent/test/read-only.test.ts`, `harness-sessions.test.ts`, `process-groups.test.ts`
*   `pnpm --filter @dojofoo/authoring test:prepared` (both personas).
*   Browser specs: `agent-chat.spec.ts eve-authoring.spec.ts learner-pages.spec.ts workspace-loading.spec.ts agent-selector.spec.ts`.
*   `pnpm --filter @dojofoo/ui test:interactive` (rewritten, on Eve) and `pnpm --filter @dojofoo/ui test:lesson` (unchanged, ACP).
*   Tier A: `pnpm --filter @dojofoo/authoring conformance`, with every step-3 and step-4 case passing for claude, codex, grok, opencode, fx and pi (the Grok-only cases for Grok), later cases todo; the CI `conformance` job green, and after commit 11 the record holds the step-4 entries.

## Decisions made in this plan

1.  **Claude Code's `--setting-sources ""` is `CLAUDE_CODE_SAFE_MODE=1` in the sandbox environment, plus `strictMcpConfig`, `ENABLE_CLAUDEAI_MCP_SERVERS=false` and two extra guards.** The adapter has no way to pass flags or `settingSources` (fact 2), and the bundled CLI's safe mode turns off exactly what D34 lists while keeping the login. A private `HOME` or `CLAUDE_CONFIG_DIR` would lose the keychain login. Safe mode may also hide the adapter's own `harness-tools` MCP server; commit 5's scratch check decides before tier A is written, and the fallback (the other three variables, `strictMcpConfig` and `skillOverrides`, without safe mode) keeps host tools while turning off rules, claude.ai connectors, user MCP servers and user skills; plugins and hooks then rely on the tool allow-list and approval refusal. The D34 case decides whether either holds.
2.  **Private homes are per agent under `$DOJOFOO_HOME/state/read-only-homes/`, with the bootstrap and named login files linked back; Grok's is per Eve session.** One fixed home avoids a fresh bootstrap per host (a moved `HOME` moves `~/.ai-sdk-harness`; links make a new home cheap), and linking only named files keeps the user's configuration out. Grok writes each session's instructions, which hold the course's `DOJO.md`, into `$HOME/.grok/AGENTS.md` (fact 4), so a shared home would leak one course's guidance into another's parallel session; a per-workspace home would still mix two courses of one workspace. Judges and the simulated learner (step 7) are read-only too and can share the per-agent homes.
3.  **Per-turn context reaches the model through the Sensei channel's `onMessage` `clientContext`, from host-port `context`.** It matches today's per-turn ACP context resources, is not kept in history (so evidence and transcripts never contain guidance), and replaces anything the browser sends. `dojo_context` stays as the on-demand tool and as the host-port path tier A tests. Whether a turn's `clientContext` placed after a host-tool result causes an extra native prompt in `harness-model.ts` is unverified; `sensei.interactive.host-tool-turn` checks that the context arrives once.
4.  **The course style and `DOJO.md` are dynamic instructions memoised per session; the model is memoised per turn.** A session never changes course, so its instructions stay stable for the native agent; a model change must wait for the next turn started by a delivery (D26).
5.  **Sensei's model and course come from a host-port read (`session`), not from reading `agent-sessions.json` in the Eve host.** The UI server stays the only reader and writer of records, and tier A can script the answers through the fixture.
6.  **Idle stop counts proxied requests and open proxied streams as presence until step 5's page sockets exist.** No socket for interactive pages exists in this step, and Alternative I rejected an idle timer for leaving, not for stopping an unused host.
7.  **`agent_not_offered` for a missing CLI is checked only for Cursor.** The other agents bootstrap their own pinned CLI or run in-process, so a missing global CLI does not stop them; Cursor's local binding needs the installed `cursor-agent`.
8.  **The host port is reached at `127.0.0.1:<PORT>`, not `DOJO_UI_BASE_URL`.** In portless mode the base URL is TLS through a proxy with its own CA, which the Eve host's `fetch` may not trust. A wildcard or empty `HOST` maps to loopback; unverified for a server bound only to `::1`.
9.  **Pi runs with `reattachInProcess: false` for both personas, and read-only Pi gets the user's providers and credentials instead of `agentDir`.** With a new `HarnessAgent` per call a parked Pi session cannot be reattached, and one whose turn is cancelled stays in memory (fact 7); recovery from the checkpoint already passes `kyoshi.host.ask-answer-across-restart` on Pi, which cannot reattach either. Passing `providers` and `credentials` keeps the models `piModels` lists usable without loading Pi's settings or packages. `PI_OFFLINE` is dropped: the in-process adapter never sees a sandbox environment (fact 7).
10. **`replacedBy` and `endedAt` land in this step, `firstMessage` in step 6.** The Replacement rule that step 4's default lookup uses writes the first two; nothing in this step needs `firstMessage` (step 6 depends on step 5's pre-delivery hook for it).
11. **Kyoshi's tool set is unchanged.** The design's `defaultTools: false` belongs to the read-only personas' builds; turning off Kyoshi's Eve defaults now would change authoring behaviour this step does not test. Kyoshi gains only the lifecycle hook, `retention: "default"` and `mode: "full"`.
12. **`POST /sessions` keeps working for Kyoshi with the message in the body until step 6.** `greeting` must go in this step and Kyoshi's pages move to the default route only in step 6; the browser already holds `KYOSHI_START`.
13. **The conformance job's limit becomes 60 minutes.** Step 4 adds about 17 cases per agent (six host-level at roughly 15-20 s, eleven model- or harness-level at roughly 6 s, from step 3's timings), about 2.5-3 minutes per agent, so the run grows by 15-18 minutes over step 3's estimate of 15-20.
14. **The models route uses the session API's collection shape (`{ data, pagination }`).** The design names the element type (`ModelChoice[]`); every other collection in `/api/v1` is paginated, and `app.test.ts` checks the shape.
15. **`resume-failure.one-replacement` is split.** Tier A shows the harness side per agent (one report, no retry, a fresh session answers); the UI server's "exactly once across tabs" is a unit test, because tier A runs in `packages/authoring`, which may not import `packages/ui`.
16. **Two Grok-only cases (`sensei.acp.rerun-after-model-change`, `sensei.acp.model-probe`) run through a per-case agent list.** Registering them for every agent would record a pass for agents they do not apply to.
17. **The begin turn's failure is handled inside `POST /sessions/default`.** The design's `replaced` message travels on the lesson socket, which interactive pages do not have until step 5; answering with the replacement keeps the browser on one path.
18. **Sensei sessions' refusal of `/compact` and `/clear` lands with step 5's server-sent turns.** It is listed under "Server-sent turns" and is not in step 4's Builds; the chat never calls either route.
19. **Interactive Sensei refuses Cursor until a passing Sensei conformance record exists (orchestrator decision, 2026-11-04; fail closed).** The rule is `latestConformance(committedConformance(), "cursor")?.personas.sensei === "pass"`, which never holds in step 4 (`personaRecordedFrom.sensei` is 5). It is checked in `connect` for persona `sensei` and in `openDefault` before any Eve call, answering 409 `agent_not_offered` ("Cursor can't teach here yet: its Sensei checks haven't passed. Choose another coding agent."), whose "Choose another agent" buttons leave Cursor out. It applies to Cursor only, the one offered agent whose D34 isolation tier A cannot show; applying it to every agent without a passing Sensei record would refuse OpenCode and break `test:interactive`. It is not checked at `select`, because kata Sensei on ACP still runs on Cursor in this step. Tests: `packages/ui/src/server/agent-api.test.ts` and `default.test.ts`. To read the record the UI server needs it shipped: protocol exports `./conformance.json` (commit 1).
20. **Rejected: editing `docs/research/kata-teaching/evidence.json:133`.** It records the path the policy had when that research evidence was captured; rewriting it would falsify the record. Every code and test reader is changed.
21. **The `verify` job's limit becomes 50 minutes.** Added work, estimated from step 3's timings: `test:prepared` now boots two prepared hosts twice each plus a relocated copy (about 1-2 minutes), and `test:interactive` on Eve bootstraps OpenCode 1.18.34 on a cold runner (30-60 s, about 450 MB) and adds a begin turn, an `ask` turn and a cancel per course (about 2-3 minutes); about 3-5 minutes in all on a job that already holds the browser specs, `test:lesson` and the packed-CLI test under 40. The run time is noted on the step's PR, so a later step can lower it again.
22. **Rejected: verifying `use_tool`'s approval behaviour before writing the rule.** Grok is not logged in on this machine, and tier A's Grok runs with a fixture key; the approval rule (approve only a call to one of this turn's Eve tools) is correct whether or not `use_tool` asks, and `sensei.interactive.host-tool-turn` on Grok shows which.

## Open questions for the user

None. The one question this plan raised (Cursor and D34) was answered by the orchestrator and is decision 19.
