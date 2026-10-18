# Dependency upgrade and documentation parity plan

Status: implemented and verified in `.worktree/monaco-editor`, with the baseline failures and limits recorded in the ledger. Prepared 2026-10-18.
See the [execution ledger](./dependency-upgrade-ledger.md) for installed versions,
baseline failures, verification results, and deviations discovered during upgrades.
The version inventory below is the pre-upgrade baseline, not current state.

Execution limits: no paid model calls were made, so live sign-in/teaching smoke
tests remain deferred. OpenCode and TanStack contribution drafts are prepared
locally, not published upstream. The ledger records the completed offline gates.

Execution decisions: retain FX native sign-ins (set A); use the exact Harness
1.0.153 companion versions, AI SDK 7.0.142 and provider 4.0.28, because mixing
the next patch release introduces incompatible schema types. Upgrade these
together in stage 2. The user approved a breaking Eve transition: preserve
readable old history and explicitly start new conversations, without a legacy
runtime or deleting course material.

## Why this comes first

The runtime consolidation proposal ([agent-runtime-consolidation.md](./agent-runtime-consolidation.md)) is written against pinned versions that are now far behind what their documentation describes. That gap already produced a wrong conclusion (FX "requires Gateway credentials" came from current docs; our installed 1.0.21 adapter reads native `~/.fx` logins). Until the code we run matches the documentation we read, every design job pays for the difference twice: once to discover what our version does, and again when we later upgrade.

The goal of this plan is **documentation parity**: every runtime dependency on a version whose official documentation describes it, every patch either removed or justified against that version, and a ledger recording what we pin and why. After that, consolidation jobs (OpenCode-first Sensei path, trial hygiene, course-owned evals) can be designed by reading the docs.

This is not a single "upgrade everything" change. Several upgrades remove sign-in routes, strand stored sessions, or silently drop agent output. Each stage below is its own change with its own gate.

## Where we are

Resolved from `packages/*/package.json` and the npm registry on 2026-10-18.

| Package | Pinned | Latest | Used in (files importing) |
| --- | --- | --- | --- |
| `eve` | 0.53.0 + 3 patches | 0.80.1 | `packages/agent` only (8) |
| `ai` | 7.0.98 (agent), ^7.0.77 (ui, evals) | 7.0.143 | agent, ui (2) |
| `@ai-sdk/provider` | 4.0.14 | 4.0.29 | agent (1) |
| `@ai-sdk/harness` | **1.0.108** (agent), **1.0.71** (ui), **1.0.85** (evals) | 1.0.154 | agent, ui, evals |
| `@ai-sdk/harness-codex` / `-opencode` / `-pi` | 1.0.110 (pi 1.0.87 in evals) | 1.0.156 | authoring, evals, ui (11 adapter imports) |
| `@ai-sdk/harness-cursor` / `-fx` | 1.0.21 | 1.0.68 / 1.0.69 | authoring |
| `@ai-sdk/harness-grok-build` | 1.0.45 | 1.0.92 | authoring |
| `@ai-sdk/sandbox-just-bash` | 1.0.108 (agent), 1.0.85 (evals) | 1.0.154 | evals (2) |
| `@ai-sdk/react` | 4.0.61 (ui) | 4.0.147 | **no imports — remove** |
| `@earendil-works/pi-coding-agent`, `pi-ai` | 0.84.4 (authoring) | 1.3.0 | authoring (2) |
| `@tanstack/ai` / `ai-client` / `ai-react` | 0.47.1 / 0.25.1 + patch / 0.21.1 | 0.69.0 / 0.39.3 / 0.30.4 | authoring, ui (8 / 16 / 8) |
| `@agentclientprotocol/sdk` | ^1.3.0 | 1.9.0 | ui (5) |
| `@agentclientprotocol/codex-acp` | ^1.4.0 | 2.2.2 | cli, ui (2) |
| `@modelcontextprotocol/sdk` | ^1.30.0 | 1.32.1 | cli, evals (4) |
| `just-bash` | 3.1.0 | 3.6.0 | agent (dependency) |
| `nitro` | 3.0.260415-beta (ui), 3.0.260903-beta (agent) | 3.0.260903-beta | ui, agent |

Two problems are visible before any feature discussion:

- **Three different `@ai-sdk/harness` versions.** Evaluations run on 1.0.85/1.0.87 while production runs 1.0.108/1.0.110, so evaluation results do not certify the production stack.
- **Pi is two majors apart.** The adapter bundles Pi 0.84; setup installs Pi 1.3 from pi.dev. Their configuration and sign-in files are what Pi learning would depend on.

## Patch status against latest

Every patch was re-checked against the latest published artifact. **None of the five can be dropped by upgrading alone.**

| Patch | Status at latest | Action |
| --- | --- | --- |
| `eve@0.53.0.patch` — compaction hook (`experimental_compact`) | Not upstream; compaction moved to `harness/compaction/` with a summarizer only | Rebase onto 0.80 structure |
| `eve@0.53.0.patch` — web-search by real provider | Upstream differently (0.71.3, 0.75.1): Eve reads the live model's `.provider` | Drop this part on upgrade; confirm `web_search` stays excluded for `provider: "harness"` |
| `eve-native-turn@0.53.0.patch` — respect provider `stop` after its own tool results; `contextTokens` for compaction | Not upstream (logic now in `harness/step/after-model.js`) | Rebase |
| `eve-distribution@0.53.0.patch` — module map, project-root discovery, step identity for `@dojofoo/agent` | Not upstream | Rebase; also resolve the new `./server` export clash (below) |
| `@ai-sdk__harness-opencode@1.0.110.patch` — legacy prompt model instead of v2 `switchModel` | Not upstream in 1.0.156 or `main`; no upstream issue | Re-diff against the tsdown build; **file upstream** |
| `@tanstack__ai-client@0.25.1.patch` — queue normal input during interrupts | Not upstream in 0.39.3 (`sendMessage` still throws; `drainQueue` still ignores interrupts) | Rewrite for 0.39 (`hasPendingInterrupts`); **file upstream**. PR #162 was ours. |

Filing the OpenCode and TanStack fixes upstream is the only route to deleting those patches; add both as explicit tasks.

## Staged upgrades

Each stage: one change, typecheck plus the existing offline/contract/cassette tests, **no paid model calls**. A stage may add at most one bounded live smoke (≤ 6 short turns, explicit ceiling) where noted. Record resolved versions and patch identities in the change.

### Stage 0 — Baseline and cleanup (no behaviour change)

- Record the current offline test results so later stages are compared against a known baseline, including tests that already fail.
- Remove `@ai-sdk/react` from `packages/ui` (no imports).
- Unify `nitro` on 3.0.260903-beta.
- Start the dependency ledger (see "Documentation parity").

### Stage 1 — Low-risk catch-up

- `ai` → 7.0.143 everywhere (required anyway: Eve 0.80 peers on `^7.0.137`), `@ai-sdk/provider` → 4.0.29.
- `@modelcontextprotocol/sdk` → 1.32.1: stored OAuth tokens gain `issuer`; redirects only follow same origin; new `maxToolInputElements`. Low risk. (The 1.x line is maintenance; v2 split into `@modelcontextprotocol/client`/`server` — note, do not migrate now.)
- `just-bash` → 3.6.0.
- Docs: [AI SDK](https://ai-sdk.dev/docs), [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).

### Stage 2 — One harness version everywhere

**Decision required first: FX sign-in route.** `@ai-sdk/harness-fx` was rewritten on `libfx` in 1.0.68 and since then accepts only `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN`; 1.0.67 is the last version that reads native `~/.fx/chatgpt-auth.json` and `grok-auth.json`. Adapters pin an exact `@ai-sdk/harness`, so this choice decides the whole set:

| Set | `@ai-sdk/harness` | codex / opencode / pi | cursor | fx | grok | sandbox-just-bash | Consequence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **A (recommended now)** | 1.0.153 | 1.0.155 | 1.0.67 | 1.0.67 | 1.0.91 | 1.0.153 | Keeps FX native logins; one release behind latest |
| B | 1.0.154 | 1.0.156 | 1.0.68 | 1.0.69 | 1.0.92 | 1.0.154 | Latest; FX becomes Gateway-only |

Recommendation: adopt Set A in `packages/agent`, `packages/authoring`, `packages/ui` **and** `packages/evals` (ends the separate eval stack). Revisit B when FX's direction is decided.

Changes required with either set:

- **Pi 1.x.** `harness-pi` 1.0.149+ depends on `@earendil-works/pi-coding-agent ^1.0.3`. Bump authoring's direct `pi-ai`/`pi-coding-agent` pins from 0.84.4 to 1.3.0. Replace `@earendil-works/pi-ai/compat` (marked "temporary… deleted") in `packages/authoring/src/eve/models.ts` with `@earendil-works/pi-ai/models`. Configuration paths are unchanged (`~/.pi/agent`, `auth.json`, `models.json`, session format v3 with auto-migration); the Azure provider key was renamed `azure-openai-responses` → `azure` (1.0.3). From harness-pi 1.0.154, MCP tools are named `mcp__<server>__<tool>`, and a non-`mcp` `toolPrefix` fails session start.
- **Sandbox API deprecations.** Move `sandbox:` / `createJustBashSandbox` to `createJustBashNetworkSandboxSession` + `createSession({ sandboxSession })` in `learner-fixtures.ts`, `learner-response.ts` and evals. `HarnessV1NetworkSandboxSession` is unchanged, so `local-sandbox.ts` should compile — verify.
- **Harness state directory** moved to `~/.ai-sdk-harness` under the sandbox's HOME. With our local sandbox this is probably the real user home — confirm and decide before shipping.
- **OpenCode patch** re-diffed against the new bundle (see patch table).
- Optional bounded live smoke: one OpenCode and one Pi authoring turn.
- Docs: [harness adapters](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters), [HarnessAgent](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-agent), per-adapter pages, [pi.dev](https://pi.dev).

### Stage 3 — TanStack AI client

- `@tanstack/ai` 0.69.0, `ai-client` 0.39.3, `ai-react` 0.30.4 together.
- Rewrite the queue patch for 0.39; keep the browser regression (`eve-authoring.spec.ts`, "keeps a pending question while queuing messages…") as the gate; open the upstream issue/PR.
- Check hand-built AG-UI events in `agui-stream.ts` and `authoring/src/eve/stream.ts`: since 0.26, extras live under `metadata.tanstack` and the wire format is spec-only. `StructuredOutputPart.data` is required once complete (0.38). `withInterruptBinding` and `uiMessagesToWire` remain exported.
- Docs: [TanStack AI](https://tanstack.com/ai).

### Stage 4 — Learning runtime (ACP), as one change

Upgrade `@agentclientprotocol/sdk` → 1.9.0 and `@agentclientprotocol/codex-acp` → 2.2.2 **together**, because each has a silent failure:

- **Elicitation stops registering.** Elicitation was stabilised in SDK 1.4; 1.9 no longer has `unstable_createElicitation`. Rename the handler in `codex-client.ts` (line ~489) to `createElicitation` and add `completeElicitation`. Typecheck may not catch it.
- **Codex command output disappears.** We declare a JetBrains AIR client (`_meta.jetbrains.air` in `harness/codex.ts`). codex-acp 2.0 stopped repeating output in `rawOutput.formatted_output` (read by `toolRawOutput()`), and sends `terminal_output_delta` to AIR clients only if they declare `clientCapabilities._meta.terminal_output_delta: true`. Without it, `kata --check --reporter json` output never arrives and lesson verification reports come back empty. Declare the capability (or drop the AIR declaration) and assert verification output in a test.
- `tool_call_update` now omits unchanged fields; we read status, output and `_meta` only — verify.
- codex-acp 2.x bundles `@openai/codex` ^0.160 (was ^0.147): ChatGPT login, `CODEX_API_KEY`/`OPENAI_API_KEY`, auth status pushes, failures through the ACP login flow.
- This path stays live during the OpenCode comparison in the consolidation plan, so it must be correct, not just compiling.
- Docs: [Agent Client Protocol](https://agentclientprotocol.com), [codex-acp](https://github.com/agentclientprotocol/codex-acp).

### Stage 5 — Eve 0.53 → 0.80, last and alone

The largest change; do it after stages 1–4 so it is the only moving part.

**Decision required first: existing sessions.** On the local world, any Eve version change strands every existing durable session (0.76.1): history stays readable with `follow: false`, but sessions can only be reset. This is the same open decision as "existing learning sessions" in the consolidation proposal — make it once, for both.

Required changes:

- Rebase all three Eve patches onto the restructured files; drop the web-search part of `eve@0.53.0.patch`.
- Pass `resume: true` to `createDevelopmentServer` in `packages/authoring/src/eve/runtime.ts:56` and `packages/ui/src/server/authoring.ts:64`. Since 0.68 a restart otherwise leaves earlier sessions dormant.
- Client/stream API: the default store returns `ConversationState` (0.70), affecting `authoring/src/eve/stream.ts` and `resume.ts`; stream protocol 26 rejects older clients.
- Tool renames: `load_skill` → `eve__skill`, `final_output` → `eve__reply`, `task_*` → `eve__task_*`; the `eve__` prefix is reserved (`host-agent.fixture.ts:41`, a comment in `prepare.ts`).
- `defineAgent` lost `outputSchema` (0.67); request structured output per turn.
- Packaging: Eve now exports its own `./server` (clashes with ours); `build-runtime.mjs` requires our manifest to mirror Eve's exports — add ~25 subpaths, drop 5 (`todo`, `load_skill`, `task_cancel`, `task_update`, `connection_search`).
- Evals: `packages/evals/authoring/evals/teaching.eval.ts` uses `t.judge.autoevals.closedQA` (removed in 0.62), and since 0.59 each `t.send()` opens a fresh session — the two-turn teaching eval must be restructured.
- Gate: restart, pending question, tool result, subagent and packaging tests; one bounded live Kyoshi smoke.
- Docs: [Eve](https://eve.dev/docs), [execution model](https://eve.dev/docs/concepts/execution-model-and-durability), [workflow tools](https://eve.dev/docs/tools/workflows), [evals](https://eve.dev/docs/evals/overview).

## New capabilities we have not planned for

Ranked by value to the consolidation work. Each is an option to evaluate after parity, not a commitment.

1. **Eve tool stubs in evals (0.75)** — canned tool outcomes and injected errors per session: deterministic Kyoshi/Sensei evals without inference cost. Directly serves "free contract and cassette tests first".
2. **Eve human-in-the-loop holds the turn (0.70)** — approvals/sign-ins emit `turn.waiting` and resume the same turn; `approval.prompt` (0.79); messages queue behind a pending question (0.79.1). This overlaps what our TanStack patch and the authoring chat-queue design hand-build — evaluate before rewriting the patch.
3. **Streaming tool events and consistent approvals across adapters (harness)** — tool events per execution; parallel/sequential approvals unified; OpenCode no longer hangs on approval or tool-result continuations. The most relevant change for moving learning onto HarnessAgent.
4. **Mid-turn steering** — codex-acp `_session/steering`, Codex adapter steering, Pi `steer`/`followUp`: fold a message sent during a turn into it, instead of today's "already responding" error.
5. **ACP `session/resume` and `session/close`** — reattach without replaying history (we replay through `loadSession` and patch it up with `finishOpenParts`), and close sessions explicitly.
6. **Per-session instructions** — codex-acp 2.2 `customInstructions` in `session/new`: one Codex process can serve every lesson instead of one process per instruction set.
7. **Usage and plan visibility** — ACP `usage_update` (context, window, cost), quota, and `plan` updates rendered as AG-UI activity messages: a context/cost meter and visible lesson plan.
8. **Eve workflow tools** (`execute`/`task`/`serve`, `ctx.ask`, `ctx.agent().send({ outputSchema })`) — the most direct route if durable evaluation jobs become necessary; `@ai-sdk/workflow-harness` targets Vercel sandboxes and fits our local sandbox poorly.
9. **Persistence and reload** — TanStack `persistence` + hydrate (rejoin a running turn, paged history) and Eve `sessions.attach().stream()`; pick one owner rather than both.
10. **Eve scoring/judging** — `t.score().label().gate()`, `t.judge()` with decision models, per-eval usage reporting; candidate shape for course-owned evals.
11. **Pi additions** — native MCP + `tool_search`, `cacheRetention` (1-hour Anthropic cache), `fileToolPathPolicy`, writable sandbox roots; Sign in with ChatGPT on Pi's OpenAI provider.
12. **`toolsContext`/`runtimeContext`** on HarnessAgent for per-turn tool context and telemetry.

Also relevant to open product decisions:

- **Claude Code adapter** exists (not installed): it runs the Claude Agent SDK and the bundled `claude` CLI inside the sandbox, discovers `~/.claude/.credentials.json` or the macOS Keychain entry, refreshes and brokers the OAuth token. Whether that brokering is acceptable under Anthropic's rules for a third-party product is unresolved — see the consolidation proposal; do not ship before that review.
- New TanStack packages `@tanstack/ai-acp` (ACP → AG-UI, but pinned to ACP SDK ^0.25) and `@tanstack/ai-codex` (Codex SDK, not ACP): not usable as-is; worth watching.

## Documentation parity deliverables

Parity is done when these exist and agree with the installed versions:

1. **Dependency ledger** — a table in `docs/architecture/` (or `patches/README.md`): package, resolved version, why pinned (if not latest), official docs link, patch and its removal gate, upstream issue link, date last verified. Updated in every stage.
2. **`patches/README.md`** — rewritten per patch after each rebase: what it fixes at the new version, regression test, upstream link. Add the three Eve patches (currently only documented in the consolidation proposal).
3. **`agent-runtime-consolidation.md`** — replace version-specific statements with ledger references: the FX native-login finding now reads "native discovery ends at 1.0.67"; the Pi row reads "bundled Pi 1.x after stage 2"; the eval-stack provenance item closes after stage 2; add stage 5's session decision to its open decisions.
4. **`run-coordinator.md`** — mark which ACP statements still hold after stage 4 (session resume, elicitation), or mark it historical as the consolidation proposal suggests.
5. **Setup prototype in `packages/uix`** — install commands and agent list follow the adapter set chosen in stage 2; fixture "Installed" states and the ChatGPT/OpenRouter buttons are labelled as prototypes until real routes exist.

## Decisions to make before starting

1. **FX route** — keep native logins (Set A, harness 1.0.153) or go Gateway-only (Set B). Recommended: Set A now.
2. **Existing Eve sessions** — reset, read-only legacy history, or a migration window. Required before stage 5; shared with the consolidation proposal's learning-session decision.
3. **Harness state in the user's home** — accept `~/.ai-sdk-harness` under the real HOME with the local sandbox, or set a Dojo-owned HOME for sandboxes.
4. **Upstream contributions** — who files the OpenCode `switchModel` and TanStack interrupt-queue fixes.

## Evidence and limits

Findings come from published npm tarballs and their changelogs (compared file by file for Eve and the harness adapters), vercel/ai and TanStack GitHub history, official documentation, and reading this worktree's code. Spot-checked in code: dev-server calls without `resume` (`runtime.ts:56`, `authoring.ts:64`), `closedQA` in `teaching.eval.ts`, the AIR declaration in `harness/codex.ts`, `unstable_createElicitation` in `codex-client.ts:489`, and the `pi-ai/compat` import in `models.ts`. Verified on npm: FX's switch to `libfx` at 1.0.68, harness-pi's move to Pi 1.x at 1.0.149, and the matching harness 1.0.153 set.

Not verified: compiling against any new version, `ai` 7.0.98 → 7.0.143 changelog detail, the Pi session-restore format change against our stored `resumeFrom` data, and any live sign-in or model call. No packages were installed or run.
