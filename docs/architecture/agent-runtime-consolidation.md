# Agent runtime consolidation: review proposal

Status: revised after adversarial review; consolidation is not yet approved. Dependency maintenance is being implemented separately in the [upgrade ledger](./dependency-upgrade-ledger.md). Its completed checks do not authorize migrating learning onto a different authentication path.

Reviewed: 2026-10-18. Implementation inspected in `.worktree/monaco-editor`, not the older root checkout. Code references below are relative to this checkout. Published documentation describes newer releases in places; it is evidence of available approaches, not proof that our pinned packages implement them.

## Adversarial review: decision changes

The first version overvalued fewer execution paths and underweighted preservation of sign-in, billing, installed binaries, and local configuration. **A common interface is a goal; forcing every learner onto the same bootstrap/authentication strategy is not.** Do not retire a working local-CLI path until its replacement preserves the learner's usable credentials, permissions, and behavior.

Accepted corrections:

- Compare OpenCode, the existing default, before enabling the previously unsupported Pi learning route. There is no Pi learning baseline to diff.
- Trial hygiene is an immediate correctness/security concern and can ship independently, not merely a later optimization.
- Course-owned executable evals are a new public feature, not an existing runner to reuse.
- Account-provider choices in UIX are prototypes, not completed authentication integrations.
- Catalogue five patch sets, not only the three Eve patch sets.
- Compare dependency graphs and resolved runtime versions, not adapter version numbers alone.
- Record auto-approval policy, concurrent-session safety, startup/setup timings, and usage limits explicitly.

Corrections to the review itself:

- **FX:** native discovery is retained through adapter 1.0.67, now pinned in the upgrade set. From 1.0.68 its implementation is Gateway-only. Do not apply the latest docs to the pinned native route. Arbitrary FX provider/configuration compatibility remains unproven.
- **Cursor:** the stock adapter uses `CURSOR_API_KEY`, but can derive that value from native auth/keychain discovery; the variable name does not by itself prove separate paid-API billing. Our authoring path additionally uses `createLocalCursor()`: `auth: {}`, no native credential discovery, installed `agent` executable, and `privateHome: false`. This bypasses stock bootstrap/auth behavior intentionally. Keep this wrapper in the compatibility inventory; do not mistake it for stock-adapter support or assume it needs replacement.
- **Claude:** current Anthropic policy distinguishes using the unmodified Claude Code binary with the end user's own login from a third-party application collecting/intermediating Claude credentials. A blanket statement that all subscription-backed execution through a wrapper is forbidden is too strong. This is not legal clearance for our integration. Do not offer Claude support until the exact implementation and applicable terms have been reviewed.
- **Eval discovery:** `draftLessons` does find `eval.yaml`/`*.eval.yaml`, and the file writer checks YAML shape. That is filename/UI discovery, not an implemented public scenario schema and executor.
- **Version numbers:** the baseline had a real eval/production provenance difference. The upgrade aligns production and evals on Harness 1.0.153 and its compatible adapter releases; the clean-consumer test verifies each adapter's declared Harness dependency. See the ledger for exact pins and the AI SDK schema-identity constraint.
- **Preparation:** a new trial folder bypasses any previous per-folder success cache, but the manual trial route does not itself call `prepareWorkspace`. The eval handoff explicitly does; lesson CLI calls can also request preparation. Some server-side calls deliberately set `DOJO_SKIP_PREPARE=1`. We must measure/trace each path: the risk includes both repeated setup and missing setup, not a proven full reinstall on every manual trial click.

Evidence boundaries: these findings come from reading code, installed package artifacts, tests, and current primary documentation. No new live authentication test, model call, installer run, or credential inspection was performed. Existing test files are not evidence of a fresh successful run.

Sources for these qualifications: [FX docs](https://ai-sdk.dev/providers/ai-sdk-harnesses/fx), [Cursor docs](https://ai-sdk.dev/providers/ai-sdk-harnesses/cursor), [Anthropic authentication and product embedding rules](https://code.claude.com/docs/en/legal-and-compliance), [local Cursor wrapper](../../packages/authoring/src/eve/local-cursor.ts), [Cursor wrapper tests](../../packages/authoring/src/eve/local-cursor.test.ts), [prior recorded FX failure](../research/kata-teaching/audit.md#18-terminal-broad-suite-result).

## Goal and corrected boundaries

Use the same supported agent execution path for authoring and learning. Make trial equivalent to opening a temporary, normally installed learning workspace. Keep evaluation flexible enough for a course author to test their lessons without making every course depend on our internal evaluation suite.

- **Pi must be a supported learning runtime.** The current rejection is an implementation gap, not an intentional product restriction.
- **Trial is ordinary learning.** It prepares temporary course files and starts a normal Sensei session. It is not another agent framework, conversation protocol, or execution mode.
- **Kyoshi stays independent.** Opening or closing a trial does not replace, reset, or transplant the authoring conversation.
- **Isolate execution-based lesson evals.** Their learner edits and progress must not modify the author's course or personal learning progress.
- **Do not isolate everything.** Material reviews, prompt comparisons, and our own Kyoshi checks do not need an installed temporary course unless the scenario actually executes one.
- **Support course-owned evals.** Authors may define optional lesson checks and use the evaluation UI. They need not adopt our judges, quotas, fixtures, or pedagogical rubric.
- **Do not add a global state-machine framework by default.** Prefer existing session lifecycles and small ordinary functions. Introduce durable job execution only for a concrete recovery requirement.
- **Preserve the existing sign-in and billing route.** Do not silently replace a subscription login with a paid API/Gateway route. Environment credentials must not override the user's explicit account choice.
- **Do not turn teaching into a workflow script.** Infrastructure decides which material and tools are available; the Sensei decides how to teach within the authored guidance.

The previous suggestion to give trial its own durable job lifecycle was too broad. A reliable temporary-workspace setup followed by the existing learning entry point is sufficient unless measurements demonstrate otherwise.

## What exists today

| Area | Observed implementation | Consequence |
| --- | --- | --- |
| Authoring | Eve session → our model provider → official HarnessAgent → official adapter | Already uses durable session machinery |
| Learning | Lesson service → our ACP client → our runtime adapters | Separate lifecycle, tool, history, and configuration implementation |
| Trial | Copies the course beneath its own `.dojo/trials`, then uses lesson services | Correct reuse intent, but cleanup, symlinks, secrets and preparation require work |
| Evaluation | Preflight, material review, production teaching trial, teaching review, report/receipt files | Useful evidence and cost safeguards, but tightly coupled policy and execution |
| Preparation | Shared mise preparation functions with an in-process cache | Reuse these functions; do not invent an environment installer |
| Chat | Eve-to-AG-UI and ACP-to-AG-UI projections | Two paths to maintain for broadly similar interactions |

Important source locations:

- [Kyoshi agent](../../packages/authoring/src/eve/agent.ts): Eve `defineAgent`, dynamically configured model provider.
- [Kyoshi runtime](../../packages/authoring/src/eve/runtime.ts): managed app preparation, local host, readiness, cleanup.
- [Harness-backed model provider](../../packages/agent/src/harness-model.ts): native checkpoint/continuation bridge and compaction hook.
- [Learning runtime registry](../../packages/ui/src/server/harness/registry.ts): explicit Pi rejection.
- [ACP client](../../packages/ui/src/server/lesson/codex-client.ts): native process/session management, transcript projection, permissions, questions, model configuration.
- [Lesson services](../../packages/ui/src/server/lesson/service.ts): instruction/context assembly, checks, introduction, progression, session binding.
- [Trial setup](../../packages/authoring/src/server/service.ts): `createLessonTrial`.
- [Evaluation runner](../../packages/authoring/src/evaluation/run.ts), [evaluation host](../../packages/authoring/src/evaluation/host.ts), and [evaluation settings](../../packages/authoring/src/evaluation/settings.ts).
- [Preparation](../../packages/config/src/project-preparation.ts), [runtime selection](../../packages/config/src/runtime.ts), and [filesystem watcher](../../packages/ui/src/server/authoring-watch.ts). Runtime selection is currently an **untracked new file in this worktree**, not a committed/released baseline.

The older [run-coordinator document](./run-coordinator.md) describes the ACP-oriented design. Its statement that unfinished interactions are discarded after a restart is not the target for durable Eve questions. Treat that document as historical for this review; update it once a replacement is implemented and verified.

## Why Pi is rejected

The learning registry accepts Codex, OpenCode, Cursor, Grok, and FX through our ACP adapter interface. It explicitly throws when the requested harness is Pi. Authoring instead uses `@ai-sdk/harness-pi` through HarnessAgent.

These are different integration routes. The existence of a Pi entry in an installation screen or evaluation settings does not connect Pi to the learning registry. Removing the error alone would just fail later when no lesson adapter exists.

The official Pi adapter is a host-process harness integration; it is not dependent on our ACP client. Its availability supports using the common HarnessAgent route rather than writing another Pi-specific ACP implementation. Actual authentication, continuation, and tool behavior still need acceptance tests on our installed version. [Official Pi adapter](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi), [adapter overview](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters).

## Authentication, installation and billing matrix

This is a **preliminary compatibility inventory**, not certification. The official list has ten adapters, including Claude Code; Claude is not an eleventh adapter. Only six are in the production authoring registry. The remaining rows are documentation-only until their exact package artifacts and terms are audited.

| Agent | Current Dojo learning | Official adapter / current authoring distinction | Migration decision |
| --- | --- | --- | --- |
| OpenCode | Installed CLI and its native providers/login | Authoring 1.0.155 has a packaged bridge/bootstrap, native credential discovery and provider/environment routing; also carries our model-switch patch | First comparison target. Keep ACP learning until the same chosen provider and billing route pass |
| Codex | Local Codex ACP integration and native login | Adapter 1.0.155 discovers native subscription credentials and also supports API/Gateway routing; managed runtime/bootstrap differs | Verify subscription-only operation, explicit-route precedence and credential handling before changing learning |
| Cursor | Installed `agent --yolo --trust acp` | Stock adapter bootstraps another CLI/home and uses a Cursor credential. Our actual authoring wrapper preserves installed `agent` and native home instead | Test the existing wrapper, not stock assumptions. Preserve it if it is necessary for login continuity |
| Grok | Installed `grok`, native configuration, bypass-permissions mode | Adapter 1.0.91 uses its managed bootstrap and native/API/Gateway configuration | Verify actual subscription behavior separately; no silent binary replacement |
| FX | Installed `fx acp`, native home, yolo mode | Pinned 1.0.67 retains native discovery; 1.0.68+ uses the incompatible Gateway-only route | Offline lifecycle passes with the pinned bootstrap. Native sign-in still needs live acceptance; do not force Gateway |
| Pi | Rejected by the learning registry | Adapter 1.0.155 runs bundled Pi 1.3.0 in-process and accepts `agentDir`; it does not execute installed `pi` | New learning capability after OpenCode comparison. Configuration fixtures and loopback journal recovery pass; real account acceptance remains separate |
| Claude Code | No production integration | Not a production dependency/registry entry. Official adapter uses the Claude Agent SDK/managed bridge; auth discovery capability is not permission to intermediate subscription tokens | Stop presenting as working/installed by default. Supporting it requires an explicit product/terms and authentication decision |
| GitHub Copilot | No production integration | Docs describe a pinned CLI bootstrap, direct GitHub credentials/native discovery or Gateway; Copilot entitlement is separate from a token merely existing | Future support only after binary, login, entitlement and tool acceptance; do not equate setup card with support |
| Cline | No production integration | Docs describe in-process `@cline/agents`, direct Cline/provider configuration or Gateway, with no sandbox bootstrap | Future support; not evidence of using the user's installed Cline setup |
| Deep Agents | No production integration | Listed official adapter; no installed production artifact audited here | Leave unadvertised as working. Installation, auth, provider and subscription semantics are open research items |

Sources: [OpenCode](https://ai-sdk.dev/providers/ai-sdk-harnesses/opencode), [Codex](https://ai-sdk.dev/providers/ai-sdk-harnesses/codex), [Cursor](https://ai-sdk.dev/providers/ai-sdk-harnesses/cursor), [Grok](https://ai-sdk.dev/providers/ai-sdk-harnesses/grok-build), [FX](https://ai-sdk.dev/providers/ai-sdk-harnesses/fx), [Pi](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi), [Claude Code](https://ai-sdk.dev/providers/ai-sdk-harnesses/claude-code), [Copilot](https://ai-sdk.dev/providers/ai-sdk-harnesses/github-copilot), [Cline](https://ai-sdk.dev/providers/ai-sdk-harnesses/cline), [full adapter list](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters). Installed source is authoritative for the code we execute; docs are not substituted for examining a differing artifact.

For Claude, current rules allow end users to sign into unmodified Claude Code in the documented embedding conditions, while prohibiting third-party Claude.ai credential collection/intermediation. API/approved-provider routes are distinct. Confirm the exact proposed integration with Anthropic before promising Pro/Max support. Until then, do not advertise support and do not add an API-only route as if it preserved subscriptions. [Anthropic terms guidance](https://code.claude.com/docs/en/legal-and-compliance).

### Account choices are a separate missing integration

In [UIX setup](../../packages/uix/src/components/agent-setup.tsx), `found: true` for Claude/Codex is fixture data. `connect()` currently uses a timer to mark ChatGPT/OpenRouter as connected. It does not exchange a token or select an executing harness. This is a UI prototype, not actual machine discovery or working account authentication.

Before these options become functional, each needs an explicit route:

- **Continue with ChatGPT:** choose the executing runtime, implement the authorized sign-in/refresh path, and prove the selected plan is billed. OpenAI documents an app-server integration; this does not automatically wire the UIX button to Codex or authorize arbitrary token reuse. [OpenAI app-server sign-in](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server).
- **Continue with OpenRouter:** OAuth PKCE exchanges a code for an API key; select a harness with a documented OpenRouter-compatible route and pass the key through its supported auth configuration. No route is selected here yet. [OpenRouter OAuth](https://openrouter.ai/docs/guides/overview/auth/oauth).
- Keep account credentials out of course files, URLs, logs and chat prompts. Store only non-secret selection references in ordinary runtime config. No paid API fallback without an explicit user choice.
- Do not implement these flows in this documentation task. Disable/label prototypes before releasing them as functional onboarding.

## Proposal 1: use one agent execution path

**Reason for change.** Equivalent lifecycle work exists in both the Eve/HarnessAgent authoring path and the ACP learning path. Runtime support consequently differs by screen.

**Approach.**

1. Complete the auth/binary/version inventory above. Add a Sensei agent definition using the existing `@dojofoo/agent` execution path only for a validated compatibility route. Do not copy the Kyoshi's authoring tools or permissions.
2. Keep current lesson context assembly: application teaching rules, `DOJO.md`, lesson `SENSEI.md(x)`, relevant files, progress, and check evidence.
3. Reuse current domain operations for verify, show, ask, and complete. Bind them to the selected lesson rather than giving them a global current-session guess.
4. Preserve the public lesson routes initially. Change their execution dependency behind the route, not the editor, sidebar, navigation, and chat layout simultaneously.
5. Run the existing OpenCode ACP route and candidate route against the same saved lesson, provider/model and scripted interaction in separate workspaces. Compare normalized events, visible transcripts and effects; do not expect identical model wording. Enable Pi only after this baseline, with its own compatibility acceptance.
6. Retire ACP-only lifecycle code only when production callers have moved. Do not maintain two permanent Sensei implementations or silently fall back between them.

**Benefits.** One question/resume path, consistent harness support, shared error behavior, fewer runtime-specific launch and transcript handlers.

**Risks.** Losing subscription-only users, installing a different CLI, changing provider billing or approvals, and reading/copying auth differently are blocking risks. Native-tool events may project differently. Authored tools could shadow native file/shell tools. The current provider's suspended-tool and checkpoint handling is important and cannot be removed merely because it looks complicated. Existing lesson sessions need an explicit compatibility or transition policy. Retain the working route for agents whose acceptance fails; a common interface does not require removing a necessary local execution binding.

**Confirm before implementation.**

- Installed HarnessAgent/adapter APIs support our required tools, resumability, settings, and history operations; compile-time compatibility is not an end-to-end test.
- Preserve a subscription-only login with no unrelated API/Gateway credentials present. Check credential precedence separately without exposing credential values.
- Bundled Pi is now 1.3.0. Non-secret configuration and loopback journal fixtures pass; verify the actual selected account before claiming native login acceptance. UIX recommending `pi.dev` does not prove that account compatibility.
- Resolve FX's recorded `code` versus `auto`/`ask`/`full-access` permission-mode incompatibility; do not misclassify that as a teaching failure or successful support.
- All native file and shell tools receive the real intended lesson workspace.
- The new Sensei loads the same teaching rules as production, without evaluation hints.
- Browser reconnect does not submit another introduction or replay the learner's last message.
- A pending question survives reload/restart and accepts one answer exactly once.
- Pi can introduce, inspect, verify, ask, review, and advance a real starter lesson.

**External evidence.** HarnessAgent separates configured agents from live sessions and exposes explicit continuation and lifecycle methods. These are the contracts to use, not a new local abstraction that reimplements them. [HarnessAgent](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-agent).

**Decision.** Recommended only after auth/version gates. OpenCode-first comparison, then Pi. Pi rejection is a defect, but removing the guard alone is not a fix.

## Proposal 2: keep trial as temporary normal learning

**Reason for change.** Trial should reveal what a learner would experience. A special trial agent or orchestrator would make that comparison less trustworthy.

**Current hazards.** Trial folders are inside `<course>/.dojo/trials/<lesson>-<uuid>`. No trial retirement/cleanup path was found in the inspected production code. Each invocation creates a new path. The copy excludes `.dojo`, `.git`, `node_modules`, `.npmrc`, `.netrc` and most `.env*` files, but does not exclude `mise.local.toml`, `.mise.local.toml`, `.envrc`, `.dev.vars` or arbitrary key files. `cpSync` preserves symlinks, so copying does not establish write isolation. Kyoshi's native tools can reach the real course through the managed `course` link; watcher exclusions are not access controls.

**Approach.**

1. Keep one setup function: validate the requested lesson, prepare a temporary local installation **outside the author's tree**, and return its ordinary workspace/course/lesson identity.
2. Use the same installation/material layout and preparation helpers as a manually installed dojo. Inspect the existing git installation path before deciding whether to reuse an internal helper; do not fetch a published repository when trialing unsaved local work.
3. Open the ordinary lesson route and start it with the selected learning harness.
4. Keep only the setup inputs and returned workspace reference needed by the caller. Do not introduce a trial session database or trial-only conversation model.
5. Use an in-flight guard for repeated clicks if necessary. A deliberate new trial should create a fresh learning workspace; reopening an existing trial should reuse its ordinary session.
6. Define the copy contract explicitly. Prefer known course material/manifests/assets over a growing denylist. Handle symlinks by rejecting external targets or copying validated target content; do not keep write-through links into the draft. Internal links also require cycle/containment checks.
7. Reuse package-manager caches, not a mutable `node_modules` symlink into the author's working tree. Measure mise's own task freshness before designing another cache. Validate dependency/setup identity across distinct trial paths.
8. Add explicit retirement/removal for identified inactive trials. Do not delete an open session's work or a broad temporary directory. Moving trials outside the draft reduces accidental discovery but is not an OS security boundary against a full-permission local agent.

**Benefits.** Manual learning and trial share behavior and regression coverage. The author can continue talking to Kyoshi while another tab runs Sensei.

**Risks.** Blindly copying dependency folders is expensive. Copying `.env`, runtime state, or credentials is unsafe. Sharing mutable course files can let a trial change the draft. Automatically deleting a trial can destroy a learner's unfinished experiment.

**Confirm.** Exclude managed state and secrets; preserve needed course assets; define whether a trial snapshots saved files; ensure checks execute with the course's mise environment; verify that closing the tab does not delete files or cancel an unrelated session.

**Decision.** Preserve ordinary learning semantics, but treat these copy/lifetime/setup hazards as immediate work. Can ship before runtime migration. No dedicated durable trial workflow is proposed.

## Proposal 3: separate evaluation policy from evaluation execution

**Reason for change.** We currently combine internal teaching criteria, fixed scenarios, model settings, production-trial execution, quotas, and reporting. An author may want a different criterion or no model judge at all.

### Three different evaluation uses

| Use | Example | Needs temporary lesson execution? |
| --- | --- | --- |
| Internal product eval | Does Kyoshi ask concise questions and create usable Sensei guidance? | Only when the case exercises a produced lesson |
| Material eval | Does this `SENSEI.md` teach the missing prerequisite without stating the edit? | No; review the supplied material |
| Course-owned lesson eval | Given this learner mistake, does this Sensei respond appropriately and use the right tool? | Yes, when it actually runs the lesson |

**Approach.**

1. Existing code has filename discovery for optional YAML eval files and a YAML-object check, but no complete public schema/execution contract. Design that new feature separately before claiming course-owned eval support.
2. Let an authored evaluation declare its cases and criteria. Keep internal Kyoshi/Dojo regressions in our repository.
3. Define versioned case input, observable assertions/scorers, evidence and report shape. Decide whether the initial public format is declarative only. If executable author code is allowed, define trust/approval, process boundaries, imports/network/shell access, resource limits and cleanup first. Separate running a lesson, collecting observations, scoring, and reporting without making an unbounded plugin framework.
4. A lesson execution case opens normal learning in a temporary workspace. It uses the production Sensei setup, with the scenario acting as the student from outside.
5. A material-only case receives material directly. Do not install a course, launch a learner, or run every internal teaching rubric for it.
6. Keep optional evals optional. Do not add an `evals/` directory or mandatory boilerplate to every course.
7. Reuse the prepared evaluation screens to select scope, show results, and inspect evidence. A selected lesson should show its results; global errors should not become sticky lesson errors.

**Benefits.** Authors can evaluate lesson-specific intent. Internal prompt changes do not force every authored course onto a new rubric. Cheap checks stay cheap.

**Risks.** Executable eval files run code with the user's permissions. An author-supplied judge can be biased. A material score cannot prove observed teaching quality. A passing cassette cannot prove live-model quality.

**Confirm.** Identify the current file formats and discovery paths, clarify trusted-code execution, preserve raw outcomes and scorer/version metadata, and keep material, behavior, and infrastructure failures distinct.

**External evidence.** Eve provides an evaluation surface, but adopting its runner should depend on compatibility with our cases and reports, not its name. Compare a representative existing case with the installed Eve eval API before replacing anything. [Eve evals](https://eve.dev/docs/evals/overview).

**Decision.** A separate public-feature design job, not a reuse-only cleanup. Do not rewrite working internal evals or create another universal eval engine as part of the Pi fix.

## Proposal 4: use one chat projection after execution converges

**Reason for change.** Authoring translates Eve events while learning translates ACP events. The UI should not have to understand different answer/retry semantics for the same question component.

**Approach.** Reuse the current Eve reducer and a single thin projection to the existing AG-UI/TanStack chat. Preserve tool IDs, question IDs, answers, errors, and event order. Keep editor and navigation events separate from conversation text.

The current Eve bridge sends a whole message snapshot after each changing event. First measure bytes, reducer work, and UI commits on a long fixture. If costly, retain snapshots for attachment/recovery and emit standard incremental events during live delivery. Do not rewrite it solely to make it look more sophisticated.

**Benefits.** Fewer duplicate-message and pending-question edge cases; one cassette format can exercise both screens; less repeated serialization if measurements justify incremental delivery.

**Risks.** Replacing snapshots can lose provisional tool states, change message identity, or make restored output differ from streamed output. A reconnecting observer must not initiate a model turn.

**Confirm.** Streamed output and replay produce equivalent messages. Disconnect only ends observation. A submitted answer stays visible and disabled. Queued messages remain visible and are delivered once. Source events remain authoritative; do not add another durable transcript cache.

**Decision.** Share projection as a consequence of runtime consolidation. Treat streaming optimization as a measured follow-up, not a prerequisite.

## Proposal 5: share runtime selection and apply changes at valid boundaries

**Reason for change.** A harness can currently appear in authoring/eval selection while being rejected by lessons. Some settings are read dynamically; others are bound to existing sessions.

**Approach.**

- Resolve defaults through the existing global → project → environment → explicit-selection approach.
- Keep authoring and learning preferences independent, but use one supported-harness catalog and adapter creation path.
- Obtain models/settings through the native integration where possible. Do not maintain a static list of models in each screen.
- Apply model/effort changes at a supported boundary. During a pending tool interaction, record a requested change for later rather than silently moving the continuation.
- Changing harness creates a new native conversation after confirmation. Keep course files and progress. Do not call it a transparent resume of the old harness.

**Benefits.** Consistent choices across authoring, learning, trial, and lesson-eval execution. No credential copies or framework-specific selection fallbacks in UI components.

**Risks.** Available models can differ from authenticated/usable models. Effort settings are not universal. A newer runtime does not guarantee its adapter exposes every CLI feature.

**Confirm.** Which settings each installed adapter actually exposes, whether the selected model is usable, and which changes require a new turn versus a new conversation. Show precise unsupported-setting errors, not infinite loading.

**Decision.** Review and land the currently untracked configuration module as its own change; do not describe it as released functionality. Do not introduce a second config system. Test settings through the same production entry points the composer uses.

## Proposal 6: reuse mise preparation; fix invalidation before adding workflows

**Reason for change.** Environment setup is already delegated to mise. The in-process preparation cache currently keys by root, which can outlive a change to that root's setup configuration. Fresh trial roots have the opposite issue: they do not reuse that cache. First trace which caller prepares them; manual trial setup currently lacks the explicit preparation call present in the eval handoff.

**Approach.** Keep `prepareWorkspace` and the course's mise contract. Define when readiness is invalidated: at least a changed tool/setup contract, explicit retry, or missing required output. Prefer mise task freshness plus a small preparation guard over duplicating dependency tracking.

Display preparation status near the operation that requested it. Open the lesson route with an honest preparing state when appropriate; do not hide an infrastructure failure behind the chat's thinking indicator.

**Benefits.** Fewer repeated installations without treating old success as permanent. Manual install, trial, and lesson eval use the same environment setup.

**Risks.** A fingerprint of `mise.toml` alone misses scripts and lockfiles referenced by a task. Automatically trusting arbitrary downloaded tasks is a separate security decision, not a caching optimization.

**Confirm.** Which inputs mise already tracks, when install/setup needs an explicit rerun, and whether interrupted setup is safe to retry. Verify failure and retry without starting a paid agent call.

**Decision.** Small shared-helper improvement. No new setup service or durable workflow unless long-running setup recovery becomes a measured requirement.

## Proposal 7: introduce durable evaluation jobs only if needed

**Reason for change.** Our evaluation receipts protect spending, but an interrupted evaluation cannot necessarily resume a completed material review and unfinished teaching run. This is a real limitation, not a reason to rebuild every evaluation immediately.

**Approach if that limitation becomes important.** Keep the scorer and runner interfaces from proposal 3. Wrap the long evaluation execution in the existing supported workflow runtime, with explicit boundaries around meaningful results. Keep artifacts and material fingerprints as evidence. Recover or explicitly fail an interrupted native operation; do not blindly call it again.

**Benefits.** Potential recovery of long lesson evaluations and clearer job progress without tying the feature to a particular rubric.

**Risks.** Workflow replay is not a blanket exactly-once guarantee for model calls, shell commands, or filesystem writes. Adding a workflow underneath Eve's own execution loop can produce two overlapping checkpoint systems.

**Confirm from sources and a small experiment.**

- Does the installed Eve release expose the needed authored workflow entry point?
- Can one completed scorer result survive a restart without another paid call?
- What happens when the worker dies after a model charge but before its result is saved?
- Is the native session actually recoverable, or is only our job metadata durable?
- Are cancellation and human approval tied to the correct operation?

**External evidence.** Workflow-harness runners checkpoint HarnessAgent turns; they do not supply a course/eval model. `resumeFrom` and `continueFrom` distinguish conversation resumption from unfinished-turn continuation. Side effects still need idempotency. [Workflow utilities](https://ai-sdk.dev/docs/ai-sdk-harnesses/workflow-utilities), [runner source](https://github.com/vercel/ai/blob/main/packages/workflow-harness/src/run-harness-agent.ts), [idempotency](https://workflow-sdk.dev/docs/foundations/idempotency).

**Decision.** Deferred. Keep working evaluations working. Do not make this a dependency of trial or Pi support.

## Proposal 8: review Eve/package complexity separately

**Reason for change.** `@dojofoo/agent` packages Eve 0.80.1 and applies three patches affecting eleven upstream files. The repository additionally has OpenCode and TanStack patch sets. It also provides a HarnessAgent-backed model adapter and local execution helpers. These are distinct maintenance costs. The [upgrade ledger](./dependency-upgrade-ledger.md) records their current verification and removal gates.

**Approach.**

1. Preserve the current integration while moving production callers onto one path.
2. Catalogue all five patch sets in the table below, with baseline tests and a removal condition for each.
3. Compare each patch to the chosen upstream release. Remove only patches demonstrably replaced upstream.
4. Treat any Eve upgrade as a separate compatibility change with restart, question, tool-result, subagent, and packaging tests.
5. Keep local process/sandbox helpers separate from teaching policy. They provide execution, not a security boundary.

**Benefits.** Less patch drift and a clearer supported API. Avoids accidentally reintroducing known failures during an unrelated feature change.

**Risks.** Future Eve releases can change workflow/task and session-recovery APIs. An upgrade can affect existing durable histories. The fact that a type exists upstream does not establish compatibility with our stored sessions.

**Confirm.** Installed versus documented APIs, package export compatibility, native continuation behavior, and an explicit old-session upgrade policy. Validate local login handling without copying tokens into generated course files.

**External evidence.** Eve already owns durable session workflows. Its current authored workflow APIs are another facility, not evidence that our older package supports them unchanged. [Execution model](https://eve.dev/docs/concepts/execution-model-and-durability), [workflow tools](https://eve.dev/docs/tools/workflows).

**Decision.** Separate maintenance work. Do not combine a framework upgrade with the first Sensei migration.

### Patch and version inventory

| Patch set | Current purpose / migration relevance | Removal gate |
| --- | --- | --- |
| `packages/agent/patches/eve@0.80.1.patch` | Provider compaction and identity; web-search behavior is now upstream | Upstream equivalent passes provider, compaction and durable-resume tests |
| `packages/agent/patches/eve-native-turn@0.80.1.patch` | Native completion and context-token accounting in the new after-model step | Native and host-tool boundaries remain correct without the patch |
| `packages/agent/patches/eve-distribution@0.80.1.patch` | Packaged module/workflow resolution, server export and safe legacy-history transition | Packaged consumer works without aliases, manual patches or destructive storage initialization |
| `patches/@ai-sdk__harness-opencode@1.0.155.patch` | Keeps model selection on the legacy API that owns the session | Candidate official bridge runs the same selected-model and continuation cases without the patch |
| `patches/@tanstack__ai-client@0.39.3.patch` | Honors queue/drop policy while interrupts own the turn | Public-client and browser regression pass unpatched. Dojofoo PR #162 is not an upstream fix; contribution drafts are in `patches/upstream/` |

Production, evals and the packed-consumer fixtures now target Harness 1.0.153. Adapter release numbers differ intentionally; their declared Harness dependency is checked. Exact pins, passing gates and remaining exceptions live in the [upgrade ledger](./dependency-upgrade-ledger.md).

### Approval and concurrent-session gates

Today's learning path explicitly auto-approves: Cursor launches with `--yolo --trust`, Grok with `bypassPermissions`, and FX with `FX_PERMISSION_MODE=yolo`. Preserve or deliberately change that policy; never inherit a new adapter default accidentally. The temporary workspace and local sandbox are not security boundaries. An author-supplied command remains trusted execution and needs an explicit product policy.

Test one Kyoshi and two Sensei sessions concurrently under the same local account. Check independent journals, runtime config, pending questions and cancellation; no global provider/dispose action may terminate another session. Keep shared credentials owned by the native runtime; concurrent refresh/write behavior needs an explicit test. This is a three-session acceptance case, not an expensive cross-model matrix.

### Numerical baselines and limits

These are proposed migration gates, not measurements already obtained:

- Record cold/warm preparation duration, first visible activity, first learner-visible text, peak memory/process count, emitted bytes and native request count separately.
- Use 20 deterministic fixture runs for local orchestration percentiles, excluding model inference. Target no more than 200 ms additional p95 orchestration overhead versus ACP.
- For an approved live OpenCode comparison, record at least three matched short runs per path; report each timing, not a statistically meaningful p95 from three samples. Flag first-text regression greater than 20% or 1 second, whichever is larger; investigate before enabling.
- Warm unchanged trial setup must perform zero dependency-download operations when a valid shared package cache/setup result is available. Measure cold setup first; propose an absolute budget only with that baseline and the course's setup requirements. A cache hit never overrides a changed lockfile or setup contract.
- Standard tests spend zero paid calls. A separate live smoke job defaults to at most six short turns total, no implicit retries, with an explicit per-job request/output/time ceiling; it must not masquerade as the full comparison.
- Set a monetary ceiling only when the selected provider exposes enforceable pricing/limits. For subscription-only harnesses, report turn/request/token counts and the authorized quota ceiling rather than inventing a dollar cost. No credential or billing-route fallback is allowed.
- Two trial clicks while setup is in flight create one pending setup; an intentional fresh trial creates one new workspace. A resumed question is delivered once, and cancelling one of three concurrent sessions leaves the other two alive.

## Ownership: keep it small

| Concern | Owner | Do not add |
| --- | --- | --- |
| Course content | Course files | A second mutable course document in chat state |
| Authoring conversation | One course-scoped Kyoshi session | A reset when the selected lesson changes |
| Learning conversation | Ordinary lesson-scoped Sensei session | Trial-only chat semantics |
| Agent continuation | Eve + official HarnessAgent + native adapter | An application reimplementation of native checkpoints |
| Learner progress | Existing Dojo progress/evidence | Progress inferred solely from model prose |
| Temporary trial | Ordinary temporary learning workspace | Another durable trial-session entity |
| Authored eval cases | Optional course/lesson material | Mandatory internal rubric or fixed judge panel |
| Eval reports | Scoped artifacts and existing evaluation UI | One sticky global error for every file and lesson |
| Open files, scroll, active panel | Browser UI state | Workflow steps for each click |

Session identity, workflow-run identity, native-harness identity, and lesson identity are not interchangeable. Keep only the mappings needed to attach the correct existing objects. Do not solve mismatches by adding another application session type.

## Revised job order and acceptance gates

### 1. Authentication and binary matrix: research only

- Complete the ten-adapter inventory using exact published artifacts, not only documentation.
- Include the actual Dojo wrapper, credential precedence, native home/config behavior and bootstrap writes.
- List existing-login users who would regress and decide how to preserve their route.
- Decide whether to support Claude Code and each account-based entry point; until implemented, setup must not represent fixture state as actual support.
- No credential collection, installer execution, model call or code migration is needed for this research job.

### 2. Dependency alignment and all five patches

- Align relevant eval and production dependency graphs, including Pi's bundled library.
- Catalogue all five patch sets; locate the intended TanStack PR #162 and released version.
- Run existing offline contract/packaging tests; do not upgrade Eve, all adapters and the UI client in one change.
- Record resolved versions and patch identities in subsequent comparison evidence.

### 3. Shared Sensei path: OpenCode first, Pi second

- Keep the old OpenCode ACP route available for the controlled comparison. This is a bounded migration mechanism, not a new permanent backend toggle for users.
- Compare the same lesson/provider/model and learner script across old and candidate paths. Assert lifecycle, tools, visible instructions and results; do not demand identical stochastic wording.
- Intro, verify, structured question, answer, review and progression must work. Reload must not duplicate input or lose the pending answer.
- Apply the auth, permission, timing, request-count and concurrency gates above.
- Only then enable Pi learning, after the installed-Pi versus bundled-library configuration test. No Pi-specific wire protocol or separate teaching prompt.
- A route that breaks existing login stays disabled. Preserve the working implementation until its replacement passes; fewer files are not the acceptance criterion.

### 4. Trial hygiene: independent and safe to ship earlier

- Trial uses normal learning and leaves the authoring conversation intact.
- Move new trials outside the draft tree; handle safe copy, links, secrets and explicit cleanup.
- Assert the draft is unchanged after learner writes. Prove temporary workspaces cannot write through copied links.
- Verify preparation is called before checks and reused appropriately across equivalent trials, without sharing mutable learner files.
- No trial-only agent or durable trial lifecycle is introduced. This work does not wait for job 3.

### 5. Course-owned eval format and trust design

- Publish a separate design for optional case format, trust/approval and execution contract before implementing executable author code.
- Distinguish existing YAML discovery and evaluation screens from a functioning public runner.
- A material-only check does not launch a lesson. An execution case uses temporary ordinary learning state.
- Our Kyoshi suite remains independently runnable. A failed/cancelled course eval does not block ordinary authoring.

### 6. Later: measured cleanup and optional durability

- Delete only ACP/projection branches actually replaced with passing equivalents.
- Measure the snapshot bridge before optimizing it.
- Improve preparation freshness using mise's task semantics.
- Consider durable evaluation recovery only when needed, with paid-side-effect safety tests.
- Upgrade Eve separately and remove a patch only after the corresponding regressions pass.

Run free contract and cassette tests first. Native smoke tests should be bounded. Full cross-model or expensive teaching matrices remain opt-in, as requested; this proposal does not authorize them.

## Decisions still requiring confirmation

These do not block saving or reviewing this proposal:

1. **Existing sessions:** the user approved a breaking Eve upgrade: preserve read-only history and require an explicit new conversation, without a parallel legacy runtime. This does not authorize changing native learning-thread formats; retain those until their own migration is tested.
2. **Trial source:** confirm that saved files are the trial input, or explicitly save dirty editor buffers before launching.
3. **Course-owned eval files:** choose a public schema and trust model. Existing YAML filename discovery is not support for executing that format.
4. **Settings capabilities:** distinguish native runtime support from what its official adapter exposes; do not offer pretend effort/model switching.
5. **Framework version:** select an upgrade only after reviewing compatibility; current documentation alone is not enough.
6. **Authentication and install policy:** for each runtime, decide native installed CLI versus managed implementation, supported billing route, home isolation, and allowed credential forwarding. A model catalog is not a login success test.
7. **Permissions:** explicitly retain or change current auto-approval; do not let an adapter default decide.
8. **Concurrent sessions:** demonstrate that a trial and its authoring conversation coexist without global disposal, credential refresh or workspace effects crossing sessions.

## Review conclusion

The immediate decision gate is preserving authentication, installed-runtime behavior and billing, followed by an OpenCode baseline comparison and Pi enablement. Trial remains ordinary temporary learning but needs copy/setup/lifetime hygiene. Course-owned evals require a separate public format and trust design. Shared execution is beneficial only if it preserves these contracts; existing working infrastructure stays until a replacement demonstrates that, regardless of nominal code reduction.

No code changes, new services, dependency installation, expensive evaluations, commits, or deployment are part of this document.
