# Stable agent journey

Deliver authoring → trial → learning with the existing `@dojofoo/agent`
Eve-compatible integration. No replacement runtime or session store.

## Baseline and boundaries

- Worktree: `.worktree/stable-agent-journey`, branch `fix/stable-agent-journey`.
- Base: `origin/main` at `f9e5165654393b321e612ee56213f73c25c94f27`.
- Preserve the root checkout and previous dirty worktree. No commits or remote
  changes without a request.
- Node 24.19.0; pnpm 10.28.0; frozen installation. Config, agent, authoring and CLI
  builds pass. Dependency upgrades are already committed in this baseline.
- Initially: UI 315 passed/28 failed/4 skipped. Building the CLI removed 23
  prerequisite failures; remaining failures exposed stale assertions and timing.
- Keep Eve/evals and `/agent`'s harness integration. Roles vary by instructions,
  tools and file access. Trials use normal learning in a separate workspace.
- Resume native sessions honestly: interrupted tools may fail. Do not invent
  success, resurrect tools or replace native history.

## Demonstrated fixes

- **Saved duration:** renderer discarded timing. Restore valid single-activity
  timing, without summing overlapping durations. Regression cases pass.
- **First-event delivery:** an empty initial Eve tail was mistaken for completion.
  Keep the official store follower subscribed until an actual boundary/error.
  Removed polling/retries; delayed-first-event regression passes.
- **Lesson wire format:** TanStack sends `content`; our route assumed `parts`.
  Use its converter. Captured-shape introduction/message regressions pass.
- **Trial safety:** exclude local secrets, materialize safe internal symlinks,
  reject external/private links, and remove only a failed trial's own fresh folder.
  Four fail-before/pass-after cases; 45 affected service/file/route cases pass.
- **Shutdown:** Nitro close-hook backport, existing native-owner drain, concurrent
  Eve/process-host close. Node-owner regressions and the formerly leaking
  OpenCode browser process sweep pass. A manual preview exposed open WebSockets
  blocking production shutdown. Close the existing WebSocket adapter before HTTP
  drain; the new production regression fails before and passes after. All three
  shutdown integration cases pass without model calls.
- **Trial dependencies:** server checks skipped CLI preparation. Await existing
  cached mise preparation. Setup-order regression passes; browser observes failed
  stub tests, then passing learner tests without changing the author's draft.
- **Completion routing:** Nitro's private worker `PORT` caused a 404. Honor existing
  `DOJO_UI_BASE_URL`. Public/private-port regression passes. Preserve HTTP failure
  messages/status instead of converting `error: true` into the useless `true`.
- **Packaged evaluations:** inlined official adapters resolved their bridge files
  relative to `cli/dist`. Keep evaluation helpers in the existing installed
  authoring dependency. Packaging-boundary regression fails before and passes
  after; all 13 worker tests pass. This also removes megabytes of bundled adapter
  code, without adding a wrapper or patching an adapter.

## Verified behavior

- Browser passes authoring startup, file editing/save, question replay, server
  restart, answering, queued messages, trial navigation, introduction, actual
  checks, Review, renewed prompt and Move on.
- Answered forms stay locked. Tests select the newly added form, not an old
  disabled row, and await saved messages rather than optimistic queue removal.
- Existing native Eve/OpenCode test passes restart → answer → continuation →
  next-turn model switch in the same session. Loopback inference only.
- UI final rerun: 356 pass/4 skip; typecheck passes. MCP: 4 pass.
- Other recovered checks: authoring 230 pass/30 skip; eval units 67 pass/1 skip;
  agent contracts 75 pass/1 skip; relevant CLI 16 pass. Subsequent focused
  authoring delivery/safety run: 9 pass. These are not teaching verdicts.
- Tested and discarded an Eve React-client replacement: its active operation
  rejects `queue`, and normal input can answer a pending question. Retain the
  existing queue rather than add another queue or an Eve patch.
- Live Codex Kyoshi authored two lessons separately; actual production checks
  confirm failing scaffolds and learner-file wiring. Both material judges pass
  every criterion (suite 9/9 gates). This does not prove observed teaching.
- The extended browser journey also passes next-lesson restart/resume with the
  same native session ID and saved learner code (1.6 minutes, loopback inference).
- The packaged production Sensei chain completed both lessons: uncertainty,
  misconception, repeated failure, success, review and advancement. Separate
  Codex `gpt-6-astra` high-effort judge contexts pass both material and observed
  teaching criteria. The original judge prompt incorrectly narrowed scope to the
  final lesson; a failing regression exposed this. Corrected judges reevaluated
  the saved dialogue, not a new teaching run, and explicitly covered both lessons
  and their transition. Prompt versions: material-v11, sensei-chain-v12.
- Corrected report: authored workspace `.dojo/evaluations/run-L9iAOp/report.json`;
  dialogue `.dojo/handoffs/run-G2Z2RW/evidence.json`. Material SHA-256:
  `e6e9a44f4bfe5b2001f2b4ec9365a2eb6da73aa988d14ecfff9380fe07286a87`.
  Scope: scripted struggling learner, Codex only; no claim of measured learning,
  confident-learner coverage or reliability across other models.

## Manual preview and limitations

1. Rebuilt and verified a fresh course/preview for manual review. The evaluated
   public material is copied to `/tmp/dojofoo-reviewed-course.lVFlPc`, without
   conversation history or learner attempts. Native authoring selects the tested
   `gpt-6-astra`; ambient API-key overrides are omitted only in the preview child.
   No credential files were changed. Z.ai's expired login and the subscription's
   unsupported default `gpt-5.5` were infrastructure failures, not teaching results.
   Preview: `https://dojo-authoring.td:1355/authoring?session=wrun_01M5CWQN8PSYDWWVBMBGMQGV2R`.
   Native Codex inspected the clean material and displayed an actual choice form;
   it is left unanswered for manual review. Public material remains unsolved.
2. Learning/trials expose Codex, OpenCode, Cursor, Grok and FX through the
   existing ACP route. Pi remains authoring-only and is explicitly rejected for
   learning. No silent substitution or direct-runtime migration was added.
   Verified here: actual Codex authoring/teaching and OpenCode lifecycle with
   loopback inference. Cursor/Grok/FX/Pi were not live-tested in this recovery;
   Z.ai requires a refreshed login. These are not cross-harness quality claims.

Completion requires lifecycle/browser evidence and passing small teaching evals,
not just green unit tests or fake-inference browser output.

The sanitized [judge evidence](./stable-agent-journey-evidence.json) retains the
actual four verdicts, prompt hashes, criteria, limitations and material hash.
Complete local evidence remains at
`/var/folders/6s/2ny5mlnd483gf8f67x6xrhfc0000gn/T/dojofoo-kyoshi-eval-47E2fo`.
