# Step 3 plan: conformance and the conformance record

*   **Design:** `docs/designs/agent-runtime.md`, "Implementation Roadmap", Step 3 (Approved 2026-11-03).
*   **Written against:** branch `eve-1`, HEAD `f5237a8` (steps 0, 1 and 2 done, plus the EPERM fix in `packages/agent/src/local-sandbox.ts`), worktree `.worktree/mobile`, on 2026-11-04. All `path:line` references are to that commit. Revised after the implementation-readiness and codebase-details reviews; each finding is either applied below or rejected with a reason under "Decisions made in this plan".
*   **Reader:** the implementer has only this plan and the design. Where the two disagree on a current line number, this plan is right; where they disagree on behaviour, the design is right unless "Decisions made in this plan" says otherwise and why.

## What this step delivers

A tier-A conformance matrix, `packages/authoring/src/eve/conformance.test.ts`, that runs every registry row with an adapter except Cursor (Claude Code, Codex, Grok, OpenCode, FX, Pi) against the loopback model, with every case tagged by persona and by the step that makes it pass. Step 3 makes the Kyoshi cases pass. Later cases are listed as todos with their step number, so tier A is green at the end of the step.

The step also adds an Anthropic Messages route to the loopback model, so Claude Code runs in tier A, and records each request's offered tools. The scripted HarnessV1 fixture learns to write, create and delete files. An append-only conformance record lands at `packages/protocol/src/conformance.json`, with scripts that install each agent's pinned CLI, run tier A, compare the result with the record and append to it. The CI `conformance` job runs tier A without logins or secrets. The step writes the Cursor, FX and Claude Code spike records and replaces FX's empty model list with `fx models --json`. It deletes `native-harness-contract.test.ts`.

Gate (design, Step 3): tier A for the cases this step makes pass (Kyoshi), and the unchanged ACP `test:lesson` and `test:interactive`, plus the common checks under "Verification Plan", from a clean `pnpm install --frozen-lockfile`.

## Facts checked on this machine (2026-11-04)

1.  **The adapters install their own pinned CLIs.** No global install is involved. `HarnessAgent.getSandboxTemplate().prepare()` (what `prepareAuthoringHarness` runs, `packages/authoring/src/eve/install.ts:10-21`) installs into `$HOME/.ai-sdk-harness/.harness-bootstrap/<harnessId>/node_modules/.bin/<cli>`. The source is the adapter's `src/bridge/package.json` and lockfile (`@ai-sdk/harness-acp` `src/v1/acp-v1-bootstrap.ts:79-88`: `npm-locked` sources run `${bootstrapDirectory}/node_modules/.bin/<executable>`). I bootstrapped each adapter into a fresh `HOME` and asked the installed binary for its version (all with `HOME` pointing at that fresh directory):

    | agent | adapter | installed CLI (version reported) | bootstrap time, size |
    | --- | --- | --- | --- |
    | claude | `@ai-sdk/harness-claude-code` 1.0.171 | `@anthropic-ai/claude-code` 2.1.290 ("2.1.290 (Claude Code)") | 12.3 s, 871 MB |
    | codex | `@ai-sdk/harness-codex` 1.0.169 | `@openai/codex` 0.160.1 ("codex-cli 0.160.1") | 7.6 s, 759 MB |
    | opencode | `@ai-sdk/harness-opencode` 1.0.169 | `opencode-ai` 1.18.34 ("1.18.34") | 10.0 s, 454 MB |
    | grok | `@ai-sdk/harness-grok-build` 1.0.105 | `@xai-official/grok` 1.0.49 ("grok 1.0.49 (8e66fdf1fd8e)") | 5.4 s, 416 MB |
    | fx | `@ai-sdk/harness-fx` 1.0.83 | none: `getSandboxTemplate()` returns nothing; `libfx` 0.0.14 runs in-process | n/a |
    | pi | `@ai-sdk/harness-pi` 1.0.170 | none: `@earendil-works/pi-coding-agent` 1.3.0 runs in-process (`pnpm-lock.yaml:1680`) | n/a |

    So the FX CLI (0.0.16 on this machine) and the user's OpenCode (2.0.28) are not what Eve runs. Kyoshi on OpenCode runs the adapter's 1.18.34.

2.  **Grok's launcher runs whatever is in `$GROK_HOME/bin`.** The bootstrapped `grok` is a Node launcher that runs `$GROK_HOME/bin/grok`, else `~/.grok/bin/grok` (`node_modules/@xai-official/grok/bin/grok-bootstrap.js:3,20-27`). With my real `HOME` the same bootstrapped launcher reported "grok 1.0.70". The registry's Sensei isolation for Grok keeps `GROK_HOME` at the user's real `~/.grok` (`packages/protocol/src/agents.ts:90`), so in production Grok runs the user's own binary, not the pin. Tier A runs 1.0.49 under a fixture `GROK_HOME`. This is why the record carries a CLI version range (see "The conformance record").

3.  **Claude Code runs against a loopback Messages endpoint without a login.** I used Claude Code 2.1.287 (`claude -p`) with a fresh `HOME`, `ANTHROPIC_BASE_URL=http://127.0.0.1:<port>` (no `/v1`), `ANTHROPIC_API_KEY=fixture-only` and `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`. It sent `HEAD /api/hello`, which got a 404 and did no harm, then one `POST /v1/messages?beta=true` with `stream: true`. It accepted a hand-written SSE text reply (`message_start`, `content_block_start`, `content_block_delta` `text_delta`, `content_block_stop`, `message_delta` `end_turn`, `message_stop`).

    With a seeded `~/.claude/CLAUDE.md`, a seeded `~/.claude/skills/<name>/SKILL.md` and a seeded `mcpServers` entry in `~/.claude.json`, the request carried the rules and the skill and offered a `WaitForMcpServers` tool. The seeded MCP tool's name was not in that first request. With `--strict-mcp-config --setting-sources ""`, the rules, the skill and `WaitForMcpServers` were gone. With `--tools Read,Grep,Glob` added, the request offered exactly `Glob Grep Read`. Not checked: tool use over this route, and the adapter's own bridge (claude-agent-sdk 0.3.290) instead of `claude -p`; the Claude Code spike (commit 5) checks both.

4.  **The test this step deletes is red for two agents.** `DOJO_HARNESS_LIFECYCLE=1 vitest run src/eve/native-harness-contract.test.ts`: Codex and OpenCode pass (15.5 s for both, bootstraps included), and Pi passes. Grok fails at `:96`. After the model-switch turn, Grok sends a background request ("Write an ultra-short dashboard line …") that has no conversation in it, and the test reads `endpoint.requests.at(-1)`. FX fails after the cancellation with the cancellation's own reason (`Error: Cancelled by the author`, created at `:127`). Which call rethrows it is unverified; the most likely is `resumed.stop()` at `:133`.

5.  **Kyoshi hosts leak state between tests in one Vitest process.** In `DOJO_HARNESS_LIFECYCLE=1 vitest run src/eve/runtime-turn.test.ts`, only the `runtime` selection passes. `native`, `grok` and `fx` time out at 180 s, and `codex` parks no question because the loopback receives no request (`paths: []`). Run alone, each passes: grok 12 s, fx 9 s, native 13 s, codex 10 s. Run as a pair (grok then codex), the second one fails. A plain Node script started two Kyoshi hosts for two course roots, one after the other, in one process, with the built `dist/eve/runtime.js`: both parked their question (11 s and 10 s). That held with different and with shared `HOME`s. The leak is therefore specific to running the host inside Vitest; its cause is unverified. This test is gated and not in CI.
6.  **Cursor is not logged in.** `cursor-agent` 2026.07.09-a3815c0, `cursor-agent status`: "Not logged in". The adapter's own launch, `cursor-agent --disable-auto-update acp` (`@ai-sdk/harness-cursor` `src/cursor-harness.ts:389-390`), answers ACP `initialize` (protocol 1, `loadSession: true`, `mcpCapabilities: { http, sse }`, auth method `cursor_login`). `session/new` returns -32000 "Authentication required". `cursor-agent --help` says `--trust` "only works with --print/headless mode".
7.  **Where FX lists models.** `fx models --json` (FX 0.0.16) prints `{"kind":"models","count":8,…,"ids":[…],"models":[{"id":"gpt-6.1-sol","source":"Codex subscription"},…]}` for the active provider. `libfx` 0.0.14 exports `listModels({ apiKey, fetch? }): Promise<string[]>`, but only for the AI Gateway catalog (`types/libfx.d.cts:79-85,1058`). `@ai-sdk/harness-fx` 1.0.83 has no model listing.
8.  **`main` has no branch protection** (`gh api …/branches/main/protection/required_status_checks` → 404 "Branch not protected"; `gh api …/rulesets` → `[]`). Nothing blocks a merge on any check today.
9.  **Vitest 5.0.5's JSON report.** `--reporter=default --reporter=json --outputFile.json=<file>` writes `{ testResults: [{ name, assertionResults: [{ ancestorTitles, title, fullName, status, failureMessages, … }] }], … }`.
10. **A Kyoshi host cannot be told to run Pi through the workspace.** `createKyoshiRuntime` picks its agent with `resolveAgent(courseRoot)` (`packages/authoring/src/eve/runtime.ts:52-53`). `resolveAgent` takes the saved `.dojo/runtimes.json` agent only when it is offered, then the onboarding choice under `$DOJOFOO_HOME` (else `~/.dojofoo`), then the first offered CLI on `PATH`, then `opencode` (`packages/config/src/runtime.ts:30-41,43-50,54-65`). `writeAgent` refuses agents that are not offered (`:70`). Pi is `acp: false` (`packages/protocol/src/agents.ts:116`) and `offeredAgents()` keeps only `acp` rows (`:137-139`). So `{ "agent": "pi" }` would silently run another agent, and a host case that relies on the workspace alone could record OpenCode's pass as Pi's.
11. **`libfx` and `@earendil-works/pi-coding-agent` export no `./package.json`.** Resolving `<lib>/package.json` from the adapter gives `ERR_PACKAGE_PATH_NOT_EXPORTED`. `module.findPackageJSON(<lib>, <adapter package.json path>)` (Node 22.14+, so present in Node 24 and 26) returns the right file for both. The adapters themselves do export `./package.json`.
12. **Claude Code's host tools are an in-process MCP server.** The adapter's bridge registers them as `mcpServers["harness-tools"] = { type: "sdk", … }` (`@ai-sdk/harness-claude-code` `src/bridge/index.ts:507-511`), so the model sees `mcp__harness-tools__<name>` (`:214`). `ToolSearch` is one of Claude Code's built-ins (`:120`). Whether the model is offered the host tool directly or only through `ToolSearch` is unverified; the Claude Code spike (commit 5) settles it.
13. **Pi compacts natively.** The deleted test never asserted Pi's compaction (`native-harness-contract.test.ts:114` skips Pi). Pi's `doCompact` calls `session.compact(customInstructions)` and lets Pi summarise (`@ai-sdk/harness-pi` `src/pi-session.ts:1750-1768`), so it takes custom instructions too. Pi's auth reads `OPENAI_BASE_URL` from `process.env` when no auth record is passed (`src/pi-auth.ts:332`).

## Conformance cases

### How a case is defined and marked

The case list is data in `conformance.test.ts`:

```ts
const implementedStep = 3;                                   // each later step raises it
/** Before this step the record says "untested" for the persona (design, Step 3 constraint 3). */
const personaRecordedFrom = { kyoshi: 3, sensei: 5 } as const;
interface ConformanceCase {
  id: string;                 // "<persona>.<level>.<name>", the record's key; never reused
  persona: Persona;           // from @dojofoo/protocol
  since: 3 | 4 | 5 | 6 | 7 | 8;
  tier: "A" | "B";
  agents: "tier-a" | "scripted";   // "scripted": runs once on the scripted HarnessV1 fixture (guard cases)
  title: string;
  run?(context: CaseContext): Promise<void>;
}
```

*   **Tier A agents** are `agentRows.filter(row => row.adapterId && row.id !== "cursor")`, giving claude, codex, grok, opencode, fx and pi, in registry order. If `DOJO_CONFORMANCE_AGENTS` (comma-separated) is set, the list is narrowed to those agents.
*   The file registers everything inside `describe.skipIf(process.env.DOJO_HARNESS_LIFECYCLE !== "1")("tier A", …)`, so the main verify job's `@dojofoo/authoring test` skips it, as it skipped the old contract test (`native-harness-contract.test.ts:17`).
*   A case with `since <= implementedStep` is registered as `it("<id> [<persona>, step <since>]", body, 240_000)` once per agent, inside `describe(<agent>)`.
*   A case with `since > implementedStep` is registered once (not per agent), as `it.todo("<id> [<persona>, step <since>]")` inside `describe("due in a later step")`. Vitest reports it as todo, and the run stays green.
*   A due case without a `run` body throws at collection: "`<id>` is due in step `<since>` but has no body". A step cannot raise `implementedStep` and leave a case behind.
*   There is no expected-fail marker. A body-less case cannot fail. An expected-fail marker on a real-CLI case would cost a full run per agent and hide why it fails. If a step 3 case cannot pass for an agent, the implementer stops and reports it, because D1 makes that agent unofferable.
*   **After every case** the body's `finally` closes everything the case opened (sandboxes, loopbacks, the host child). The runner then checks that the native process count is 0, polling for up to 10 s (see "Native process count"). A case that leaves a process fails, whatever its body did.
*   A `beforeAll` in `describe("tier A")` writes `<out>/cases.json`: `{ implementedStep, personaRecordedFrom, agents, cases: [{ id, persona, since, tier, agents }] }`. The record and compare scripts read it.
*   The same `beforeAll` is the only place the test file calls `prepareHarnessEnvironment`. It calls it once, with `caseBaseEnvironment()` (the allow-list under "Per-agent wiring", including `MISE_DATA_DIR` and `MISE_CACHE_DIR`), and keeps the returned `PATH` as `harnessPath`. Every case environment, harness-level sandbox and host child alike, starts from that `PATH`. Inside the host child, Kyoshi's build calls `prepareHarnessEnvironment()` again on every model call (`packages/authoring/src/eve/agent.ts:26`), and that call looks for mise under the case `HOME` (`packages/agent/src/runtime-toolchain.ts:14-18`). This is why the mise directories travel in every environment, so pnpm 10.34.5 is installed once per run, not once per case `HOME`.
*   `conformance-run.mjs` starts one Vitest process per agent (`DOJO_CONFORMANCE_AGENTS=<agent>`, report `report-<agent>.json`), so no adapter, Eve or module state is shared between agents in one worker (fact 5). The design's direct command still runs all agents in one process; it is for quick local checks only.

### Case list

Levels: **harness** runs the official adapter under `HarnessAgent`, configured the way Kyoshi's model is (`packages/authoring/src/eve/agent.ts:32-37`: no tool filter, default permission mode, `sandboxConfig: { workDir: "course" }`). **host** runs Kyoshi's prepared Eve host (`createKyoshiRuntime`) in a child process (decision 2).

Step 3 (Kyoshi; all six agents; these have bodies):

| id | level | asserts |
| --- | --- | --- |
| `kyoshi.harness.resume-after-stop` | harness | The turn "Introduce the lesson." replies "Ready to teach.". After `session.stop()`, `createSession({ sessionId, resumeFrom: JSON round-trip of the checkpoint })` (as `native-harness-contract.test.ts:66-71`) and "Continue the lesson." reply "Ready to teach.". The session id is unchanged, and the request carrying "Continue the lesson." also carries "Introduce the lesson.". This is the HarnessAgent-level form of resume after eviction. |
| `kyoshi.harness.model-switch` | harness | A fresh `HarnessAgent` with the agent's second model continues the resumed session (as `:77-100`). The main-loop request carrying "Continue with the newly selected model." (`requestsCarrying`, see "Per-agent wiring") has the second wire model, which differs from the wire model of the main-loop request carrying "Continue the lesson.". Both models are pinned per agent, so the two wire models always differ. It carries all three prompts, and the session id is unchanged. This keeps the OpenCode patch's regression coverage (`patches/README.md:32`). |
| `kyoshi.harness.host-tool-turn` | harness | `tools: { dojo_conformance_echo }`, whose `execute` returns `{ echoed: input.value }`. The loopback calls it once with `{ value: "receipt" }`, using the agent's discovery step. `execute` ran exactly once with that input. A later request carries `"echoed"`. The final text is "Ready to teach.". |
| `kyoshi.harness.cancel-active-turn` | harness | The loopback holds the response to "Wait for the model before answering." (as `:120-132`). While it is held, the native process count is above 0 for out-of-process agents; this is the positive control for the count. Aborting gives an `Error` that is not a `TimeoutError` and whose message matches `/aborted\|Cancelled by the author/i`. `session.stop()` resolves, or rejects with that same reason object (decision 9). |
| `kyoshi.harness.cancel-pending-host-tool` | harness | `tools: { dojo_conformance_wait }`, whose `execute` settles only on its `abortSignal`. The case aborts once `execute` has started. The turn ends with that abort, not a timeout, and `stop()` behaves as above. No loopback request arrives for 2 s after the stop. The `course/` directory (paths and bytes) is unchanged. This is the HarnessAgent-level form of R3-M21; the Eve form is in step 4. |
| `kyoshi.harness.compaction` | harness | `session.compact()` either resolves, after which `endpoint.requests.length` has grown and a following turn keeps the session id and reaches the loopback, or rejects with `name: "AI_HarnessCapabilityUnsupportedError"`. Anything else fails. The case holds an expected outcome per agent: OpenCode and Pi resolve, and Codex, Grok and FX reject (as `:114-118`). For Pi this is fact 13, unverified at runtime because the deleted test skipped Pi. For Claude Code, `compact()` resolves without a model request: the adapter only sends `/compact` on its bridge channel (`claude-spike.md`), so its case expects a resolve, no request count, and a following turn that keeps the session id and reaches the loopback. A change in either direction then fails the case. OpenCode also rejects custom instructions with "does not expose custom compaction instructions" (as `:101-105`); Pi passes them through. |
| `kyoshi.harness.user-config-seed` | harness | Writes the agent's user-config seeds (see "User-config seeds") into the case's `HOME` and config homes, then runs one turn, which must reply "Ready to teach.". It records, without asserting, whether the seeded MCP server was started and whether the skill and rules markers reached any request: `observations/<agent>.json` key `userConfig.kyoshi`. Step 4's D34 case uses this as its control. |
| `kyoshi.host.ask-answer-across-restart` | host | The driver starts Kyoshi's host on exactly this agent (see `conformance-host.mjs`), and the case first asserts that `.dojo/kyoshi-app/agents/kyoshi/runtime.json` has `harness` equal to the agent (the file `runtime-turn.test.ts:101` reads). Kyoshi's host asks through `dojo_ui_ask` and the turn parks with one interaction, "Which learner?". The host closes, and a new host for the same root answers "Beginner". The reply is "Ready to teach.". The requests carry Kyoshi's instructions (`instructions.content`), "Help me author a course." and "Beginner". There is exactly one question invocation (counted per agent as `runtime-turn.test.ts:124-130`, plus Claude Code and Pi: a tool ending in `dojo_ui_ask` once). Host cases open their root without `course/` (the course root is the case root, as in `runtime-turn.test.ts`), so at the end the root contains only `.dojo` and `home` (`:153`). |

Step 4 (todo now):

*   `kyoshi.host.cancel-pending-host-tool`: needs the lifecycle extension's stop-and-evict, because a host-tool turn detaches the native session today (`packages/agent/src/harness-model.ts:274-277`).
*   `kyoshi.host.resume-after-eviction`: needs `evictHarnessSession`.
*   `kyoshi.host.processes-after-host-crash`: SIGKILL the host child, restart it, and expect 0 native processes. Needs the reaper.
*   `kyoshi.harness.native-write`: Kyoshi's own native write tool changes a course file. This is the control for Sensei's denials.
*   `sensei.interactive.host-tool-turn`: uses the fixture host-port server.
*   `sensei.interactive.ask-answer-across-restart`, `sensei.interactive.cancel-pending-host-tool`, `sensei.interactive.resume-after-eviction`.
*   `sensei.interactive.model-switch` (D7).
*   `sensei.read-only.tool-list`: every recorded tool list is a subset of the row's read-only built-ins plus Eve's tools for that call.
*   `sensei.read-only.adversarial-native-calls`: native write, edit, create, delete and shell calls, requested by name. Each is denied or rejected with a typed record. The workspace and scratch directory are unchanged, and no approval reaches Eve.
*   `sensei.read-only.user-mcp-write`: open risk 10.
*   `sensei.isolation.user-config`: D34. No seeded marker in any request; the seeded MCP server is never started.
*   `sensei.read-only.absolute-path-reads`: open risk 13; fills the record field.
*   `sensei.resume-failure.one-replacement` (D28).
*   `sensei.host-port.rerun-no-duplicate`.
*   `sensei.acp.rerun-after-model-change`: ACP rows in tier A, which today means Grok; residual risk.

Step 5:

*   `sensei.kata.host-tool-turn` (check), `sensei.kata.ask-answer-across-restart`, `sensei.kata.cancel-pending-host-tool`, `sensei.kata.resume-after-eviction`.
*   Guard cases (agents `"scripted"`): `sensei.guard.write-restored`, `sensei.guard.delete-restored`, `sensei.guard.create-restored`, `sensei.guard.write-after-pause` (the accepted residual: not restored, and recorded), `sensei.guard.host-port-down-at-pause`.
*   `sensei.check.during-working-turn` (open risk 4).
*   `sensei.switch.timeout-marks-interrupted`, `sensei.switch.during-working-turn`, `sensei.host.start-after-eve-version-change`.

Step 6: `kyoshi.switch.away-and-back`, `sensei.switch.away-and-back` (D31), `kyoshi.switch.new-agent-new-session`, `sensei.switch.new-agent-new-session` (D29).

Step 7: `sensei.evaluation.trial-loopback`.

Tier B (step 8, registered with `tier: "B"`, also todo):

*   `sensei.tier-b.latency`: median time to first output at most 15 s; a slower agent is flagged.
*   `sensei.tier-b.leave-cancels-begin-turns`: N lessons, native process count and tokens.
*   `sensei.tier-b.two-hosts-one-agent`: open risk 6.
*   `sensei.tier-b.host-memory`, `kyoshi.tier-b.cold-start`.
*   Cursor runs the tier-A cases in tier B.

### Per-agent wiring (`conformance.fixture.ts`)

Harness-level adapters reuse the deleted test's proven settings (`native-harness-contract.test.ts:47-59`) and add Claude Code. Each case creates its own adapter, so nothing is cached across cases. Host-level cases use `agentAdapter` inside the prepared host, with the same values passed as environment variables (as `runtime-turn.test.ts:69-96`).

| agent | harness-level adapter | environment beyond `HOME`, `PATH` | first model | second model (selection → wire) | host-tool scripting | out of process |
| --- | --- | --- | --- | --- | --- | --- |
| claude | `createClaudeCode({ port: 0, auth: { ANTHROPIC_API_KEY: "fixture-only", ANTHROPIC_BASE_URL: endpoint.anthropicBaseURL } })`. An environment record selects direct mode (`claude-code-auth.ts:95-125`), so the gateway variables do not matter at this level. | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`, `DISABLE_AUTOUPDATER=1`. In the host child only, also `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `AI_GATEWAY_API_KEY=""` and `VERCEL_OIDC_TOKEN=""`: there `agentAdapter` creates `createClaudeCode({ port: 0 })` without auth (`packages/agent/src/adapters.ts:17`), which auto-detects from the environment, and either gateway variable would win (`:117`). | `sonnet` (pinned, wire `claude-sonnet-5-5`, matches `/sonnet/`) | `opus` → wire `claude-opus-5-5`, matches `/opus/` (`claude-spike.md`) | Messages route. The first request offers the host tool directly as `mcp__harness-tools__<name>` (fact 12), matched by suffix; Claude Code 2.1.290 offers no `ToolSearch`, so no fallback is needed (`claude-spike.md`). | yes |
| codex | `createCodex({ port: 0, auth: { OPENAI_API_KEY, OPENAI_BASE_URL } })` | `CODEX_HOME=<home>/.codex` (created) | adapter default | `gpt-5.4` → `gpt-5.4` | Responses with the loopback's client `tool_search` | yes |
| grok | `createGrokBuild({ port: 0, auth: { XAI_API_KEY, GROK_XAI_API_BASE_URL, GROK_MODELS_BASE_URL } })` | `GROK_HOME=<home>/.grok` with the `config.toml` from `:27-34` | `fixture-first` | `fixture-second` → `fixture-second` | Chat Completions (`responses: false`, `latencyMs: 250`), `selectChatTool` doing `search_tool` then `use_tool` (`runtime-turn.test.ts:38-51`) | yes |
| opencode | `createOpenCode({ port: 0, auth: { OPENAI_* }, provider: "openai", openCodeConfig: { small_model: "openai/gpt-4o", enabled_providers: ["openai"] } })` | `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_CACHE_HOME` under `home` | `openai/gpt-4o` | `openai/gpt-4.1` → `gpt-4.1` | Responses, direct | yes |
| fx | `createFx({ auth: { AI_GATEWAY_API_KEY, AI_GATEWAY_BASE_URL: <base without /v1> } })` | `FX_GATEWAY_BASE_URL`, `FX_GATEWAY_CHAT_URL`, `FX_DISABLE_KEYCHAIN=1`, `FX_E2E_DISABLE_DOTENV=1`, `FX_AUTO_UPGRADE=0` | adapter default | `openai/gpt-5.5` → `openai/gpt-5.5` (`ai-language-model-id` header) | gateway route, `discovery: capability_search` | no (in-process) |
| pi | `createPi({ agentDir: <home>/.pi/agent, auth: { OPENAI_* } })` | `PI_CODING_AGENT_DIR=<home>/.pi/agent` | `openai/gpt-4o` | `openai/gpt-4.1` → `gpt-4.1` | Responses, direct | no (in-process) |

For the host child, the Kyoshi model is `openai/gpt-4o` for OpenCode and Pi; the other agents use none. The child's environment adds `NODE_ENV=development`, `EVE_MOCK_AUTHORED_MODELS=0`, `CI=""` and `TEST=""` (the reasons are at `runtime-turn.test.ts:68-69,93-95`). It also puts `packages/authoring/node_modules/.bin` first on `PATH`. `agentAdapter("pi")` passes no `auth` (`packages/agent/src/adapters.ts:33-36`), so Pi reads `OPENAI_API_KEY` and `OPENAI_BASE_URL` from the child's `process.env` (fact 13); the child's environment carries both.

**Environments come from one allow-list.** `caseBaseEnvironment()`, exported by `conformance-install.mjs` so the scripts and the fixture share it, builds it:

*   `PATH`, `TMPDIR` and `LANG` from the caller.
*   `DOJOFOO_HOME=<case home>/.dojofoo`, so no Kyoshi code reads the developer's `~/.dojofoo` (fact 10).
*   `MISE_DATA_DIR=<DOJO_CONFORMANCE_HOME>/mise/data` and `MISE_CACHE_DIR=<DOJO_CONFORMANCE_HOME>/mise/cache`.
*   `HOME` set per case. A `HOME` is also set for the Vitest process itself: `<DOJO_CONFORMANCE_HOME>/runner-home`.

It is applied in three places:

1.  Harness-level sandbox environments.
2.  The host child's environment.
3.  The Vitest process itself. `conformance-run.mjs` spawns each Vitest process with the allow-list plus `DOJO_HARNESS_LIFECYCLE`, `DOJO_CONFORMANCE_*` and `CI`, because FX's and Pi's adapters run inside that process.

The developer's credentials (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, `OPENAI_API_KEY`, `CURSOR_API_KEY` and others) never reach a case (decision 10). The design's direct Vitest command inherits the caller's environment; only the harness-level sandboxes and the host child are allow-listed then, so that command is for quick checks, not for records.

**Finding the conversation's request.** `requestsCarrying(endpoint, text)` returns the main-loop requests whose JSON contains `text`. A main-loop request is one whose `toolLists[i]` is not empty: Grok's background summary request (fact 4) has no `tools`. Claude Code sent no side requests in its spike; every request offered tools (`claude-spike.md`). "The request for the newest prompt" is the last of these, never `requests.at(-1)` (decision 8). `requestedModels[i]` gives its wire model.

### User-config seeds

The fixture writes a seeded MCP server, `<root>/seeded-mcp.mjs`. It is a stdio JSON-RPC server that appends each method to `<root>/seeded-mcp.log` and offers one tool, `dojo_seeded_write`, which writes `<root>/seeded-mcp-wrote` when called; step 4's open-risk-10 case uses that. The skill's description is `DOJO_SEEDED_SKILL_MARKER`, and the rules file's text is `DOJO_SEEDED_RULES_MARKER`.

| agent | MCP server | skill | rules | source |
| --- | --- | --- | --- | --- |
| claude | `$HOME/.claude.json` `mcpServers["dojo-seeded"] = { type: "stdio", command, args }` | `$HOME/.claude/skills/dojo-seeded/SKILL.md` | `$HOME/.claude/CLAUDE.md` | fact 3 |
| codex | `$CODEX_HOME/config.toml` `[mcp_servers.dojo-seeded]` | `$HOME/.agents/skills/dojo-seeded/SKILL.md` | `$CODEX_HOME/AGENTS.md` | `sensei-isolation.md`, Codex |
| grok | `$HOME/.claude.json`, as for claude (Grok loads Claude's MCP servers) | `$HOME/.claude/skills/dojo-seeded/SKILL.md` | `$HOME/.claude/CLAUDE.md` | `sensei-isolation.md`, Grok |
| opencode | `$XDG_CONFIG_HOME/opencode/opencode.json` `mcp["dojo-seeded"] = { type: "local", command: [node, script] }` | `$XDG_CONFIG_HOME/opencode/skills/dojo-seeded/SKILL.md` | `$XDG_CONFIG_HOME/opencode/AGENTS.md` | `sensei-isolation.md`, OpenCode |
| fx | none (FX's MCP config format is unknown) | `$HOME/.agents/skills/dojo-seeded/SKILL.md` | none known | `sensei-isolation.md`, FX |
| pi | none (unverified that Pi has an MCP client) | `<agentDir>/skills/dojo-seeded/SKILL.md` | `<agentDir>/AGENTS.md` | unverified |

### Native process count

`nativeProcesses(markers)` lists processes other than `process.pid` whose command line contains any marker. On Linux it reads `/proc/<pid>/cmdline`; on macOS it runs `ps -axww -o pid=,command=`. The markers are the case root and the agent's shared bootstrap home, both in `realpath` form and as given. Because every case of an agent links the same `.ai-sdk-harness`, they also share its `.agent-runs` directory, where the harness keeps per-session state (`@ai-sdk/harness` `src/v1/harness-session-data-directory-path.ts:12-25`). Session ids are random, so cases do not collide. Since an agent's cases run one after another in one Vitest process, a process found under the shared home after a case belongs to that case. This works because each case's native binaries run from the bootstrap home (fact 1), and the host child runs from the case root. In-process agents (FX, Pi) have no child process of their own. For them the count covers the host child and anything they spawned with a marker in its command line.

## The loopback model (`packages/agent/experiments/model-provider/loopback-openai.mjs`)

The file keeps its name and path, which the design and two fixtures cite.

Every change is additive. The file has seven importers, and none of them changes: `packages/ui/scripts/verify-lesson-runtime.mjs`, `verify-interactive-runtime.mjs`, `packages/authoring/src/eve/browser.fixture.mjs`, `pi-workspace.test.ts`, `runtime-turn.test.ts`, the copy `run.mjs` makes for the packed consumer (`:68`), and the agent's own tests. They keep today's options, return fields and responses. New fields and options only appear next to the old ones.

*   **New Messages route.** `POST` whose pathname (from `new URL(request.url, "http://loopback")`) is `/v1/messages`.
    *   **Placement:** the branch goes after the held-response and `latencyMs` handling (`:20-28`), so `holdNextResponse` and `latencyMs` apply to it as to every route, and before the gateway branch at `:29`. Without it, `/v1/messages?beta=true` would get a Responses stream from the fallback at `:80`.
    *   **`/v1/messages/count_tokens`** is answered `{ input_tokens: 1 }` by a branch placed before `:17`, so it is never parsed into `requests`, `requestedModels`, `toolLists` or `routes`. It still appears in `paths`, which `:12` fills for every request.
    *   **Tool choice**, in order:
        1.  `selectMessagesTool?.(input, requestedTools)`, a new option shaped like `selectChatTool`.
        2.  A tool in `input.tools` whose `name` ends with `toolRequest.name` and has not been requested yet.
        3.  `toolRequest.discovery`, when the target is not offered, the discovery tool is offered and nothing has been requested yet, as the gateway route does at `:38-43`.
        4.  Otherwise text.
    *   **Streaming response:** `message_start` (`{ id: "msg_<n>", type: "message", role: "assistant", model: input.model, content: [], stop_reason: null, usage }`), then for text `content_block_start` (text) / `content_block_delta` (`text_delta`, "Ready to teach.") / `content_block_stop`. For a tool, it is `content_block_start` (`{ type: "tool_use", id: "toolu_lesson_<n>", name, input: {} }`) / `content_block_delta` (`{ type: "input_json_delta", partial_json: JSON.stringify(input) }`) / `content_block_stop`. Then `message_delta` (`stop_reason: "end_turn" | "tool_use"`) and `message_stop`. Each event is written as `event: <type>\ndata: <json>\n\n`.
    *   Without `stream`, it returns the same message as JSON.
*   **Recording.** It returns `anthropicBaseURL` (`http://127.0.0.1:<port>`, no `/v1`, fact 3) next to `baseURL`.
*   **Per-request tool lists.** New `toolLists: string[][]` and `routes: Array<"responses" | "chat" | "gateway" | "messages">`, one entry per recorded request. They are pushed next to `requests.push(input)` at `:18`, with the route taken from the pathname, so `requests[i]`, `requestedModels[i]`, `toolLists[i]` and `routes[i]` describe the same request.
    *   Names per route:
        *   Responses: every `tools[]` entry plus the tools in `tool_search_output` items, with namespaces flattened to their children's `name`; a tool without a name contributes its `type`.
        *   Chat: `tools[].function.name`.
        *   Gateway: `tools[].name`.
        *   Messages: `tools[].name`.
    *   The existing `requestedTools` keeps meaning "tools the model called".
*   **Tests**, added to `loopback-openai.test.mjs`, which runs in `@dojofoo/agent test`:
    *   `Messages streams one text reply and records the offered tools`
    *   `Messages calls a requested host tool once, then answers`
    *   `Messages answers without streaming`
    *   `Messages discovers a host tool that is not offered yet`
    *   `Messages can select a native tool without changing its input` (`Write`, `{ file_path, content }`)
    *   `every route records the tool names it offered` (a Responses namespace and a type-only tool, Chat, gateway, Messages)
    *   `count_tokens is answered without recording a request` (it is in `paths`, not in `requests`)
    *   `a held Messages response waits for release` (`holdNextResponse` applies to the new route)

## The scripted HarnessV1 fixture (`packages/agent/experiments/model-provider/host-agent.fixture.ts`)

*   The `doPromptTurn` of the fixture's harness (`:33-60`) matches `/^Native fs (\{.*\})$/s` on `turn.prompt`. The match runs after the instruction and tool checks (`:34-39`) and after `history.push(turn.prompt)` (`:40`), so a native-op turn still proves that the authored instructions and root tools loaded. It runs before the `pendingCall` selection at `:41`. The JSON is `{ op: "write" | "create" | "delete", path: string (absolute), content?: string, after?: "suspend", delayMs?: number }`. The fixture does the operation itself with `node:fs`, as a native CLI that runs as the user would: `write` uses `writeFileSync(path, content)`, `create` uses `writeFileSync(path, content, { flag: "wx" })`, and `delete` uses `rmSync(path)`.
    *   **Events it emits:**
        *   `{ type: "tool-call", toolCallId: "native-fs-<history.length>", toolName: "native_<op>", input: JSON.stringify({ path }), providerExecuted: true, dynamic: true }`, then `{ type: "tool-result", …, result: { path, done: true }, dynamic: true }`. A failure gives `isError: true` with the error message as the result.
        *   Then `finish-step` (`tool-calls`) and the normal `reply(turn)`.
        *   This follows `provider.test.mjs:559-566`.
    *   History gains `{ native: op, path }`. Native ops skip the "requested unavailable tool" check (`:55`), because providerExecuted tools are not in `turn.tools`.
*   With `after: "suspend"`, the prompt emits the existing `question` call instead, and `doSuspendTurn` (`:74`) schedules the operation after `delayMs ?? 0`. This models a parked native agent that writes after its turn paused: step 5's `sensei.guard.write-after-pause` and the accepted residual risk.
*   **`host.test.mjs`** gains a stage "native file changes" right after the "filesystem tools" stage, with `nativeFile = join(course, "native.md")`:
    1.  `create` → the file reads "Created natively.\n".
    2.  `write` → it reads "Changed natively.\n".
    3.  `delete` → `readFile` rejects with `ENOENT`.
    4.  `create` with `after: "suspend"` → the result is `awaiting-input`, and the file appears with "Written while parked.\n" (polled up to 5 s). Then answer the interaction with `optionId: "Continue"` and expect `completed`.

    This runs inside `run.mjs`'s packed consumer, which copies `host.test.mjs` at `run.mjs:74` and the fixture at `:78` and runs the test at `:105-107`, and so in the main verify job.

## The conformance record

*   **Path:** `packages/protocol/src/conformance.json`, next to the registry that step 5 makes read it. CI never writes it.
*   **Format:**

    ```json
    { "schema": 1, "entries": [ /* ConformanceEntry, append-only */ ] }
    ```

*   **Types and helpers** in new `packages/protocol/src/conformance.ts`, exported from `index.ts`:

    ```ts
    export type ConformanceTier = "A" | "B";
    export type PersonaConformance = "pass" | "fail" | "untested";
    export interface ConformanceEntry {
      agent: AgentId;
      tier: ConformanceTier;
      /** Full ISO 8601 timestamp with time and zone, for people. "Latest" is decided by array order. */
      recordedAt: string;
      /** The 40-character commit the run tested (in CI the PR head, not GitHub's merge commit), and its platform ("linux-x64", "darwin-arm64"). */
      commit: string;
      platform: string;
      /** The roadmap step whose cases ran (conformance.test.ts implementedStep). */
      step: number;
      adapter: { package: string; version: string };
      cli: { name: string; version: string; source: "adapter-bootstrap" | "in-process" | "user-install" };
      /** CLI versions this entry vouches for (semver range). Tier A writes "=<cli.version>"; tier B passes it explicitly. */
      cliRange: string;
      personas: Record<Persona, PersonaConformance>;
      /** Outcome of every case due at `step`, by case id. */
      cases: Readonly<Record<string, "passed" | "failed">>;
      /** Tier B latency (design, "Conformance tiers"): slow when the median is above 15 s. null until measured. */
      latency: { medianFirstOutputMs: number; slow: boolean } | null;
      /** Open risk 13: absolute paths a read-only persona could read. null until step 4's case runs. */
      absolutePathReads: ReadonlyArray<{ path: string; read: boolean }> | null;
      /** Which seeded user config reached the model, per persona (D34). */
      userConfig: Partial<Record<Persona, { mcp: boolean; skill: boolean; rules: boolean }>>;
      note?: string;
    }
    export interface ConformanceRecord { schema: 1; entries: readonly ConformanceEntry[] }
    /** Throws "Invalid conformance entry <index>: <field>" for any field above; also when step < 5 and sensei is not "untested",
     *  when recordedAt has no time ("2026-11-04"), and when a tier-A cliRange is not "=<cli.version>". */
    export function parseConformanceRecord(value: unknown): ConformanceRecord;
    /** The last entry for the agent (and tier, when given) in array order. */
    export function latestConformance(record: ConformanceRecord, agent: AgentId, tier?: ConformanceTier): ConformanceEntry | undefined;
    ```

*   **Persona results.** `personas[p]` is `"untested"` while `step < personaRecordedFrom[p]` (Kyoshi from 3, Sensei from 5). Otherwise it is `"pass"` when every due case of persona `p` passed for the agent, and `"fail"` when any failed. So Sensei stays `"untested"` through step 4, even though step 4's interactive Sensei cases run and appear in `cases`.
*   **CLI version and range.** `cli.version` is the version the case environment actually ran (fact 1). For Grok in production that is the user's `~/.grok/bin/grok` (fact 2), which is why tier B passes its own `cliRange`.
*   **New `packages/protocol/src/conformance.test.ts`:**
    *   `the committed record parses` (reads `./conformance.json` with `readFileSync`)
    *   `latest is the last entry in array order, whatever its timestamp`
    *   `latest can be narrowed to a tier`
    *   `rejects a timestamp without a time`
    *   `Sensei stays untested in entries recorded before step 5`
    *   `a tier-A range names exactly the CLI version that ran`

## Scripts (`packages/authoring/scripts/`)

All five are plain `.mjs`. They import only built packages (`@dojofoo/protocol`, `@dojofoo/agent/*`) or authoring's own `dist`, as `verify-agent.mjs:17-19` does. Defaults come from `conformancePaths()`, exported by `conformance-install.mjs`:

*   `DOJO_CONFORMANCE_HOME`, default `join(os.tmpdir(), "dojofoo-conformance-home")`: one shared bootstrap home per agent, `<home>/<agent>`.
*   `DOJO_CONFORMANCE_OUT`, default `packages/authoring/.conformance/`, which is gitignored: `report-<agent>.json` (one per Vitest process), `cases.json`, `versions.json`, `run.json` and `observations/`.
*   `DOJO_CONFORMANCE_COMMIT`, default `git rev-parse HEAD`: the commit an entry names. CI sets it to the PR head, because on `pull_request` `HEAD` is GitHub's merge commit, which no branch contains.

### `conformance-install.mjs`

The install script. It exports `conformancePaths`, `caseBaseEnvironment`, `tierAAgents`, `pinnedCli`, `installAgent` and `firstRunPins`, and when run directly it installs every tier-A agent, or the `DOJO_CONFORMANCE_AGENTS` subset. For each agent:

1.  **Adapter version:** read from `@ai-sdk/harness-<claude-code|codex|fx|grok-build|opencode|pi>/package.json`, resolved with `createRequire` from `packages/authoring/package.json` (the adapters export `./package.json`, fact 11). Call the resolved path `adapterJson`.
2.  **Pinned CLI (version source per agent):**

    | agent | version source | `cli.name` | bootstrap dir / binary | first-run pin |
    | --- | --- | --- | --- | --- |
    | claude | `join(dirname(adapterJson), "src/bridge/package.json")`, `dependencies["@anthropic-ai/claude-code"]` | `@anthropic-ai/claude-code` | `claude-code` / `claude` | 2.1.290 |
    | codex | same file, `@openai/codex` | `@openai/codex` | `codex` / `codex` | 0.160.1 |
    | opencode | same file, `opencode-ai` | `opencode-ai` | `opencode` / `opencode` | 1.18.34 |
    | grok | same file, `@xai-official/grok` | `@xai-official/grok` | `grok-build` / `grok` | 1.0.49 |
    | fx (no install command, `packages/protocol/src/agents.ts:106`) | `module.findPackageJSON("libfx", adapterJson)`, then its `version` (the package exports no `./package.json`, fact 11) | `libfx` | none: in-process | 0.0.14 |
    | pi (curl installer, `:115`) | `module.findPackageJSON("@earendil-works/pi-coding-agent", adapterJson)`, then its `version` | `@earendil-works/pi-coding-agent` | none: in-process | 1.3.0 |

    The expected version is the latest tier-A entry's `cli.version` for the agent, or `firstRunPins` when the record has none. If the adapter's pin differs from it, the agent fails with "`<adapter>` now pins `<cli>` `<x>`; the record has `<y>`. Run tier A and append a record (pnpm --filter @dojofoo/authoring conformance:record)."
3.  **Install:**
    *   The script creates `<home>/<agent>` with `mkdir -p` first.
    *   It then calls authoring's own `prepareAuthoringHarness` (imported from `../dist/eve/install.js`). It does not re-implement it. This step gives that function an options parameter (commit 6):

        ```ts
        // packages/authoring/src/eve/install.ts:10
        export async function prepareAuthoringHarness(agent: AgentId,
          options: { environment?: NodeJS.ProcessEnv; timeoutMs?: number } = {}): Promise<void>
        // environment defaults to `await prepareHarnessEnvironment()` (today's :16); timeoutMs defaults to 120_000 (today's :18)
        ```

        The bootstrap lands under the environment's `HOME` (fact 1). The function's own sandbox stays the `mkdtemp` directory it creates and `realpath`s today (`:14`), which `createLocalSandbox` requires to exist (`packages/agent/src/local-sandbox.ts:60`).
    *   The script passes `environment: { ...await prepareHarnessEnvironment(caseBaseEnvironment()), HOME: <home>/<agent> }` (plus `GROK_HOME=<home>/grok/.grok` for Grok) and `timeoutMs: 300_000`.
    *   The two existing callers keep the defaults: `packages/authoring/src/eve/harness-lifecycle.test.ts:19` and `packages/cli/src/index.ts:92`.
    *   For in-process agents, `prepareAuthoringHarness` returns at once (no template, `:13`). The script then checks that the library loads (`await import` from the adapter's directory).
4.  **Version actually run:** `<home>/<agent>/.ai-sdk-harness/.harness-bootstrap/<dir>/node_modules/.bin/<binary> --version`, with `HOME=<home>/<agent>` (and `GROK_HOME=<home>/grok/.grok`). The first `\d+\.\d+\.\d+` must equal the pin.
5.  **Output:** `versions.json` gets `{ [agent]: { adapter: { package, version }, cli: { name, version, source } } }`, or `{ [agent]: { error } }`. The script prints one line per agent and exits 0; `conformance-compare.mjs` decides what fails.

The test fixture imports `installAgent`, `conformancePaths` and `caseBaseEnvironment` (through a `// @ts-expect-error` import, as the loopback is imported). It installs lazily when an agent's binary is missing, so the design's direct command (Verification Plan) works without the script.

### `conformance-run.mjs`

1.  Creates the out directory and writes `run.json`: `{ commit: DOJO_CONFORMANCE_COMMIT ?? git rev-parse HEAD, dirty: git status --porcelain is not empty, platform, startedAt }`.
2.  For each tier-A agent (or the `DOJO_CONFORMANCE_AGENTS` subset), one after another, it runs `pnpm exec vitest run src/eve/conformance.test.ts --reporter=default --reporter=json --outputFile.json=<out>/report-<agent>.json` in `packages/authoring`. The environment is `caseBaseEnvironment()` plus `DOJO_HARNESS_LIFECYCLE=1`, `DOJO_CONFORMANCE_AGENTS=<agent>`, `DOJO_CONFORMANCE_HOME`, `DOJO_CONFORMANCE_OUT` and `CI`. This gives one process per agent (decision 16) and an allow-listed environment for the in-process adapters (decision 10).
3.  Adds `finishedAt` and `vitestExitCodes` (per agent) to `run.json`. It exits 1 only when an agent's report is missing; the compare script judges the results.

### `conformance-host.mjs`

The host-level case driver, run as a child process by the fixture: `node scripts/conformance-host.mjs ask-answer-across-restart <agent> <root> [<model>]`, cwd `packages/authoring`.

**Selecting the agent.** The workspace cannot select every tier-A agent: `resolveAgent` skips agents that are not offered, `writeAgent` refuses them, and Pi is not offered until step 5 (fact 10). So this step gives `createKyoshiRuntime` an explicit agent, used only by this driver:

```ts
// packages/authoring/src/eve/runtime.ts:52-53
export async function createKyoshiRuntime(courseRoot: string, options: { model?: string; agent?: AgentId } = {}) {
  const harness = options.agent ?? resolveAgent(courseRoot);
```

The runtime already writes `harness` into the host's `runtime.json` (`:95-101`), and Kyoshi's model reads it on every call (`agent.ts:25,35`). So the host runs exactly `options.agent`. `acquireKyoshiRuntime` (`:34`) and every other caller pass no agent and keep `resolveAgent`. The driver also writes no `.dojo/runtimes.json`, so nothing else can pick the agent. `DOJOFOO_HOME` in the child's environment points into the case `HOME`, so even a fallback to `resolveAgent` could not read the developer's onboarding choice.

1.  Imports `../dist/eve/runtime.js` and `@dojofoo/agent/client`. If `dist/eve/runtime.js` is missing, it exits 2 with "Build authoring first: pnpm --filter "@dojofoo/authoring..." build". It exits 2 as well when `<agent>` is not an id with an adapter.
2.  `createKyoshiRuntime(root, { agent, ...(model ? { model } : {}) })`, then `start()`. It reads `<root>/.dojo/kyoshi-app/agents/kyoshi/runtime.json` and prints `CONFORMANCE_RESULT {"step":"started","harness":<runtime.json harness>}`; the fixture asserts that it equals `<agent>`. Then `sessions.create({ message: "Help me author a course." })` and `delivery.result()`, after which it prints `CONFORMANCE_RESULT {"step":"parked","status","interactions":[{interactionId,prompt}],"state":<session.state>}`.
3.  `close()`, then a new `createKyoshiRuntime(root, { agent })` and `start()`, which prints the `started` line again, then `sessions.attach(state.sessionId, state).respond([{ interactionId, optionId: "Beginner" }])` and `result()`. It prints `CONFORMANCE_RESULT {"step":"answered","status","reply","sessionId"}`, then `close()`.
4.  Exits 0, or prints `CONFORMANCE_ERROR <message>` and exits 1.

The fixture spawns it with `detached: true`, waits at most 180 s, and kills the process group on timeout. It parses the result lines and makes its assertions in the test process, where the loopback runs. Step 4 adds `--crash-after-park` here for `kyoshi.host.processes-after-host-crash`.

### `conformance-compare.mjs`

Reads every `report-<agent>.json`, merged into one outcome table, plus `cases.json`, `versions.json`, `run.json` and the committed record. It derives each agent's outcome per case from that agent's report: `ancestorTitles` gives `["tier A", <agent>]`, the title is `"<id> [<persona>, step <n>]"`, and the status is `passed` or `failed`. It fails (exit 1, with one line per reason) when:

1.  **The record is no longer append-only:** the record at `--base` (default `origin/main`, via `git show <base>:packages/protocol/src/conformance.json`) is not a prefix of the current one, compared by deep equality. This check is skipped with a notice when the base has no file.
2.  **The record does not parse:** `parseConformanceRecord` throws.
3.  **Regression:** for an agent whose latest tier-A entry exists, a case listed `"passed"` there is now not `passed`. That includes a case that is missing, skipped or todo.
4.  **New failure on a passing persona:** for an agent whose latest tier-A entry has `personas[p] === "pass"`, any case of persona `p` now fails.
5.  **Changed pin:** for an agent whose latest tier-A entry passes any persona, `versions.json` has an error, or its `cli.version` differs from the entry's.
6.  **Incomplete run:** with `--require-all`, which is the default when `CI=true`, a tier-A agent with a passing latest entry is missing from the report.

Agents without a passing entry are reported ("not offered yet; failing: …") and never fail the job. That follows D1 and D24: such an agent is simply not offered. The script ends with a table of agent, persona results now, and persona results recorded.

### `conformance-record.mjs`

Appends one entry per agent in the report: `tier` from `--tier A|B` (default A), `cliRange` from `--cli-range` (default `=<cli.version>`), `note` from `--note`. The other fields come from `run.json`, `versions.json`, `cases.json` and `observations/<agent>.json` (`userConfig`, and later `absolutePathReads`). It writes the file with two-space JSON and a final newline.

It refuses when `run.json.dirty` is true (unless `--allow-dirty`) or when the record does not parse. It is run by a developer after a run on a clean tree, or with `DOJO_CONFORMANCE_OUT` pointing at a downloaded CI `conformance` artifact; the entry then names the commit CI ran.

## Spike records

*   **`docs/designs/agent-runtime.steps/cursor-spike.md`**, with these sections:
    *   Facts: fact 6, the launch arguments, and that the local binding wraps the installed `cursor-agent` (`packages/agent/src/local-cursor.ts:9-38`).
    *   Questions: does Cursor send `session/request_permission` for writes under `allow-reads` (open risk 1)? Does the official adapter need `--trust` under ACP?
    *   Status: blocked, "Cursor is not logged in on the step 3 machine; `session/new` requires `cursor_login`".
    *   Procedure, for tier B, with the user's login and consent for paid usage:
        1.  `HarnessAgent({ harness: createLocalCursor(), model: "default", permissionMode: "allow-reads", sandboxConfig: { workDir: "course" } })`.
        2.  Prompt "Create the file probe.txt containing ok, then reply done."
        3.  Record every approval request (`onLog`) and whether `course/probe.txt` exists.
        4.  Pass: an approval is requested before any write, and after denial the file does not exist.
        5.  Repeat with `cursor-agent --trust acp` through a wrapper, to answer the `--trust` question.
    *   What happens until then: Cursor has no record entry and is not in tier A.
*   **`docs/designs/agent-runtime.steps/fx-spike.md`**, with these sections:
    *   Facts: fact 1 (FX on Eve is `libfx` 0.0.14 in-process, so no CLI is bootstrapped), fact 7, and that `@ai-sdk/harness-fx` uses the CLI's own provider stores (`src/fx-subscription.ts`: gateway, Codex or Grok).
    *   Decision: model discovery runs the installed CLI's `fx models --json`, and lists nothing when no `fx` is installed.
    *   Unverified: that an id from the CLI's list, such as a Codex-subscription id, is accepted by `libfx` 0.0.14 through the adapter. Settled by tier B.
    *   Isolation facts stay in `sensei-isolation.md`.
*   **`docs/designs/agent-runtime.steps/claude-spike.md`**, written in commit 5. It records how Claude Code reaches a host tool over the Messages route, the wire ids of `sonnet` and `opus`, whether side requests offer tools, and the outcome of `compact()`.

## Commits

Each commit type-checks and builds (`pnpm build && pnpm -r --if-present types:check`), passes `pnpm lint:deps` and the unit tests of the packages it touches, and leaves Kyoshi authoring, kata Sensei, interactive Sensei and evaluation working. No `package.json` dependency changes in this step, so `pnpm-lock.yaml` is unchanged.

### Commit 1: The loopback model answers Anthropic Messages and records each request's tools

*   **Change** `packages/agent/experiments/model-provider/loopback-openai.mjs`, as under "The loopback model". The doc comment at `:4` becomes "Deterministic Responses, Chat Completions, FX gateway and Anthropic Messages endpoint; real harness/CLI, no external inference."
*   **Change** `packages/agent/experiments/model-provider/loopback-openai.test.mjs`: the eight tests listed above.
*   Check: `pnpm --filter @dojofoo/agent test`.

### Commit 2: The scripted HarnessV1 fixture writes, creates and deletes files

*   **Change** `packages/agent/experiments/model-provider/host-agent.fixture.ts` and `host.test.mjs`, as under "The scripted HarnessV1 fixture".
*   Check: `pnpm --filter @dojofoo/agent test` (`run.mjs` runs `host.test.mjs` in the packed consumer).

### Commit 3: The conformance record schema, with an empty record

*   **Add** `packages/protocol/src/conformance.ts` and `packages/protocol/src/conformance.test.ts` (above).
*   **Add** `packages/protocol/src/conformance.json`: `{ "schema": 1, "entries": [] }` plus a newline.
*   **Change** `packages/protocol/src/index.ts`: append `export * from "./conformance.js";`.
*   Check: `pnpm --filter @dojofoo/protocol test`, `pnpm --filter "@dojofoo/config..." build`.

### Commit 4: FX lists models with `fx models --json`; the Cursor and FX spike records

*   **Change** `packages/protocol/src/agents.ts`: delete the `| { method: "adapter" }` variant (`:24`). The FX row's `modelDiscovery` (`:112`) becomes `{ method: "native" }`.
*   **Change** `packages/authoring/src/eve/models.ts`:
    *   `:35` comment: "ACP probing (Cursor, Grok) lands in step 4; until then the agent's default model is used".
    *   After `:38` add `if (agent === "fx") return fxModels(signal);`.
    *   New exports:

        ```ts
        /** FX on Eve runs libfx in-process and has no catalog; the installed CLI lists its active provider's models. */
        export async function fxModels(signal: AbortSignal, executable = resolveAgentExecutable("fx"), args = ["models", "--json"]): Promise<HarnessModelChoice[]> {
          if (!executable) return [];
          const { stdout } = await promisify(execFile)(executable, args, { signal, timeout: 15_000, maxBuffer: 1024 * 1024 });
          return parseFxModels(stdout);
        }
        /** Accepts only `fx models --json` output: an object whose `ids` is a list of non-empty strings. */
        export function parseFxModels(output: string): HarnessModelChoice[];   // "FX returned an invalid model catalog" otherwise; duplicates dropped
        ```

    *   **Failure behaviour.** A missing CLI lists nothing (`[]`), so the input says "No models listed; the agent's default is used". A CLI that exits non-zero (for example when not signed in), times out or prints anything else throws. `GET /models` then answers 500, as it does today for the Codex and OpenCode branches; the route has no catch (`packages/authoring/src/server/routes.ts:37-43`). The model input shows its error state and still accepts a typed model id (`packages/ui/src/components/harness-model-input.tsx:33`). This matches the other `native` agents rather than inventing a new rule.

*   **Change** `packages/authoring/src/eve/models.test.ts`, new cases:
    *   `accepts only FX's JSON model list`: `{"kind":"models","ids":["gpt-6-sol","gpt-6-luna","gpt-6-sol"]}` gives two choices, and `Error: not signed in` throws.
    *   `lists FX models through its CLI without starting a session`: `fxModels(AbortSignal.timeout(2000), process.execPath, ["-e", "process.stdout.write(JSON.stringify({ kind: 'models', ids: ['a'] }))"])`.
    *   `lists no FX models when the CLI is not installed`: executable `null` gives `[]`.
*   **Add** `docs/designs/agent-runtime.steps/cursor-spike.md` and `fx-spike.md` (above).
*   **Change** `docs/designs/agent-runtime.md`:
    *   Model selection, FX row (`:520`): "`fx models --json` from the installed FX CLI, which lists its active provider's models; none when the CLI is missing (`agent-runtime.steps/fx-spike.md`)".
    *   Open risk 1 (`:656`): replace "Settled by step 3's Cursor spike record and the tier-A Grok cases." with "Grok's part is settled by step 4's tier-A case `sensei.read-only.adversarial-native-calls` (Sensei is the first read-only persona on Eve). Cursor's part needs Cursor's spike (`agent-runtime.steps/cursor-spike.md`), which needs a Cursor login that the step 3 machine did not have; until it runs, tier B settles it."
*   Check: `pnpm --filter @dojofoo/protocol test`, `pnpm --filter @dojofoo/authoring test --exclude '**/*.live.test.ts'`.

### Commit 5: Claude Code spike over the Messages route

Before any case body is written, the implementer runs one harness-level host-tool turn on Claude Code against the commit-1 loopback, in a scratch script outside the repository (run from `packages/authoring` so the packages resolve, as the step 3 probes were). The script sets up:

*   `createClaudeCode({ port: 0, auth: { ANTHROPIC_API_KEY: "fixture-only", ANTHROPIC_BASE_URL } })` and a `createLocalSandbox` with a fresh `HOME`;
*   `HarnessAgent({ harness, model: "sonnet", tools: { dojo_conformance_echo }, sandboxConfig: { workDir: "course" } })`.

It runs one turn, a second turn with `model: "opus"` and one `compact()`, then records:

1.  Whether the first request offers `mcp__harness-tools__dojo_conformance_echo`, or only `ToolSearch`.
2.  Whether the suffix match, or the `ToolSearch` fallback, reaches `execute`.
3.  The wire `model` of both turns.
4.  Every request with an empty `toolLists` entry, to check that side requests have no tools.
5.  The outcome of `compact()`.

*   **Add** `docs/designs/agent-runtime.steps/claude-spike.md` with those findings, the script's text and the date.
*   **Change** this plan's Claude row under "Per-agent wiring" only as the findings require: the host-tool path, the wire-model patterns and the compaction expectation.
*   If the host tool cannot be reached by either path, stop and report it before commit 6. Claude Code would then fail a step-3 Kyoshi case, which D1 does not allow.
*   No source changes.

### Commit 6: `conformance.test.ts` replaces `native-harness-contract.test.ts`; the CI `conformance` job

*   **Add** `packages/authoring/src/eve/conformance.test.ts`: the case model, the case list, the registration loop and the eight step-3 bodies. Imports: `HarnessAgent` from `@dojofoo/agent/harness`, `createLocalSandbox` and `prepareHarnessEnvironment` from `@dojofoo/agent/experimental/local`, `tool` from `@ai-sdk/provider-utils`, `z` from `zod`, `agentRows` and `Persona` from `@dojofoo/protocol`, and the fixture.
*   **Add** `packages/authoring/src/eve/conformance.fixture.ts`:
    *   `wiring` (the per-agent table), `userConfigSeeds`, `openCase(agent, id)` and `nativeProcesses` / `expectNoNativeProcesses`.
    *   `caseBaseEnvironment` (imported from `conformance-install.mjs`) and `requestsCarrying(endpoint, text)`, which keeps only main-loop requests (non-empty `toolLists[i]`) whose JSON contains `text` (decision 8).
    *   `stopAfterCancel(session, reason)`, `snapshotDirectory(path)`, `runKyoshiHost(context, endpoint, model?)` and `observe(agent, key, value)`.
    *   It imports the loopback with `// @ts-expect-error` from `../../../agent/experiments/model-provider/loopback-openai.mjs`, as `runtime-turn.test.ts:9-10` does.
    *   `openCase(agent, id, { course })` creates `<tmp>/dojo-conformance-<agent>-<id>-XXXX` and `realpath`s it, then creates `home/` before any `createLocalSandbox` call (which `realpath`s its directory, `packages/agent/src/local-sandbox.ts:60`). Harness-level cases also get `course/lesson.md`. Host cases pass `course: false`, so their root ends with only `.dojo` and `home`. In it, `home/.ai-sdk-harness` is a symlink to `<DOJO_CONFORMANCE_HOME>/<agent>/.ai-sdk-harness`, and for Grok `home/.grok/bin` is a symlink to `<DOJO_CONFORMANCE_HOME>/grok/.grok/bin`.
    *   Each case therefore starts with a clean user home and reuses the bootstrap. The cases of one agent share `.ai-sdk-harness/.agent-runs` through the link (see "Native process count"). Unverified: that every adapter accepts a symlinked bootstrap directory without installing again; if one installs again, the case is slower but still correct.
*   **Add** `packages/authoring/scripts/conformance-install.mjs`, `conformance-run.mjs`, `conformance-host.mjs`, `conformance-compare.mjs` and `conformance-record.mjs`.
*   **Change** `packages/authoring/src/eve/install.ts:10-21`: `prepareAuthoringHarness(agent, options)`, as under `conformance-install.mjs`.
*   **Change** `packages/authoring/src/eve/runtime.ts:52-53`: `createKyoshiRuntime(courseRoot, { model?, agent? })`, as under `conformance-host.mjs`. Add the case `an explicit agent wins over the workspace's selection` to `packages/authoring/src/eve/runtime.test.ts`, using its existing helper at `:21`: the workspace saves `{ "agent": "codex" }`, the runtime is created with `agent: "pi"`, and after `start()` the host's `runtime.json` has `harness: "pi"`.
*   **Change** `packages/authoring/package.json` `scripts` (`:203-208`): add
    *   `"conformance": "node scripts/conformance-install.mjs && node scripts/conformance-run.mjs && node scripts/conformance-compare.mjs"`
    *   `"conformance:install": "node scripts/conformance-install.mjs"`
    *   `"conformance:run": "node scripts/conformance-run.mjs"`
    *   `"conformance:compare": "node scripts/conformance-compare.mjs"`
    *   `"conformance:record": "node scripts/conformance-record.mjs"`
*   **Change** `.gitignore` (after `:21`): `packages/authoring/.conformance/`.
*   **Change** `.dependency-cruiser.cjs:7`: the exemption `packages/authoring/src/eve/native-harness-contract.test.ts // step 3 deletes the file` becomes `packages/authoring/src/eve/conformance.fixture.ts // loopback model: step 8`.
*   **Delete** `packages/authoring/src/eve/native-harness-contract.test.ts`.
*   **Change** the documents that cite it:
    *   `patches/README.md:32-33`: "Regression coverage: `kyoshi.harness.model-switch` in `packages/authoring/src/eve/conformance.test.ts`, the OpenCode row, checks initial and changed models through the native agent."
    *   `patches/upstream/README.md:17-19`: the same case.
    *   `packages/agent/README.md:414`: "… and the authoring package's `conformance.test.ts` (tier A; results per agent in `packages/protocol/src/conformance.json`) and `runtime-turn.test.ts`".
    *   `packages/agent/README.md:478-485`: the paragraph describes tier A. Its harness-level cases run each adapter at the HarnessAgent level against loopback endpoints (Responses for Codex, OpenCode and Pi; Chat Completions for Grok; gateway events for FX; Messages for Claude Code), and its host-level case runs Kyoshi's prepared host in a child process. The paragraph ends with the run command `pnpm --filter @dojofoo/authoring conformance`.
*   **Change** `.github/workflows/verify.yml`: replace the placeholder job (`:87-94`) with the job under "CI job". The record is still empty, so the compare step can only fail on a broken record (decision 5). The job is green while Linux runs every case for the first time, before any pass is recorded.
*   Check, from a clean `pnpm install --frozen-lockfile` and `pnpm --filter "@dojofoo/authoring..." build`:
    *   `pnpm --filter @dojofoo/authoring conformance` passes every step-3 case for all six agents on this machine, with the step 4-8 cases shown as todo.
    *   The PR's `conformance` job is green, and its report artifact shows every step-3 case passing for all six agents on Linux.
    *   `pnpm --filter @dojofoo/authoring test --exclude '**/*.live.test.ts'` skips the file.
    *   `pnpm lint:deps` passes.

### Commit 7: The first tier-A record, from the Linux CI run

*   Download the `conformance` artifact of the PR's CI run at commit 6. Its `run.json` names commit 6's PR head SHA (`DOJO_CONFORMANCE_COMMIT`), `dirty: false` and `linux-x64`.
*   Run `DOJO_CONFORMANCE_OUT=<artifact dir> pnpm --filter @dojofoo/authoring conformance:record`.
*   **Commit** the six appended entries in `packages/protocol/src/conformance.json`: tier `A`, step 3, `personas.kyoshi: "pass"`, `personas.sensei: "untested"`, `userConfig.kyoshi` from the seed case, `latency: null`, `absolutePathReads: null`.
*   If CI ran on several commit-6 heads, use the newest artifact whose run passed.
*   Check: the PR's `conformance` job is green, and its compare step reports all six agents with `kyoshi pass`, both now and recorded.

## CI job

No credentials and no login are needed: every agent talks to the loopback with `fixture-only` keys. No CLI is installed globally. Each adapter installs its own pinned CLI into `DOJO_CONFORMANCE_HOME` through its bootstrap recipe: Claude Code 2.1.290, Codex 0.160.1, OpenCode 1.18.34 and Grok 1.0.49. FX (`libfx` 0.0.14) and Pi (`pi-coding-agent` 1.3.0) come from `pnpm install` and run in-process. mise provides pnpm 10.34.5 to the bootstraps (`runtime-toolchain.ts:8`), installed once into `$DOJO_CONFORMANCE_HOME/mise` through `MISE_DATA_DIR` and `MISE_CACHE_DIR`, which `caseBaseEnvironment()` sets. Bun is not needed: building authoring and its dependencies runs only tsc, tsup and node scripts.

```yaml
  conformance:
    runs-on: ubuntu-latest
    timeout-minutes: 40
    permissions:
      contents: read
    env:
      DO_NOT_TRACK: "1"
      DOJO_HARNESS_LIFECYCLE: "1"
      DOJO_CONFORMANCE_HOME: ${{ runner.temp }}/conformance-home
      DOJO_CONFORMANCE_OUT: ${{ runner.temp }}/conformance
      # The PR head, not the pull_request merge commit that HEAD names, so a record made from this run names a real commit
      DOJO_CONFORMANCE_COMMIT: ${{ github.event.pull_request.head.sha || github.sha }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: jdx/mise-action@6be3c7ed4c21d4f76b208d351d95aac273ebb76d # v5.2.4
        with:
          install: false
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter "@dojofoo/authoring..." build
      # Tier A against the loopback model (docs/designs/agent-runtime.md, "Conformance tiers"). Each adapter installs
      # its own pinned CLI into DOJO_CONFORMANCE_HOME; FX and Pi run in-process. No login and no secret.
      - run: pnpm --filter @dojofoo/authoring conformance:install
      - run: pnpm --filter @dojofoo/authoring conformance:run
      # Fails only for agents whose committed record passes, and when the record is not append-only.
      - run: pnpm --filter @dojofoo/authoring conformance:compare
      - name: Keep the conformance report
        if: always()
        uses: actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2
        with:
          name: conformance
          path: ${{ runner.temp }}/conformance
          if-no-files-found: ignore
          retention-days: 7
```

Timing, estimated from facts 1, 4 and 5:

*   **Bootstraps:** about 5-12 s each here, perhaps 30-60 s each on a cold runner, with about 2.5 GB of downloads.
*   **Harness-level cases:** about 5-8 s each, so 7 × 6 ≈ 5 min. The six Vitest processes add about 2 s each to start.
*   **Host case:** about 12 s per agent.
*   **Build:** about 3-5 min.

The total is about 15-20 minutes, against a 40-minute limit. If the first runs take more than 30 minutes, the job splits into a per-agent matrix, which needs a per-agent `--require-all` and a rename of the required check. No cache is used for the bootstrap homes until the measured times call for one.

## Local commands

```sh
pnpm install --frozen-lockfile
pnpm --filter "@dojofoo/authoring..." build
pnpm --filter @dojofoo/authoring conformance           # install, tier A, compare
DOJO_CONFORMANCE_AGENTS=claude,pi pnpm --filter @dojofoo/authoring conformance   # a subset
pnpm --filter @dojofoo/authoring conformance:record    # after a clean run: append one entry per agent
DOJO_CONFORMANCE_OUT=<downloaded CI artifact> pnpm --filter @dojofoo/authoring conformance:record   # record a CI run
```

The design's Verification Plan command, `DOJO_HARNESS_LIFECYCLE=1 pnpm --filter @dojofoo/authoring exec vitest run src/eve/conformance.test.ts`, runs the same cases (it installs lazily) in one process with the caller's environment and writes no report for the record. It is for quick checks; records come from `conformance:run` (decision 16).

## Constraints for this step's plan, one by one

1.  **Cases that need step 4 parts are tagged step 4.** The three named cases are `kyoshi.host.cancel-pending-host-tool` (the lifecycle extension's stop-and-evict; `harness-model.ts:274-277` detaches today), `kyoshi.host.resume-after-eviction` (`evictHarnessSession`) and `kyoshi.host.processes-after-host-crash` (the reaper). They are step-4 todos, and so are their Sensei forms.

    The alternative is used as well. At the HarnessAgent level, `kyoshi.harness.resume-after-stop` (as `native-harness-contract.test.ts:66-71`) and `kyoshi.harness.cancel-pending-host-tool` pass in step 3.

    The process count after a graceful host stop is checked after `kyoshi.host.ask-answer-across-restart`; the count after a crash waits for the reaper.
2.  **A fixture host-port server, in `packages/agent`, next to the host-port client.** No step-3 case calls a host port. The host-port client does not exist yet; today's run-coordinator client is `packages/cli/src/lesson-mcp.ts:111-118`. Every host-port case (`sensei.*.host-tool-turn`, `sensei.host-port.rerun-no-duplicate`, the Sensei context cases) is step 4 or later.

    Step 4 adds the fixture server at `packages/agent/src/host-port/fixture.ts`, next to `client.ts`, and exports it for tests. `conformance.test.ts` then imports it by package name; authoring → agent is an allowed direction. Building it now would fix step 4's server skeleton before step 4 is planned.
3.  **Record schema.**
    *   "Latest" is the last entry in array order. `latestConformance` implements that, and the compare script enforces append-only against `origin/main`. `recordedAt` is a full timestamp, never a day.
    *   `latency.slow` is the slow-agent flag, and `absolutePathReads` holds the documented absolute-path reads.
    *   `cliRange` holds the CLI version range next to the exact `cli.version` (fact 2 shows why Grok needs it).
    *   `sensei` is `"untested"` while `step < 5`, enforced by `parseConformanceRecord` and its test.
4.  **The install script** is `conformance-install.mjs`. It reads each agent's pinned version and installs it through the adapter's own bootstrap. That covers FX (in-process `libfx`, no install command, `agents.ts:106`) and Pi (in-process `pi-coding-agent`; its curl installer `:115` is for users' own CLI). The version source per agent and the first-run pins are in its table. The compare script that fails the job when an agent whose latest committed record passes now fails is `conformance-compare.mjs`.
5.  **Tier A covers the rows with an adapter except Cursor, and the native process count after each case is 0.**
    *   The agent list is derived from the registry: `adapterId` set, `id !== "cursor"`. Cursor's adapter cannot be pointed at the loopback; its routing cannot be changed (`packages/agent/README.md:415-416`), and fact 6 shows it needs a login.
    *   Every case ends with `expectNoNativeProcesses` (polled, 10 s), and `kyoshi.harness.cancel-active-turn` holds the positive control.

## Gate

From a clean `pnpm install --frozen-lockfile`:

*   `pnpm build`, then `pnpm -r --if-present types:check`; `pnpm lint:deps`.
*   Unit tests:
    *   `pnpm --filter @dojofoo/protocol test` (record schema)
    *   `pnpm --filter @dojofoo/ui test --exclude '**/*.live.test.ts'`
    *   `pnpm --filter @dojofoo/authoring test --exclude '**/*.live.test.ts'` (FX models)
    *   `pnpm --filter @dojofoo/agent test` (loopback routes; the scripted fixture's file changes through `run.mjs`)
    *   `pnpm --filter @dojofoo/agent-api test`, `pnpm --filter dojofoo test`, `pnpm --filter dojofoo test:package`
*   Browser specs, unchanged: `agent-chat.spec.ts eve-authoring.spec.ts learner-pages.spec.ts workspace-loading.spec.ts agent-selector.spec.ts`.
*   Tier A: `pnpm --filter @dojofoo/authoring conformance`, with every `kyoshi.*` step-3 case passing for claude, codex, grok, opencode, fx and pi, and later cases todo. The CI `conformance` job is green.
*   `pnpm --filter @dojofoo/ui test:lesson` and `pnpm --filter @dojofoo/ui test:interactive`, unchanged (ACP).

## Decisions made in this plan

1.  **CLI versions come from the adapters' own install recipes; nothing is installed globally.** The adapters run their bootstrapped binaries (fact 1), so a global install would not be the CLI under test. The record pins what actually ran, and the install script fails on a pin change until a new entry is recorded, which is open risk 2's "rerun conformance on every adapter upgrade".
2.  **Host-level cases run Kyoshi's built host in a child process** (`conformance-host.mjs`). Inside Vitest, a second Kyoshi host in one worker fails (fact 5), while the same sequence passes in a plain Node process. A child per case also makes the zero-process check meaningful, and step 4 can crash the host to test the reaper. The cost is that tier A needs `pnpm --filter "@dojofoo/authoring..." build` first, as `test:prepared` already does.
3.  **Eviction and cancel-with-pending-host-tool have HarnessAgent-level forms in step 3 and Eve-level forms in step 4.** Both forms are valuable: the first tests the adapter contract the lifecycle hook relies on (`@ai-sdk/harness` `src/v1/harness-v1-session.ts:242-248`), and the second tests the hook.
4.  **Later cases are `it.todo` with the step in the title, registered once; there is no expected-fail marker.** The reasons are under "How a case is defined and marked". Due cases without a body throw at collection.
5.  **The compare script, not Vitest's exit code, decides the CI job.** An agent without a passing record that fails is not offered (D1, D24) and must not block unrelated PRs. A regression of a recorded pass, a changed pin and a rewritten record do block.
6.  **The record lives in `packages/protocol/src/conformance.json`, and the scripts that write it live in `packages/authoring/scripts`.** Protocol holds the registry that reads it from step 5. The scripts need adapters and Eve, which protocol must not import. CI never writes the record.
7.  **The first record comes from the Linux CI run of commit 6, not from this machine.** The `conformance` job lands with commit 6, while the record is still empty and so cannot block, so Linux runs every case before any pass is recorded. Commit 7 records from that run's artifact. The entry names the PR head SHA (`DOJO_CONFORMANCE_COMMIT`); on `pull_request`, `git rev-parse HEAD` is GitHub's merge commit, which no branch contains. Entries carry `platform`, and local macOS records stay possible for later steps.
8.  **Assertions look for the main-loop request that carries a prompt, never `requests.at(-1)`.** Grok sends a background summary request after a turn (fact 4), and Claude Code side requests may repeat the prompt. A main-loop request is one that offers tools, which the new per-request tool lists show.
9.  **`stop()` after a cancellation may reject with exactly that cancellation's reason.** FX does this, as far as fact 4 shows. Any other rejection fails the case.
10. **Case environments, and the Vitest processes themselves, are built from one allow-list.** FX's and Pi's adapters run inside the Vitest process, and the host child inherits from its parent. Without the allow-list, a developer's real `CLAUDE_CODE_OAUTH_TOKEN` or API keys would travel into fixture requests and the uploaded artifact, or route a call outside the loopback. Without `DOJOFOO_HOME`, Kyoshi could read the developer's onboarding choice. The mise directories are shared so that every `prepareHarnessEnvironment` call, including the one per model call in the host child, finds pnpm without downloading it again.
11. **FX's model discovery is the installed CLI's `fx models --json`, and the unused `adapter` method goes.** There is no adapter catalog, and `libfx`'s list covers only the AI Gateway (fact 7). This settles the design's "settled in step 3".
12. **The Cursor spike is recorded as blocked, with no Cursor code.** Nothing about Cursor's permission behaviour can be observed without a login (fact 6). Its procedure is written for tier B.
13. **The user-config seed case only observes in step 3.** Kyoshi is not required to load or ignore user config. The observation gives step 4's D34 case a verified control per agent.
14. **`runtime-turn.test.ts` is not changed.** Its gated selections fail in sequence (fact 5), but it is not in CI, and its ungated `runtime` selection passes. The tier-A host case now covers those agents. Removing the gated selections is not part of this step's design scope.
15. **One sequential CI job named `conformance`, with no bootstrap cache.** This keeps one check name for branch protection. A matrix and a cache are added only if measured times require them.
16. **One Vitest process per agent.** Fact 5 shows state leaking between Kyoshi hosts in one Vitest worker. The host case already runs in a child process, but harness-level adapters and Eve modules also live in the worker. A process per agent removes that class of leak, and costs about 2 s per agent. `conformance-compare.mjs` merges the per-agent reports.
17. **The host driver selects the agent explicitly through a new `createKyoshiRuntime` option, not through `.dojo/runtimes.json`.** The workspace can select only offered agents, and Pi is not offered until step 5 (fact 10). An unselected host would silently run whatever `resolveAgent` falls back to, and Pi could record OpenCode's pass. The option is used only by the driver. The case asserts the host's `runtime.json` `harness`, so a wrong agent fails rather than passes.
18. **The install script reuses `prepareAuthoringHarness` with an options parameter** instead of a second copy of the adapter-bootstrap code. The CLI and the lifecycle test keep its defaults.
19. **The Claude Code spike is its own commit (5), before any case body.** Tool use over the new Messages route, alias resolution and side-request shape are unverified (facts 3 and 12). Claude Code is the only agent new to the loopback, and a failure there would block the step-3 gate. Learning it before commit 6 keeps the case bodies from being written against a guess. The spike's script stays out of the repository; its record does not.
20. **(Implementation) `personaRecordedFrom` lives in `@dojofoo/protocol` next to the parser, and `conformance.test.ts` imports it.** The parser enforces "untested before the persona's first recorded step" for every persona with the same table, so the test, `cases.json` and the record cannot disagree. `protocol/src/conformance.test.ts` reads node types through a `/// <reference types="node" />` line, because protocol's tsconfig (TypeScript 6, no `types` default) gives its sources no Node globals and its build must stay free of them.

## Open questions for the user

1.  `main` has no branch protection or rulesets (fact 8), but the design says merging is blocked on tier A. Should `conformance` (and `verify`) become required status checks on `main`? Only a repository admin can set this.
2.  The Cursor spike (open risk 1) needs `cursor-agent login` and your consent for paid usage. Cursor stays out of tier A and has no record entry until it runs. When can it run?
