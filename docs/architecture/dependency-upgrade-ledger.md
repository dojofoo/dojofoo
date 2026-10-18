# Runtime dependency upgrade ledger

Execution of [the staged upgrade plan](./dependency-upgrade-plan.md). No paid
model calls are permitted. Native authentication and teaching quality require
separate live acceptance tests; offline passes do not establish either.

## Baseline — 2026-10-18

Checkout: `.worktree/monaco-editor`, starting at `f541b94`. Existing user edits
are retained. Commands use Node 24.19.0 and the repository's pnpm version.
Full logs for this run: `/tmp/dojo-dependency-upgrade.oetcO6/`.

| Gate | Before dependency changes |
| --- | --- |
| Config/protocol Vitest | 3 files, 6 tests pass |
| CLI Vitest | 145 pass; two 5-second timeouts under parallel load; isolated smoke/telemetry rerun passes all 66 tests |
| UI Vitest (excluding live tests) | 333 pass, 5 fail across 2 files |
| Authoring Vitest (excluding live and native runtime-turn tests) | 217 pass, 19 skipped |
| Authoring native loopback turns | 4 pass; FX fails: old ACP adapter requires `code` mode, installed FX advertises `auto`, `ask`, `full-access` |
| Evals Vitest (excluding live tests) | 67 pass |
| Config/protocol/CLI/UI/authoring/evals/agent typechecks | All seven pass |
| UI production build | Passes on the original installed Nitro |
| Agent fast offline tests | 27 pass, 1 optional mise integration skipped |
| Agent clean-consumer packaging | 71 tests pass |
| Agent full integration | Provider, authored discovery, Pi journal recovery, seven OpenCode paths and two host scenarios pass; skill fixture fails due to a wrong package symlink |

Pre-existing UI failures: `icon-context.test.tsx` detects a Lucide import in
`arc/copy-button`; `-chat-message.fixture.test.tsx` fails protocol order,
collapsed timeline, persisted duration, and authored fragment rendering checks.
These are recorded, not accepted as new regressions or silently removed.
Eve also emits `setEveAttributes` warnings from plain host code in baseline
fixtures; these are not introduced by an upgrade.

## Dependency targets

| Dependency | Baseline direct pins | Target | Reference / reason |
| --- | --- | --- | --- |
| `@ai-sdk/react` | 4.0.61 | Remove | No source imports; chat uses TanStack |
| `nitro` | 3.0.260415-beta / 3.0.260903-beta | 3.0.260903-beta | [Nitro](https://nitro.build/docs/migration); unify existing server version |
| `ai` | 7.0.98 / ^7.0.77 | 7.0.142 | [AI SDK](https://ai-sdk.dev/docs); exact Harness 1.0.153 dependency, meets Eve target's peer requirement |
| `@ai-sdk/provider` | 4.0.14 | 4.0.28 | [Provider specification](https://ai-sdk.dev/providers/community-providers/custom-providers); exact Harness dependency |
| `@modelcontextprotocol/sdk` | ^1.30.0 | 1.32.1 | [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk); stay on v1 |
| `just-bash` | 3.1.0 | 3.6.0 | [just-bash](https://github.com/vercel-labs/just-bash) |
| `@ai-sdk/harness` | 1.0.71 / 1.0.85 / 1.0.108 | 1.0.153 | [HarnessAgent](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-agent); native FX-compatible set |
| Harness Codex/OpenCode/Pi | 1.0.87 / 1.0.110 | 1.0.155 | [Adapters](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters); exact Harness dependency alignment |
| Harness Cursor/FX | 1.0.21 | 1.0.67 | Last FX release preserving native login |
| Harness Grok Build | 1.0.45 | 1.0.91 | Exact Harness dependency alignment |
| `@ai-sdk/sandbox-just-bash` | 1.0.85 / 1.0.108 | 1.0.153 | Match the production Harness version |
| Direct Pi AI/coding-agent | 0.84.4 | 1.3.0 | [Pi](https://pi.dev); align configuration format |
| TanStack AI/client/react | 0.47.1 / 0.25.1 / 0.21.1 | 0.69.0 / 0.39.3 / 0.30.4 | [TanStack AI](https://tanstack.com/ai); queue patch remains required |
| ACP SDK / Codex bridge | ^1.3.0 / ^1.4.0 | 1.9.0 / 2.2.2 | [ACP](https://agentclientprotocol.com); migrate together |
| Eve | 0.53.0 | 0.80.1 | [Eve](https://eve.dev/docs); session transition gate applies |

These are targets, not claims about installed versions. Each completed stage
must record the actual lockfile resolution and its verification below.

## Stage status

| Stage | Status | Gate |
| --- | --- | --- |
| 0: baseline, unused React SDK, Nitro alignment | Affected checks pass | UI typecheck/build pass; same 333 passing and 5 pre-existing failing tests |
| 1: MCP/just-bash; AI SDK deferred to 2 | Passes, with recorded baseline UI failures | Clean-package CLI/browser fixture defects corrected and verified |
| 2: aligned Harness 1.0.153 adapter set | Passes, with recorded baseline UI failures | Types, packaging, native loopback cases, CLI/browser checks pass |
| 3: TanStack and queue patch | Passes, with recorded baseline UI failures | Red/green public-client tests, both browser queue tests, CLI/browser restart, types and build |
| 4: ACP SDK and Codex bridge together | Passes, with recorded baseline UI failures | Actual SDK elicitation, streamed JSON verification, CLI 147 tests, packaging and build |
| 5: Eve last | Passes, with recorded baseline UI failures | 75 packaged-agent tests, 79 combined integration tests, six native runtime checks, archive/queue browser tests, types and builds |

Selected adapter target is set A from the plan: Harness 1.0.153;
Codex/OpenCode/Pi 1.0.155; Cursor/FX 1.0.67; Grok Build 1.0.91;
just-bash sandbox 1.0.153. FX's native sign-in route must not be replaced by
Gateway-only authentication.

### Stage 0 changes

- Removed unused `@ai-sdk/react` 4.0.61 from UI; repository source has no imports.
  Lockfile cleanup also removes its orphaned dependencies. pnpm recomputes several
  existing Vitest peer snapshots without changing those package versions.
- Aligned the UI Nitro pin to 3.0.260903-beta, already used by agent and web.
  Its published Node requirement is `^20.19.0 || >=22.12.0`; verification uses
  Node 24.19.0. See [Nitro migration guidance](https://nitro.build/docs/migration).
- Frozen installation passes. UI typecheck and production build pass; UI Vitest
  has exactly the same 333 passes and five pre-existing failures. Installed
  Nitro is 3.0.260903-beta in UI, web, and agent.

### Stage 1 changes

MCP SDK is pinned to 1.32.1 and just-bash to 3.6.0.
Harness, ACP, TanStack, and Eve are unchanged in this step.

**Evidence-based sequencing correction:** initially updating AI SDK to 7.0.143
and provider to 4.0.29 failed the agent typecheck. Harness 1.0.108 still exposes
AI SDK 7.0.98/provider 4.0.14 types; the newer provider permits readonly JSON
values that the old signatures reject (TS2322 in `harness-model.ts`, TS2883 in
`local-process-host.ts`). No cast, override, or type suppression was added.
Those AI SDK/provider manifest edits were reverted and move into stage 2 with
the coherent Harness stack. Log: `stage1-agent-build.log` in the baseline log
directory. The exact companion-version correction is recorded in stage 2.

MCP/just-bash gates: CLI 147/147; evals 67/67; authoring 217 pass and 19
intentional skips after a serial rebuild/rerun; UI retains the same 333 passes
and five baseline failures; agent typecheck/build pass; fast tests 27 pass with
one optional mise skip; clean-consumer packaging 71/71. Full integration rerun
reached and passed provider, Pi, OpenCode, host and skill scenarios. Its final
CLI/browser fixture exposed a missing copied module, then browser alerts;
those shared-fixture issues were subsequently corrected below. UI production build passes.

Verification correction: do not run tests importing the assembled agent while
`build-runtime.mjs` replaces `dist/eve`. An overlapping run produced missing
module failures; rerunning after the build restored all authoring baseline
passes. This is a verification race, not a dependency regression.

The baseline skill fixture computed its package symlink relative to the fixture
file. That points to the wrong directory after clean-consumer copying. It now
resolves the exported package manifest instead; the clean-consumer integration
suite passes this exact scenario. No production behavior was changed.

### Stage 2 execution

Installed the selected production/eval pins. The clean-consumer fixture now
reads production adapter versions from authoring's manifest and asserts UI/eval
AI SDK and Harness alignment. Only compile-only extra adapters retain their own
explicit version list.

Migrated learner fixture/response generation to caller-owned sandbox sessions.
Three added tests cover cleanup after session creation/destruction failures;
the two-lesson test checks distinct sessions and sandbox cleanup. Migrated the
Pi introduction and full-course eval drivers to the current network-sandbox API.

Removed `canonicalLocalPi`: the new official adapter's workspace VFS handles
the symlinked course. The positive native read/write loopback regression passes
without the wrapper; the obsolete negative test was removed.

Actual-adapter offline contracts pass for Cursor's local executable bootstrap
and Pi 1.x model/auth discovery. They use fixture-only credentials, never real
login files. No inference is performed by either contract.

State decision: keep the native HOME unchanged. Harness 1.0.153 fixes generated
state at `HOME/.ai-sdk-harness`, separate from native login locations; its API
does not expose an independent state-root option. Rewriting HOME would change
native CLI login discovery, especially the local Cursor binding. Do not use
credential copies or aliases to simulate a different HOME. This is local host
execution, not a security boundary; upstream may still forward credentials when
the sandbox cannot broker requests.

**Exact companion versions:** Harness 1.0.153 depends on AI SDK 7.0.142,
provider 4.0.28, and provider-utils 5.0.61. AI SDK 7.0.143 instead brings
provider-utils 5.0.62; their separately declared unique schema symbols make
tool types incompatible. The first stage-2 typecheck reproduced this. Use the
published matching set (7.0.142/4.0.28), not overrides, casts, or suppressions.
This supersedes the plan's independently selected 7.0.143/4.0.29 targets while
retaining its required Harness 1.0.153 and FX native login route.

Rebased the OpenCode patch against the published 1.0.155 bridge in
`patches/@ai-sdk__harness-opencode@1.0.155.patch`; `git apply --check` passes.
It is now active; the obsolete 1.0.110 patch was removed (retained in Git history).
The change still removes the v2 model switch and
sets the model on the legacy prompt request. The regression will exercise the
installed patched bridge; the focused selection tests pass.

Additional compile-only adapter versions targeting Harness 1.0.153 were
verified from registry metadata: Claude Code 1.0.157, Cline 1.0.80,
DeepAgents 1.0.153, GitHub Copilot 1.0.49. These are fixture compatibility checks,
not enabled product runtimes or proof of native subscription support.

FX 1.0.67 source still maps `allow-all` to ACP session mode `code`; do not
assume the version bump fixes the baseline installed-CLI mode mismatch. Its
source does retain `.fx/chatgpt-auth.json` and `.fx/grok-auth.json` discovery.
The chosen stack must be tested against the actual bootstrap/CLI selection,
without replacing native credentials with a Gateway key.

Stage-2 checks so far: agent/authoring/evals/UI typechecks pass; the agent build
and 71 clean-consumer packaging tests pass; 27 fast agent tests pass (one
optional mise test skipped). The authoring suite passes 219 tests with 19
intentional skips before adding two further passing native-configuration
contracts. Evals pass 67 tests, CLI passes 147, and UI retains exactly the
baseline 333 passes / five failures. The UI production build passes.
Full multi-adapter lifecycle verification is recorded below. The clean-consumer
CLI and browser question/restart tests both pass after the fixture corrections.

The multi-adapter run passes both OpenCode selections, Grok and FX. Its Codex
case exposed a stale test assumption: the new adapter advertises native host
tools rather than a shell relay command. Removed that relay-specific fixture
branch; Codex passes against its advertised `dojo_ui_ask` tool (66.8 seconds). This follows
the [official dynamic-tool flow](https://learn.chatgpt.com/docs/app-server).
No production Codex handler or authentication was changed for this correction.

The clean-consumer CLI test also exposed an omitted fixture dependency:
`eve/bootstrap.ts` was not copied beside `eve/messages.ts`. The fixture copy
list now includes it. The CLI-only non-browser run passes; the browser run
resumes the question successfully but found two empty alerts after reloading.
The installed Monaco source creates two empty `.monaco-alert` screen-reader
announcers. The test now excludes those specific infrastructure nodes while
retaining the application-alert, page-error and failed-response checks.
The corrected CLI/browser run passes both tests (44.9 seconds). It uses the
packed agent, real Eve server, actual Pi adapter with loopback inference, and
the current UI. Receipt and native history survive the restart and reload.

### Stage 3 preparation

Rebased the queue patch onto TanStack client 0.39.3 source and distribution.
Forward and reverse apply checks pass against the published artifact.
The patch respects the new per-send body merge before queueing. It is now
active; workspace integration checks follow.
Three fast public-client regression tests cover queued input, drop policy,
and rejecting a replacement that would discard an unanswered question.
They pass against the existing 0.25.1 patch. In a clean isolated npm install,
unpatched 0.39.3 fails queue/drop cases; applying the prepared patch makes all
three pass. Logs: `tanstack-repro-before.log` and `tanstack-repro-after.log`.

Local upstream contribution drafts and the OpenCode source patch are under
`patches/upstream/`. No upstream issue or PR has been published.

Stage 3 verification: TanStack AI 0.69.0, client 0.39.3 and React 0.30.4
pass authoring/UI type checks and the UI production build. Authoring's offline
suite passes; UI retains the same five baseline failures (333 passes).
All 15 cassette tests pass after moving extension fields into `metadata.tanstack`.
Both browser queue tests pass against the upgraded client. Their request fixture
now uses TanStack's official request parser instead of assuming UI-message wire
format; production already uses that parser. The obsolete 0.25.1 patch is removed.
The packed-consumer restart suite also passes both native CLI and browser cases
(56.1 seconds), using loopback inference only.

### Stage 4 — ACP and Codex bridge

Upgraded SDK 1.9.0 and Codex ACP 2.2.2 together. Registered `createElicitation`
under its current name and explicitly advertised `terminal_output_delta` while
retaining typed AIR failure metadata. The existing append projection handles
partial updates without repeated title/input/status fields. Regression tests
cover split JSON output and a terminal status-only update, plus an actual SDK
agent/client connection exchanging a form question and answer. All 39 focused
tests pass; UI and CLI types pass. The wider UI run retains five baseline
failures, with 338 passing tests and four intentional skips.

Only form elicitation is advertised. URL elicitation is declined, so no
`completeElicitation` handler is needed: that notification completes URL
elicitation, not the synchronous form requests we support. This is intentional
rather than registering an unused no-op handler. Native sign-in remains
unverified; the installed executable override and credential environment are
unchanged.

Stage-4 wider gates: CLI 147/147, agent packaging 71/71, UI production build,
and UI/CLI typechecks pass. The five UI failures remain the captured baseline.

### Stage 5 preparation — history before runtime changes

Captured a real 0.53.0 loopback session after a question, answer, restart and
follow-up using the packed consumer. Its public snapshot has 24 events and five
messages. The unmodified 0.80.1 message reducer reads every message, including
the final reply. The full fixture app and persisted local-world data are retained
outside the repository in `/tmp/dojo-dependency-upgrade.oetcO6/eve-0.53-history`.
The opt-in capture hook is limited to this synthetic integration fixture.

This proved event projection compatibility, not upgraded-server storage
compatibility. The actual new host probe then exposed destructive upstream
behavior: Workflow deletes flat-layout stores before Eve can return a stranded
session. Only a disposable copy was deleted; the captured original remained intact.
Source inspection also corrects the plan's
stream claim: 0.80.1 accepts stream versions 21–26; do not add a custom protocol
migration based only on the current version number.

### Stage 5 — Eve 0.80.1

Eve is now pinned to 0.80.1 with undici 8.10.2. All three patches apply to its
published artifact; the upstream web-search fix replaces our old search patch.
The compaction extension now delegates from the new compaction step. Native
completion/context usage support moved to the new after-model step. Distribution
support preserves the server helper alongside Eve's new public server API.
The old ESM package-scope workaround is removed: 0.80.1 no longer ships those
mis-scoped `node_modules/.pnpm` chunks. Six upstream `eve-source` conditions
point at unpublished source files; our distribution maps them to their shipped
JavaScript entry points instead.
The compaction patch preserves upstream declaration line endings: removing
line-ending-only noise reduces it from 816 to 51 lines, including the readiness
hook below. It applies cleanly to the published artifact.

Before starting the new local World, the development host archives the known
0.53 flat-layout store intact at `.eve/legacy-workflow-data`. It refuses unknown
formats, symlinked stores and archive collisions rather than losing data.
Archived events are read through the **current** Workflow stream reader and
serializer without starting its execution engine. There is no old Eve runtime
or hand-written binary decoder. Read-only authoring views disable answers and
the composer and offer an explicit new-conversation action; writes return 409.
Course files and native credentials are untouched.

The checked-in synthetic 0.53 fixture has 24 events. Regression tests compare
every archived byte before/after reading, and verify refusal paths. The actual
patched-host probe reads all five messages after startup without deleting the
store. The browser archive/new-conversation test passes. The current 75-test
packed-consumer suite passes, including native compaction, dynamic routing,
provider metadata, filesystem persistence and every public export. Authoring
passes 225 offline tests (19 intentional skips); agent/authoring/UI/evals types
pass. The host/question/restart fixtures now use Eve's workflow question API.
The final isolated combined run passes all 79 tests.

Final clean-install verification also exposed a packaging gap: the CLI test
installed only config and CLI, while authoring had never shipped compiled
entry points. The fixture now installs config, agent, authoring and CLI tarballs.
Authoring builds ESM JavaScript with source types/development conditions; the
production runtime no longer asks Node to strip TypeScript in `node_modules`.
The packed CLI serves HTTP 200. The agent integration runner also uses the real
authoring/config tarballs instead of a partial source-copy substitute.

CLI and authoring now declare Node >=24, matching the agent's existing engine
requirement. This is part of the approved breaking upgrade, not a change to
course-owned toolchains. CLI build targets and installation docs agree.

Final browser rerun: all three queue/interrupt/archive scenarios pass. Frozen
installation, UI production build and UI/CLI/authoring/eval types pass. The
broader host suite, combined integration run and native-runtime gates pass after
the compaction correction described below.

The native authoring fixture also needed the new `ask_question` contract:
`question`, two or three `{ label, description }` options, and the chosen label
as the option ID. A free Standard Schema contract now rejects the old payload
before any harness starts. This is a fixture migration, not an extra wire format.
All six native-runtime tests pass: schema validation plus explicit/default OpenCode model
selection, Grok, FX and Codex, with question answers after a host restart. These
use loopback inference and fixture credentials, not subscription calls.

The scripted host's 32k-context recovery case exposed a restart failure. Raising
the fixture's context budget and changing shutdown order were investigated, not
accepted as fixes: the latter regressed real native pending-question recovery.
Eve's original shutdown lifecycle is retained. The fixture placed editable course
files inside its watched agent root, unlike production; saving those files could
race an authored-agent rebuild against shutdown. It now mounts a separate sibling
course directory, matching production. Its original 32k context remains.
A focused regression additionally proved that Eve was marking
deferred native compaction as completed and replacing its history state. The
existing native-compaction extension now has an optional readiness check;
unfinished native tool turns leave the Eve session, memory preparation and events
unchanged. Ordinary compaction and ready native turns keep their existing paths.
The regression failed before the guard; all 61 provider tests and both hosted
session variants now pass. The final isolated combined run passes all 79 tests,
including authored skills, native OpenCode recovery, and Pi CLI/browser restart.
The preceding combined run hit an `ERR_PNPM_ENOENT` while importing an OpenCode
bootstrap package into its temporary store. The isolated rerun passed that same
case. No retry or cache-reset workaround was added; the failed run's log is kept.

Final fast-agent checks: 27 pass, one optional real-mise integration is skipped.
The final UI run excludes live-test files: 335 pass and the same five baseline
checks fail. The three safe unit cases housed in `teaching-comparison.live.test.ts`
are run separately by exact name; live model cases remain excluded.
All three pass, bringing the safe UI total to 338 passes and five baseline failures.
Native Grok/FX adapters warn that process-loss recovery may replay a prompt;
the question/restart checks pass, but arbitrary tool idempotency is not claimed.
Upstream sandbox-deprecation, optional-microsandbox and shutdown connection
warnings remain visible. They are not suppressed or treated as live-auth proof.

## Recovery and data safety

Session decision (2026-10-18): the user approved a breaking Eve upgrade without
backwards-runtime compatibility. Old histories remain readable; further work
starts in an explicit new conversation. No silent reset or deletion, and no
parallel legacy Eve runtime. Course files remain unchanged by this transition.

- No course files, saved sessions, or native credential files are deleted or migrated.
- Dependency changes stay separate from pre-existing source changes.
- Each stage records its manifest/lockfile changes and patch revisions here.
- Preserve legacy Eve history before changing its runtime; never silently reset a conversation.
- Upstream fixes will be prepared locally; publishing issues or PRs is a separate action.

### Operating the breaking transition

1. Stop the local authoring server before installing the upgraded stack. Back up
   the course's `.dojo/kyoshi-app` directory, including hidden `.eve` state.
2. Restart authoring against the same course. The known old store is archived
   before the new World starts. Open an old session to read its transcript;
   choose **New conversation** to continue authoring the existing course files.
3. If startup refuses an unknown store, symlink, or existing archive, keep both
   directories intact and inspect the reported paths. Do not delete `.eve` to
   bypass the check: it contains history, not just a compiler cache.
4. To roll back, stop the new server, preserve its new history separately, and
   restore the complete pre-upgrade backup with the previous dependency set.
   Never run an old World against a new store, or overwrite either history tree.

Live sign-in and teaching quality are outside these offline gates. The retained
FX adapter and unchanged native HOME preserve the sign-in route; they do not
prove that a current subscription or installed CLI will authenticate successfully.
