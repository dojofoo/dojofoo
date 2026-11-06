# Traceability: carried items from `concepts_brief.md`

Companion to `design_draft.md`. Decisions that appeared only here were moved into the design's body during review stage 5.


Each item from "Carried into the design draft" and the "Round N additions" lists, with where this draft answers it.

| Item | Answer |
| --- | --- |
| R3-B6 step-1 deletions | Step 1 |
| R3-M1 create path | Session API; step 5 item 4 |
| R3-M7 host port (skeleton, coordinator, secret, schemas, `EVE_BASE_URL`, async trials) | Host port; step 4 items 2-3; step 7 |
| R3-M8 registry files and temporary exception | Step 2 item 5; staging preamble |
| R3-M9/M10 precedence, override, default, agent-list table, config in graph | Workspace agent selection; step 2 items 4-5; Packages |
| R3-M11 model selection step | Step 5 item 9 |
| R3-M12/M13/M14 Antigravity, conformance field, tier-A job, named scripts | D23 pointer (step 0 item 4); registry row; step 3 |
| R3-M16/M17 authoring server home, protocol build | Step 8 item 2; step 2 item 2 |
| R3-M20 settings removal, allowance, usage cap | Evaluation; step 7 |
| R3-M21 cancel with pending host tool | Step 3 item 1 |
| N1 idempotency key | Host port |
| N2 `POST /end` on switch | Workspace agent selection; step 2 item 8 |
| N3 `ask`/`complete` kinds | Host port |
| N4 persona via `SessionRecord.persona` | Session API (unchanged field) |
| N5 tag format at message start | Server-sent turns |
| N6 step-8 scripts and manifest | Step 8 item 3 (manifest exempt from D9 because relinking needs no user action) |
| N7-N9 glossary and section order | This document follows the template; glossary terms are defined where first used |
| R4 prevention per row vs per persona | Reconciled: mechanism per registry row, mode per persona build (Write prevention) |
| R4 guard event fields, host logs, 409 retries, trace context | Observability |
| R4 interactive guard set empty | Write guard applies to kata; interactive has no solution file |
| R4-M7 evals imports | Step 7 item 6 |
| R4-M9 host lifecycle states | Persona hosts |
| R4 quarantine location and retention; begin-turn retry bound | Write guard rule 3; begin turn retried 5 times with 250 ms doubling, then the replacement path |
| R4 begin-turn seed not in `history` | Begin turn carries the seed in its text |
| R4 old `authoring`/`lesson` keys | Ignored with one warning |
| R4 `ask_question` opt-in | Sensei agent (step 4 item 7) |
| R4 step-1 citation | Step 1 item 2 |
| R4 open risks, residual list, traceability, wording items | Open risks; Accepted residual risks; decisions keep the brief's sources |
| R4 closed export surface gate | Step 8 item 1 and verification |
| R5 when D18 holds per runtime | Staging preamble |
| R5 denial records, refusal narration | Write prevention; Observability |
| R5 verify alert, hook errors, effective tool list | Observability; lifecycle hook |
| R5 `permissionModeMapping` version risk | Open risk 2 (rerun conformance on upgrade) |
| R5 Cursor `--trust` | Step 3 item 6 |
| R5 probe per mapping; FX ids | Model selection |
| R5 `context` hash and token usage | Host port; tier B |
| R5 runtime-limit prompt in assertions | Step 3 item 4 |
| R5 `readLessonFile` path | Step 5 item 1 |
| R5 per-script assertions | Step 3 item 4 |
| R5 gates per decision | Verification Plan per step |
| R5 judges correlation placement | Accepted residual risks |
| R6 Kyoshi approval cards | Kyoshi runs `full`; no cards appear (Write prevention) |
| R6 switch confirmation, switching back | Workspace agent selection; history menu (D31) |
| R6 composer hint, D20 selector placement, onboarding default storage, hosted runtime | Step 5 item 7; composer agent menu; `~/.dojofoo/settings.json`; Non-Goals |
| R6 single write function | Write guard; step 5 item 2 |
| R6 `GuardViolation` channel | Write guard (lesson socket) |
| R6 ACP auto-approved read labels | Step 3 item 1 (adversarial cases include MCP tools) |
| R6 Claude Code in tier A | Step 3 item 2 |
| R6 evaluation path through step 5 | ACP evaluation path kept until step 7; `eval:course:contract` in step 7 |
| R6 settle open risk 1 in step 3 | Step 3 item 6 |
| R6 verify windows on switch, denied call visibility, persisted notices, child hosts, follower, telemetry, `createLessonTrial`, D16 prompts, workspace wording, trial estimates, tier-B CLI ranges | Workspace agent selection; Write prevention (denied calls end as tool errors, not cards); Write guard; Persona hosts (reaping); no stream follower (lifecycle state is persisted); Observability; Evaluation; sign-in and budget prompts count as an open question for D16; "workspace" covers learner folders and drafts (D20); tier B |
| R7 allow-list build, catalog tools, permission per row, wrapper contract, OpenCode write/edit pairing, pre-delivery classification | Write prevention; registry; step 4 items 5-6 (OpenCode's allow-list includes neither `write` nor `edit`) |
| R7 `complete` idempotency | Host port |
| R7 D26 storage, staging, retention, check-result deletion, `createLessonTrial` key, tag-only hiding, "working window" term | Sessions and leaving; step 5; retention dropped (`sessionTimeoutMs: false` suffices); Server-sent turns; step 2 item 4 (trial copies `agent`) |
| R8 stuck windows, window record, per-session status, window keys, verify clears check result, label source, hook error cases, ACP key names, Pi rerun, one-shot sandbox, lint exemptions, fake-adapter check turn, Antigravity pointers, goal wording, single residual list, log hygiene | Write guard; Session lifecycle; Server-sent turns; step 3; Evaluation; step 2 item 9; step 5 verification; step 0 item 4; G3 wording; Accepted residual risks |
| R8 zoom-out deferral of D25's completion tool | Not deferred; both completion and fallback are in step 5 |
| R9 drop before cancel, return behaviour, held-report order, persisted held reports, missing settle hooks, D27 packaging and fail-closed, D27 placement, D19 gates, card labels, cancel identity, hold location, "solution file" | Server-sent turns; Sessions and leaving; Lifecycle hook; Session lifecycle; step 5 verification |
| R10 id map, evict pattern, module sharing, hook order, verify after stop, Kyoshi no-op verify, Stop during `evaluate`, process reaping, single cancel rule, cancel with `turnId`, interrupted rendering, state machine, tier-B cold starts | Lifecycle hook; Host port; Persona hosts; Session lifecycle; Non-Functional Requirements |
| R10 zoom-out: drop D26, accept open risk 5 | D26 kept; open risk 4 stays open (unverified) |
| R11 Pi parked map, rerun side effects, rerun of cancelled tool results, lossy Kyoshi rerun, redundant stop, observability, compaction block, resume timeout, sign-in pauses, interactive session unit, alternatives | Lifecycle hook; step 3 item 1; Observability; Accepted residual risks; interactive courses use one session per course (no lessons) and leave on socket close; Alternatives H-I |
| R12 resume-failure type, D28 scope, held report on failed resume, staging owners, gates, leave signal server side and keying, timers at start, trial sockets, residual risks, open risk on adapter recovery, rerun input per adapter, Pi `reattachInProcess`, `onLog` channel, glossary, pruning | Protocol types; Sessions and leaving; Session lifecycle; step 4 item 11 and step 5; step 3 item 1; step 5 item 5; Open risk 5; Observability |

## Stage 9 round 2 (for per-step plans)

Source: `implementation_readiness_report.md` (stage 9 round 2; 4 Blockers, 39 Majors, 21 Nits), written against the file-level plan that the Implementation Roadmap replaced. Findings that constrain a step are in that step's "Constraints for this step's plan" in the design. The findings below are not constraints: they are wording, citation and detail notes about the old plan. Each step's plan picks up the ones for its step when it is written against the code of that time, and checks every citation again.

Step 0:

*   N13. The placeholder `conformance` job needs one step (an empty job cannot run); `npm deprecate` runs after step 0 merges; each brief has Problem, Goals, Open questions and Next step sections. (All three are now in the roadmap's step 0 text.)

Step 1:

*   N1 (part). Citations: adopt route `control/routes.ts:281-291` with imports `:17-21`, adopt test `routes.test.ts:491-520`; `legacyEvidencePrefix` defined `service.ts:163`, used `:459` (`:951-952` is the string branch); `defaultHarness` written at `service.ts:726-730` (`:740-747` is `lessonTarget`); `verify.yml:35-36` are `openapi:check` and the API tests, only `:37` is a type check.

Step 2:

*   N14. Name the file, code or behaviour for: the registry function's return type (`AgentId[]`, not rows); the host-port types; the "Choose another agent" action (file and error shape); the switch confirmation (file and copy); the master-copy registration site (`packages/cli/src/commands/add.ts:430` per the Technical Plan); the dashboard's delete route; a trial whose `resolveAgent` returns `undefined`; "kept, renamed in step 8".

Step 3:

*   N15. Tier A drives the rows with an `adapterId` except `cursor`; the native process count after each case is 0. (Both are in the roadmap's step 3 constraints.)

Step 4:

*   N16. Wording and signatures: `startPersonaHost` takes `workspaceId` and `persona`, which the process-group record path needs; one path-parameter style (`{x}`) throughout; the idempotency key format when `turnId` is absent; the `session` method in the Technical Plan's host-port lists; the default conversation is requested "after mount"; the status for a refused `/compact`; the call site of the `acp-read-only` wrapper, and whether `agentAdapter(agent)` takes a mode; the recovery order lists guard steps only from step 5; one D33 code per line.
*   N11 (part). Kyoshi's async `evaluation.status` wraps the synchronous `evaluateFromAuthoring` (`packages/authoring/src/evaluation/host.ts:61-150`) and has no caller before step 7; the plan says whether step 4 adds it at all.

Step 5:

*   N17. The pre-delivery hook's classification includes empty-body prepare requests (now a step 4 constraint); say which sockets "no socket" means; `$draftId` exists only from step 6, so Kyoshi's leave rule keys on the draft workspace until then; the recovery rule is stated once; name the file of the "Make this my current course" control; give the composer hint its copy.
*   N1 (part). The lesson socket URL is built at `packages/ui/src/routes/index.tsx:409` (now a step 5 constraint).

Step 7:

*   N19. Name the setting meant by "dev-only model choice"; write step 7 and 8 paths in their post-move form where the text describes the result.
*   N2. Removing the `kyoshi evaluate` imports keeps `readEvaluationSettings`, which `inspect` uses (`packages/cli/src/commands/kyoshi.ts:21`). (In the roadmap's step 7 deletion text.)
*   M37 (moot). The two sections that described `dojofoo kyoshi evaluate` differently no longer apply: D22 removes the command (decided 2026-11-03).

All steps:

*   N4. Resolved: the final design is `docs/designs/agent-runtime.md`.
*   N21. Folded into the step 4 (M24) and step 7 (B3) constraints.

Where the other findings went: B1 step 5; B2 and B3 step 7; B4 step 4. M1, M3 (part), M4, M6, M7, M22 (part), M23, M24, M28, M33, M39, N3, N10, N12, N20 step 4. M2, M8, M10, M11, M14, M15, M17, M18, M19, M20, M21, M22, M27, M34, M35, N6, N7, N9 step 2. M3, M12, M13, M29 step 3. M5, M32, M36, N5 step 5. M9 steps 0 and 6; M16 step 0. M25, M26, N11 (part) step 7. M30, M31 step 1. M38, N8 step 8. M11's Pi typed failure is in the roadmap preamble ("Offered agents").
