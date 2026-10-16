# Kyoshi teaching baseline

Current simulation acceptance (`sensei-chain-v10`, 2026-10-15) passed twice in
fresh workspaces:

| Workspace suffix | Gates | Duration | Revisions |
| --- | --- | --- | --- |
| `0aeNzG` | 11/11 | 26m 13s | Lesson one: two; lesson two: one |
| `zBfs82` | 11/11 | 18m 48s | Lesson one: one; lesson two: none |

Both runs used Pi/DeepSeek V4 Pro for Kyoshi and learner fixtures, Codex/GPT-6
Astra for the production Sensei, and independent GPT-6 Astra / Claude Opus 5.5
high-effort judges. Each passed every material and teaching criterion for two
lessons and a held-out confident learner. The final audit matched delivered
files and authoring/teaching instructions to the evaluated snapshots, confirmed
six isolated trial workspaces/sessions, and verified that learner fixture inputs
excluded SENSEI files and platform teaching policy. No failed attempt was removed.

This verifies the tested kata workflow, not all course types, models, or actual
human learning gains. See the smaller calibration and production checks in
`packages/authoring/src/evaluation/fixtures/README.md` before repeating full runs.

## Earlier investigations (historical)

Earlier simulation acceptance: `WuAeMo` passed all 11 gates in 18m 29s: both authored
lessons, every criterion from both independent material/teaching judges,
unchanged handoffs, and the held-out confident learner. Only lesson two needed
one material revision. These results predate the revised learner simulation.

Baseline acceptance (2026-10-15): `M9vcTh` passed all 11 gates with both judges
passing every material and teaching criterion, two lessons, unchanged handoffs,
and the held-out confident learner. This also predates the current simulation.
Its initial material failures were a leaked procedure and a duplicate lesson ID;
Kyoshi fixed both before teaching. The host now catches duplicate IDs for free.

`kjuvyE` passed lesson one but exhausted lesson two's allowance. Both judges
rejected mapping an operator explanation to the exact line to edit across
turns. KATAS guidance now separates teaching syntax from directing its
replacement in learner code. This changes the teaching-policy hash: the earlier
pass is a baseline, not two-run acceptance for the revised policy. Focused replay
of the exact failing lesson/learner fixture comes before another full workflow.
That replay passed all four panels and lifecycle in `dojo-teaching-replay-b0lLaN`
(`run-bjlzcL`). No source material or learner scenario changed.
The initialization regression `dojo-teaching-replay-ZdBhAU` still failed both
judges: the teacher explained indexing, then directed its use in the initializer.
The help rule now also excludes that closing edit instruction and permits a
fresh example check or space instead. Both earlier passes remain baselines,
not acceptance evidence for the final policy.
`dojo-teaching-replay-k3bXI2` removed the closing edit instruction but one judge
still found an earlier worked trace of the requested algorithm. The help rule
now distinguishes prerequisite examples before a learner designs an approach
from diagnosis of their own attempted code. These recorded regressions remain
failed; no full workflow is rerun until the focused teaching cases pass.
The revised initialization replay `dojo-teaching-replay-EMdQgj` passed all four
panels and lifecycle (`run-F9mvZv`) with the same material and learner fixture.
The corresponding operator replay `dojo-teaching-replay-5pw7oW` also passed all
four panels and lifecycle (`run-Z296Kw`). Both use the final prerequisite-example
and no-closing-edit guidance. Fresh full acceptance runs follow these two checks.

Earlier acceptance (2026-10-15): `TZhuga` passed all 11 gates under the shortened
guidance. Subsequent verification exposed fixed-hint instructions left in hidden
Check prompts; those are now removed. Fresh acceptance of this final policy is
still required. This is not evidence of reliability across untested models.

## Small evals before acceptance

Use captured failures before repeating a full workflow. The material fixture in
`material-support.live.test.ts` comes from `MJh3Jx/run-Q8OaQl`: counterexamples
and a running-total example left initialization and empty-input handling untaught.
The exact replay passed both judges once the mandatory hint ladder was removed;
that old disagreement alone is not proof of missing instruction. The negative
control removes its explanations, leaving recall questions and counterexamples.
Its positive control supplies concepts without a script; a second negative
control gives a renamed complete algorithm. Both judges must distinguish them.

`lesson-design.live.test.ts` uses the shipped Kyoshi instructions to draft and
revise only SENSEI material for two learning goals. It gives the actual failed
judge findings back to the same session, with the production three-attempt limit.
All drafts and verdicts are saved; a repaired pass is not a one-shot quality claim.
It omits installation, tools and the live Sensei, saving a full authoring trial.
`solution-boundary.live.test.ts` checks permissible explanations and sources
against exact edits and complete recipes. These are development checks, not
production teaching acceptance.

```sh
DOJOFOO_EVAL_MATERIAL_CALIBRATION=1 pnpm --filter @dojofoo/authoring exec vitest run src/evaluation/material-support.live.test.ts
DOJOFOO_HARNESS=pi DOJOFOO_EVAL_MODEL=deepseek/deepseek-v4-pro DOJOFOO_EVAL_DESIGN=1 pnpm --filter @dojofoo/authoring exec vitest run src/evaluation/lesson-design.live.test.ts
DOJOFOO_EVAL_JUDGE_CALIBRATION=1 pnpm --filter @dojofoo/authoring exec vitest run src/evaluation/solution-boundary.live.test.ts
```

All three explicitly opt into paid local-model calls and save inputs and verdicts
in temporary directories. No infrastructure retries or cross-model matrix. The v9
rubric requires usable support for the actual gap, not a fixed hint ladder.
It also explicitly treats a same-algorithm hand trace as a potential solution
leak: a lack of code does not make a complete decision process safe.
Kyoshi's handoff requires every raw criterion to pass both judges, even when the
consensus diagnostics mark a disagreement as `disputed`. The runner still stops
before a paid trial if either material judge fails, and only accepts teaching
when both judges pass every criterion.

2026-10-15 focused verification (v9): all nine material/boundary calibration
cases passed both judges. The frozen-instruction generation run also passed both
cases: `dojo-design-eval-va3ug8` (largest number; one preflight rewrite, one judge
pair) and `dojo-design-eval-yPR60j` (whitespace; two judge pairs with a preflight
rewrite between them). Both final materials passed every criterion independently.
These are temporary artifact directory names, not production acceptance runs.
The repeated failures before these passes remain saved; this is evidence of a
bounded author/review/revise loop, not guaranteed first-draft quality.

The subsequent full run `rXqETJ` passed both panels and lifecycle for lesson one
on its first attempt (`run-9gfuEf`). It was intentionally stopped when adding
lesson two rewrote the accepted `DOJO.md`. It is **not** full acceptance. The
continuation replay test copies that accepted snapshot into a new workspace and
checks file preservation with the recorded handover context. It uses the native
harness and shipped instructions, without an Eve server or paid teaching trial.
This is a smaller check; the full workflow still has to prove the Eve path.
The handover replay reproduced the change in `dojo-continuation-eval-boy1rG`.
After separating the immutable course entry baseline from each new lesson's
concepts, the same replay passed in `dojo-continuation-eval-dbx8hY`. Both retained
their inputs and file snapshots. To replay a recorded accepted lesson:

```sh
DOJO_CLI=/path/to/packages/cli/dist/index.js \
DOJOFOO_HARNESS=pi DOJOFOO_EVAL_MODEL=deepseek/deepseek-v4-pro \
DOJOFOO_EVAL_CONTINUATION=1 \
DOJOFOO_ACCEPTED_MATERIAL=/path/to/course/.dojo/evaluations/run-ID/material.json \
pnpm --filter @dojofoo/evals exec vitest run src/authoring-continuation.live.test.ts
```

The snapshot must have its corresponding `.dojo/workflow-evidence.json` with
the completed first authoring turn; the replay uses that actual handover.

`PdyxC1` then exposed teacher-level failures: a mechanical opening, a score-card
story that disclosed the algorithm, and a review that supplied a trace of an old
input. Both judges failed engagement and transfer. That full run was stopped;
it is not acceptance. `replay-teaching.ts` reuses an evaluation's exact material
and learner fixture through the existing production worker, skipping Kyoshi:

```sh
DOJO_CLI=/path/to/packages/cli/dist/index.js \
DOJOFOO_EVAL_TEACHING_HARNESS=codex DOJOFOO_EVAL_TEACHING_MODEL=gpt-6-astra \
DOJOFOO_EVAL_FIXTURE_HARNESS=pi DOJOFOO_EVAL_FIXTURE_MODEL=deepseek/deepseek-v4-pro \
pnpm --filter @dojofoo/evals exec tsx src/replay-teaching.ts /path/to/evaluation/run-ID --live
```

This is a paid, focused lesson replay, not a full authoring run or a held-out
case. The copied material, source reference and new reports stay in a fresh
temporary directory. A failed raw judge criterion still exits nonzero.

Teacher replay progression: `dojo-teaching-replay-MwhLkL` fixed withholding and
transfer but still failed one engagement verdict; `dojo-teaching-replay-ETuQhn`
then passed both material and teaching panels, all criteria, with the same lesson
and learner fixture. Its lifecycle passed too (`run-7a9kD6`). The change was shared
Sensei guidance, not scripted replacement lesson text. Full fresh-workspace
acceptance remains a separate requirement.

`bur3dY` was stopped during a stalled first authoring turn, before any verdict.
The last stream event was at 18:05:10 UTC; Eve's health endpoint and a separate
Pi/DeepSeek request still responded. Its cause is not established. This is an
infrastructure observation, not a teaching failure or acceptance evidence.

`XZev0w` passed corrected material in `run-i7FtNF`, then Codex returned a 429
during success/review. The old ACP client treated the error text as teaching,
misreporting a missing completion prompt. The run was stopped. The client now
negotiates codex-acp's existing `jetbrains.air.sessionFailure` capability and
checks final response metadata; no prose matching or new wire format. Unit
regressions cover failed/silent turns, retry warnings and evaluation classification.
Original failed reports remain unchanged. This is not acceptance evidence.

The focused replay `dojo-teaching-replay-L201DO` reused that exact material and
learner fixture. Both material judges passed; Codex again returned 429 during
completion. This time `run-v9DWjh` correctly reported `infrastructure-failed`
without running teaching judges. Further paid retries stopped. The account's
read-only rate-limit endpoint reported ordinary usage allowed (27% of its
weekly bucket), so the quota snapshot does not explain the recurring throttling.
Do not count this as a teaching pass or revise lessons from the provider error.
For interrupted trials whose reports lack a trial directory, the replay command
accepts `--trial <recorded-trial-directory>`; original failure files stay intact.

The same interrupted material then passed all four judge panels and lifecycle
in `dojo-teaching-replay-0hxcg0` (`run-VXNbFc`) with
`DOJOFOO_EVAL_TURN_INTERVAL_MS=15000`. This worker-only interval paces
synthetic turn starts; it changes no prompts, models, grading or production chat
and never retries a failed turn. The chosen interval is recorded in trial evidence.
The unpaced failure sent eight turns and about 250,000 cumulative input tokens in
44 seconds; pacing tests a burst-throttling hypothesis, not a proved provider cause.
Use the same recorded interval for full acceptance, not a different model or rubric.
The live evaluation driver now defaults to that 15-second interval, including
Kyoshi's own trials. The environment override is for diagnostics (`0` disables
pacing); authors need no extra setting. Production chat is never throttled by it.

`ZFhX2w` exposed a strict-gate gap: after the first material failure, a revised
draft still failed one judge's adaptive-instruction criterion, but consensus
allowed a paid trial. The trial was stopped. Red/green regression tests now
require both material verdicts before a trial, and both teaching verdicts before
acceptance, while retaining disagreement diagnostics. Original reports are kept.

Replay just a captured material revision by setting `DOJOFOO_EVAL_MATERIAL_REPORT`
to its evaluation directory and running `lesson-design.live.test.ts -t 'captured material revision'`
with the usual design-eval opt-in and model. This uses the exact files and failed
judge findings, without a live teacher. `dojo-design-eval-4WWxim` passed both judges
after two free word-budget repairs and one judge pair. The skill clarification
distinguishes teaching an observed-input principle from prescribing an initializer.

Fresh small generation checks also passed both judges after bounded revision:
`dojo-design-eval-Z9UBka` (running state: two judge pairs, one intervening free
length repair) and `dojo-design-eval-gyEi5v` (whitespace: two judge pairs). First
draft failures are retained; these demonstrate revision, not one-shot quality.

`fMe3kW` passed both lessons' material/teaching panels after one revision each,
but failed the exact-material handoff gate (8/9 gates). Kyoshi polished one
sentence after the final pass; no held-out trial ran. The stop rule now explicitly
includes wording/formatting edits. A focused handoff replay using its actual
passing report and files passed unchanged in `dojo-continuation-eval-CA2bUy`.
Set `DOJOFOO_EVAL_HANDOFF=1` instead of `DOJOFOO_EVAL_CONTINUATION=1` to run that
handoff-only test. This does not replace fresh full-workflow acceptance.

This suite runs the **production Kyoshi Eve runtime**, using the local harness selected
by `DOJOFOO_HARNESS` (default OpenCode). It replaces the legacy direct-ACP authoring
benchmark. The course is scaffolded in a fresh temporary directory; existing courses
and conversations are untouched. No mandatory eval directory is added to courses.

## Where prompts live

Every prompt is a Markdown file owned by its role. Code only fills `{{slots}}`
(`@dojofoo/authoring/prompts`); a missing or unused slot throws. Evaluation
prompts are read by package specifier (`@dojofoo/authoring/evaluation/prompts/*.md`),
which resolves identically under Node, Vitest, Vite, the tsup worker and Eve's
eval bundle. (Eve rejects `?raw` imports from outside the generated app.)

| Role | Files |
| --- | --- |
| Kyoshi core | `packages/authoring/src/contracts/KYOSHI.md`, `NATIVE-HARNESS.md` |
| Kyoshi skills | `packages/authoring/skills/<skill>/SKILL.md` (+ `DOJO.tmpl`, `SENSEI.tmpl`): `lesson-design`, `kata-lessons`, `teaching-evals` |
| Sensei platform / style | `packages/ui/src/server/lesson/contracts/DOJOFOO.md`, `KATAS.md` |
| Sensei hidden turns | `packages/ui/src/server/lesson/contracts/TURNS.md` |
| Judges | `packages/authoring/src/evaluation/prompts/{CRITERIA,VERDICT,BOUNDARY,MATERIAL-JUDGE,TEACHING-JUDGE}.md` |
| Simulated learner | `packages/authoring/src/evaluation/prompts/{LEARNER,LEARNER-SCRIPT,FIXTURE-GENERATOR}.md` |
| Suite briefs / chain judge | `packages/authoring/src/evaluation/prompts/suites/{BRIEFS,CHAIN-JUDGE,AUTOEVALS}.md` |

Tests pin composition (every file shipped, every criterion defined once, no
unfilled slots), never sentences. Wording is judged by live evals. Changing a
judge, criterion, brief or scripted learner line bumps its rubric version in
the owning `prompts/index.ts`.

### v6 (2026-10-08)

- New `engagement` criterion (hook, purpose, winnable first move, specific brief
  acknowledgement, frustration handling, celebration). Grounded in SDT, ARCS,
  Hattie & Timperley, INSPIRE; see `skills/lesson-design/SKILL.md` sources.
- Severity: `pass: false` only for blocking problems; polish goes in
  `improvement` on a passing criterion. Kyoshi fixes failures and reports
  refinements instead of spending attempts on them.
- The Sensei no longer receives the stale, stricter boundary that was prepended
  to every learner message; judges and Sensei now share one boundary meaning.
- `dojo_lesson_complete` no longer carries its own Review rule.
- v6 verdicts are not comparable with v5 or earlier.
- Panel (`evaluation/panel.ts`): consensus plus a safety veto. A criterion
  blocks when both judges fail it, or when either judge finds a solution leak.
  Other split verdicts are `disputed` in the diagnostics. Acceptance requires
  both judges to pass; disputed material does not start a paid teaching trial.
  Incomplete panels and missing judge evidence are never a pass.
- Continuity evaluates only the last lesson; earlier lessons are fast-forwarded
  as completed progress (`sensei-chain-v7`).

## Run

`pnpm --filter @dojofoo/evals eval:authoring` discovers cases without model calls.

For the fixed two-local-judge material test (no Gateway key):

```sh
DOJOFOO_HARNESS=opencode DOJOFOO_EVAL_MODEL=zai-coding-plan/glm-5.3 \
  pnpm --filter @dojofoo/evals eval:authoring --live --local-judges

DOJOFOO_HARNESS=pi DOJOFOO_EVAL_MODEL=deepseek/deepseek-v4-pro \
  pnpm --filter @dojofoo/evals eval:authoring --live --local-judges
```

This authors one isolated course through the production Kyoshi runtime, then gives
the same material to Codex `gpt-6-astra` and Claude `claude-opus-5-5`, both at high
effort using their existing CLI logins. This does not add Claude as a supported
Dojo teaching runtime. No automatic retries, substitutions, or model matrix runs.
Pi reads its native `~/.pi/agent` provider configuration (or `PI_CODING_AGENT_DIR`),
including custom providers in `models.json`; credentials are not copied.
The fixed rubric is in `evals/local-judges.ts`; each judge must return all four
criteria exactly once. A failed judge process is an infrastructure failure, not
a teaching score. Raw judge responses and prompt hashes are retained outside
the course; the course's `.dojo/` contains the instruction snapshot, authored
material and combined verdicts.

Regrade saved material without paying for another authoring run:

```sh
pnpm --filter @dojofoo/evals exec tsx src/rejudge-material.ts /path/to/eval-course --live
```

For two linked authoring turns (first lesson, then the next lesson):

```sh
pnpm --filter dojofoo exec tsup
DOJOFOO_HARNESS=pi DOJOFOO_EVAL_MODEL=deepseek/deepseek-v4-pro \
  pnpm --filter @dojofoo/evals eval:authoring --live --local-judges --chained
```

This retains chronological file snapshots, completed dialogue/tool events, model
selection, the exact Kyoshi instructions, and both judge verdicts. Missing lesson
files stop the chain before paid grading. The chain rubric checks clear, compact
language, no interview loop, concrete teaching guidance, one lesson at a time,
and continuity without repeated welcomes. It is a separate rubric from the frozen
single-lesson baseline; their scores are not directly comparable.

The `authoring-chain-v4` briefs specify the learner and learning goals, not how
to teach them. The former scripted "the trial felt cold" coaching turn has been
removed: teaching quality must come from shipped Kyoshi instructions and the
bounded evaluator feedback loop, not extra pedagogical directions from a human.
Both distinct judges must return complete verdicts; an empty panel is an error.
Previous v3 passes are not acceptance evidence for v4.

Add `--revise` to test one bounded author–eval–revision pass. After a material
failure, Kyoshi receives the failed findings and revises each lesson separately
in the same conversation. Installed-course checks and both judges run again.
Passing material skips this pass; infrastructure errors stop immediately. At most
two additional author turns and two additional judge calls are made. Both rounds
are preserved as `chain-judge-round-0.json` / `chain-judge-round-1.json`; the final
verdict is also stored in `chain-judge-results.json`. A revised pass is evidence
of eval-assisted authoring, not one-shot reliability. Sensei receives only the
resulting production lesson setup, never the review feedback or evaluation hints.

Before judging, the generated course is installed through the production trial
path and checked with the built CLI. Unsolved scaffolds must produce real failing
tests, not command errors or zero discovered tests. A temporary module-load error
in the trial's learner file must also prevent collection; this catches tests
that incorrectly import the installed template instead of the editable file.
The probe is restored and never enters a Sensei trial.

## Production Sensei handoff

The shared staged evaluator now lives in `@dojofoo/authoring/evaluation/run`.
It records material review, the production trial, and teaching review separately;
both judges must pass every criterion. Material failures stop before the trial.
Provider failures are infrastructure; learner-code ownership violations are
teaching failures. Editing the course during evaluation invalidates the result.
Every attempt writes its material hash, snapshots, stage, and verdicts under
`.dojo/evaluations/run-*`; it does not overwrite an earlier failed attempt.

For the low-level `--run` replay, prepare `.dojo/learner-fixtures.json`. Key entries by
lesson ID, each with `misconception`, `wrong`, `solved`, and `review` strings.
Review these against the generated exports and tests. They are learner-side
inputs, never extra teaching instructions.

```sh
pnpm --filter dojofoo exec tsup
DOJOFOO_HARNESS=codex CODEX_PATH=/path/to/installed/codex \
  node packages/cli/dist/teaching-eval.js --run /path/to/authored-course

pnpm --filter @dojofoo/evals exec tsx src/judge-handoff.ts \
  /path/to/authored-course/.dojo/handoffs/run-ID --live

# Same worker, with material and teaching judges (paid usage):
DOJOFOO_HARNESS=codex DOJOFOO_EVAL_FIXTURE_HARNESS=pi \
  DOJOFOO_EVAL_FIXTURE_MODEL=deepseek/deepseek-v4-pro \
  node packages/cli/dist/teaching-eval.js \
  --evaluate /path/to/authored-course 001-first-lesson
```

`--evaluate` generates its learner fixtures automatically after material review,
using the official HarnessAgent with tools disabled and one fresh session per
lesson. Inputs, raw responses, and parsed fixtures are retained in a separate
temporary directory, referenced by trial evidence. No reference solutions are
placed in the authored course or Sensei instructions. Invalid output fails the
attempt without automatic retries or model substitution. Before Sensei starts,
the production test adapter verifies that wrong code fails a test and solved code
passes every test. Scaffold files are restored and these checks do not record
completion or enter lesson history. Reports remain in the trial workspace's
`.dojo/fixture-preflight.json`, including failures.

For a controlled prompt comparison, set `DOJOFOO_EVAL_FIXTURE_PATH` to a saved
`learner-fixtures.json` when using `--evaluate`. The worker validates and replays
that fixture instead of generating a new mistake. Production preflight, adaptive
review responses, and both judges still run. Held-out evaluation rejects this
override and generates fresh fixtures. The handoff records the fixture path.

Bounded live fixture verification (2026-10-07): Pi/DeepSeek generated one lesson's
fixtures in `dojo-learner-fixtures-TTiAC7`. The first preflight exposed a missing
`DOJO_PROJECT_ROOT` in the new direct runner path: checks loaded the installed
stub. After fixing that path and adding a regression, a fresh trial
`001-largest-number-ee7d42e3-c4c9-4df9-9c54-05eee4821fe6` reported 4/5 passing for
the misconception and 5/5 for the solution, then restored the scaffold. The failed
trial remains intact. This verifies one generated fixture, not teaching quality
or the full autonomous authoring workflow.

Omit the lesson ID for a two-lesson continuity evaluation. A one-lesson result
does not establish continuity. This is one attempt, not an automatic retry loop;
the worker has a 35-minute evaluation deadline and each judge call a 3-minute
deadline. Cross-model matrices are not started by this command.

The handoff uses the actual lesson services, coordinator routes, MCP tools, CLI
checks, and production instructions. Evidence is retained per attempt, including
model selection, actual learner messages, and separate session IDs. This internal
worker runs outside the authoring server because the lesson runtime owns
process-wide settings and harness processes. The opt-in live Vitest test calls
the same runner; ordinary unit and worker smoke tests make no model calls.
Judges run only after deterministic
lifecycle checks pass. Each teacher turn must leave both the learner file and
installed teaching material/tests unchanged. Pi is currently supported by Kyoshi,
not the production ACP lesson path. Do not substitute a custom Pi teacher and
call it production.

An authoring pass alone is insufficient. Acceptance requires the generated
files to drive isolated production Sensei sessions through uncertainty,
misconception, repeated failures, success, and review. Judge those transcripts
separately from material quality. Two fresh full-chain passes are required; a
unit-test pass or authoring-only verdict is not a full-chain pass.

Use identical briefs, author model, and rubric for before/after comparisons.
Judge agreement on authored instructions is not evidence that real teaching
works: evaluate learner dialogue separately. The current chain uses Pi/DeepSeek
for authoring and an explicitly selected production Sensei harness. Do not expand
this into a cross-model matrix without permission, or silently substitute models.

Teaching rubric `sensei-chain-v2` allows either an explanation or a short question
to establish transfer during review. The earlier v1 required a question, which
conflicted with the production rule against turning Review into another quiz.
Keep old verdicts; do not compare rubric versions as a pure prompt improvement.

Material rubric `authoring-chain-v2` judges the guidance at each lesson's handoff,
not defects already corrected during drafting. The full history still determines
scope and revision quality. Author-only verification code and test expectations
are distinct from solution leaks in learner scaffolds and Sensei guidance.

`authoring-chain-v3` keeps those criteria but grades `handoff/files`, the actual
final material supplied to Sensei, including any bounded feedback revision.
Chronological snapshots and all earlier verdicts remain available. Do not compare
v2 and v3 as a pure instruction improvement or conceal the extra revision turns.

For the separate native Eve autoevals author-and-revise case, set `DOJOFOO_EVAL_JUDGE` to an AI Gateway model and provide
`AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`, then run:

```sh
DOJOFOO_HARNESS=opencode pnpm --filter @dojofoo/evals eval:authoring --live
```

Optional `DOJOFOO_EVAL_MODEL` selects the harness model. Its existing local login
is used; the judge is separately configured and never replaces the tested model.
Live execution consumes model usage: two authoring turns plus two judge calls
(native harness steps may make additional requests). No cross-model matrix runs
automatically. This initial judge binding requires Gateway credentials.

## What is measured

- Valid manifest and real authored SENSEI material.
- Novice prerequisites respected; unfamiliar syntax taught before recall questions.
- No full implementation or equivalent solution recipe hidden in a hint ladder.
- Revision after learner feedback changes files, not merely the final chat reply.
- Concrete diagnostic teaching, adaptive help, and meaningful post-pass transfer.

The chain material criteria are in `evals/authoring-chain.eval.ts`; observed
teaching criteria are in `evals/teaching-judge.ts`. The separate single-lesson
baseline remains in `evals/teaching.eval.ts`. Eve records judge rationales,
events and assertion results in the temporary Kyoshi app's `.eve/evals/` directory.
The workspace path is printed and retained for human inspection. Judge gates must
pass; structural checks alone do not establish good teaching.

## Verification boundaries / next cases

Kyoshi exposes the native Eve tool `dojo_authoring_evaluate`. Its parameters
are lesson IDs only: the host owns model selection and the immutable judge
implementation. In the authoring UI, use **Evaluation settings** to choose the
Sensei and simulated learner models and consent to paid trials. Preferences live
in `.dojo/evaluation-settings.json`; no credentials or worker path are entered.
The production evaluator is bundled with the CLI. For developer acceptance runs,
the equivalent explicit configuration is:

```sh
DOJOFOO_EVAL_TEACHING_HARNESS=codex
DOJOFOO_EVAL_TEACHING_MODEL=gpt-6-astra
DOJOFOO_EVAL_FIXTURE_HARNESS=pi
DOJOFOO_EVAL_FIXTURE_MODEL=deepseek/deepseek-v4-pro
```

These developer overrides must be environment variables of the authoring server.
Missing or partial configuration never silently selects models. Each lesson set gets three persisted
attempts (initial evaluation plus two possible revisions). Replaying an Eve call
returns its saved report; an interrupted call without a report is not relaunched.
Malformed `dojo.yaml` is a `MaterialFailure` precondition error: fix the authored
file before retrying. It starts no worker and consumes no evaluation attempt.
The receipts in `.dojo/evaluation-allowances/` are usage accounting, not replacement
chat history. This protects the tool's budget, not the host filesystem from a
malicious agent with native shell access. Judge failures return actionable verdicts
to Kyoshi; the tool does not itself edit lessons or weaken criteria.

The authoring UI's Evaluate lesson action uses the same host entry point and
allowance as Kyoshi's tool, replacing the course-local cassette script. The Report
action loads the latest shared report, including agent-triggered runs, and
distinguishes material, teaching, infrastructure, and stale outcomes. The fixed
local judge pair lives in the authoring package; developer eval scripts reuse it.

Browser verification: the saved reference report renders in the production
authoring layout with expandable findings and its own scroll area. The Playwright
case `saved evaluation findings` covers opening, collapsing, closing, and reopening
a report in an existing session without posting a message or starting an eval.
This verifies report interaction, not the quality of its judgments.

Add `--quick` for the fast loop: one lesson authored and evaluated by Kyoshi,
no second lesson and no held-out run (a few minutes).

Run `eval:authoring --live --local-judges --workflow` with the configuration above
to test the autonomous workflow. Build the CLI first (`pnpm --filter dojofoo build`,
or `npx tsup` in `packages/cli`) and set `DOJO_CLI=$PWD/packages/cli/dist/index.js`:
Kyoshi's evaluation tool runs the `teaching-eval.js` shipped beside it. It supplies learning goals only, requires Kyoshi
to call its evaluation tool, checks one-lesson-at-a-time authoring, and rejects
material edited after the passing evaluation. After both lessons pass, it runs a
held-out confident learner against the frozen material and production teaching
policy. No further author turn receives that held-out feedback. The host limits
each lesson set to three evaluation attempts; this is not a hard limit on every
native model step.

Full acceptance remains unproven: one fresh full workflow now passes (see
`dojofoo-kyoshi-eval-u0XlxR` below); the second is still required. Earlier runs
caught repetitive guidance and an equivalent solution recipe. Those failures
remain failures even when the other judge passes. Browser rendering is a separate
verification; unit tests of the report component do not establish it.

The chained handoff exercises two lessons with scripted novice messages and
reviewed learner edits. It covers introductions, uncertainty, misconceptions,
unchanged failing checks, success, Review followed by another completion prompt,
and advancing through the production next-lesson service. It does not measure
human learning outcomes, browser rendering, or choosing Move on inside the agent's
completion prompt. Calibrate graders against human-reviewed good and bad cases
before treating their scores as general release gates.

Report failures separately: harness/server/transport failures are infrastructure;
invalid course files or failed material criteria are material; observed Sensei
behavior is teaching. Preserve failed attempts instead of selecting only passing
transcripts. Two passing fresh chains demonstrate this tested configuration and
scenario, not reliability across untested models, subjects, or learners.

### Revision feedback calibration (2026-10-08)

Fresh workflow `dojofoo-kyoshi-eval-3JbJwi` exhausted three attempts on its first
lesson. `run-PAZS2n` passed material review but failed observed teaching: an
equivalent card walkthrough disclosed the algorithm. Kyoshi revised autonomously,
but `run-Ff656i` and `run-xCGWF7` prohibited too much concept teaching and failed
adaptive instruction. The workflow stopped; it did not advance to lesson two.

The second attempt also exposed contradictory judge advice: replace the leaked
maximum example with tallest-person or longest-word tracking. Feedback prompts
now require recommendations to satisfy every criterion, including withholding.
Rejudging the unchanged second-attempt material with both fixed judges
(`dojo-judges-vf7qiP`, prompt hash
`fcad640872e2f9cf99a4337a442b8db848ed19fada855888469e6c65aa1eba7c`)
retained the failure and suggested isolated state/comparison demonstrations
instead. This is one feedback calibration, not general grader reliability.

Kyoshi's revision guidance now explicitly preserves direct concept teaching
while reducing a leaked demonstration. A fresh workflow must verify that change;
prompt-contract and instruction-loading tests do not prove better teaching.

### Numbered context calibration (2026-10-08)

Fresh workflow `dojofoo-kyoshi-eval-OFpvNl` revised its first lesson after both
judges rejected missing-knowledge instruction. `run-1y3FCd` then passed both
material and teaching panels. The two-lesson `run-ENgPm8` passed material review
but failed teaching accuracy: lesson-two highlights pointed one line below the
actual statements. Neither judge reported a solution leak in that trial.
The next revision, `run-QMxngV`, passed material review but stopped during the
trial with a Codex 45-second ACP inactivity error. This is an infrastructure
failure, not a teaching verdict or a completed acceptance workflow.

Agent-facing context now includes explicit one-based source line labels, shared
by injected context and `dojo_context`. Structured source remains unchanged.
Regression tests cover blank lines, CRLF, and edits between turns. Shared teaching
guidance also resolves the conflicting instruction to wait for repeated struggle:
missing knowledge is taught immediately. These changes require a fresh live run;
the earlier first-lesson pass does not verify them.

The lifecycle audit also found that the trial answered Pause and then advanced
directly through the lesson service. It now answers Review → Move on on the first
of two lessons, verifies the returned next-lesson identity, and answers Review →
Pause on the last. A wrong navigation result fails deterministically. Earlier
runs do not prove this stronger completion path; it requires a rebuilt worker.

### Reference Sensei (2026-10-08)

Latest diagnostic (2026-10-12): `dojofoo-kyoshi-eval-qQ0R7h` tested a
template change linking misconceptions to examples and presenting examples as
alternatives rather than a script. Kyoshi used its own evaluator three times:
`run-vjjr78` failed material for a renamed maximum algorithm; `run-BJ2jso`
passed material but failed teaching because Sensei invented that algorithm
again and prescribed the learner's edit; `run-hJhs4q` failed material for a
self-answered guard-placement question. The instruction experiment was reverted.
This was a one-lesson diagnostic, not continuity or held-out acceptance. The
existing reference below remains the comparison fixture; do not recreate it or
treat its earlier isolated pass as a successful authoring workflow.

`dojo-sensei-event-policy.mHSmMz` then tested factual-only check events against
the saved wrong-code fixture. `run-fFYicz` stopped at material review; it did not
test teaching. After two local material corrections, `run-dQPnwi` passed both
material judges and the lifecycle, but failed teaching for naming the exact
comparison repair and answering probes. The check-event experiment was reverted.
OpenCode's native message records confirm this trial used agent `dojofoo` and
`zai-coding-plan/glm-5.3`, not the default coding agent. Evaluation policy captures
now include `TURNS.md`; earlier fingerprints omitted these hidden instructions.

Role diagnostic `run-sgwljQ` used the same saved lesson and learner fixture with
the production check events, replacing only the shared introduction's “pair
programmer” identity with “teacher, not a coding assistant.” Both material judges
passed. The production trial completed its lifecycle, but both teaching judges
failed adaptation and solution withholding: Sensei invented a maximum-finding
marble walkthrough and prescribed the comparison-variable repair. The role
change was reverted and the CLI rebuilt. Evidence is retained under
`dojo-sensei-event-policy.mHSmMz/.dojo/` (handoff `run-K8IMq1`). This does not
establish a causal comparison with `run-dQPnwi`, which used different check-event
wording, nor does it establish continuity or held-out performance. Changing the
role name alone did not prevent the observed failure.

Native prompt audit: OpenCode v1.18.35's
[`session/llm/request.ts`](https://github.com/anomalyco/opencode/blob/v1.18.35/packages/opencode/src/session/llm/request.ts#L56-L65)
uses `agent.prompt` **instead of** `SystemPrompt.provider(model)` when a custom
agent prompt is supplied. Our `dojofoo` primary agent supplies the production
Sensei instructions there. Additional session/user system content can still be
appended; this finding rules out the default provider prompt being automatically
prepended, not every possible configuration or plugin influence.

Example-selection diagnostic `run-ZaqPBh` changed one kata Help bullet to require
using the relevant authored worked example before improvising. It retained the
same material and learner fixture. Both material judges passed; both teaching
judges failed the trial. Sensei still prescribed `first` → `largest`, and guessed
an assertion input absent from the supplied check evidence. The instruction was
reverted and the CLI rebuilt. Handoff `run-DK9hxx` and the complete verdict remain
under the same diagnostic workspace. Neither this run nor the role diagnostic
supports shipping additional wording as a teaching-quality fix.

Codex control (2026-10-12): `run-3Nvh20` passed material review but could not
introduce the lesson: ACP launched its bundled Codex 0.147.0, which rejected
GPT-6-Astra, while native CLI 0.161.0 was installed. The production adapter now
defaults `CODEX_PATH` to `codex` and honors an explicit override. Adapter/session
regressions pass (34 tests). No credentials or global configuration changed.

After that fix, `run-odlo1o` passed **both material and teaching panels** using
Codex/GPT-6-Astra high with the unchanged shipped instructions and saved lesson
and learner fixture. Handoff `run-rQM9WC` completed review and Pause. This control
used a 180-second inactivity allowance. It demonstrates this configuration on
one struggling-profile lesson, not fresh authoring, continuity, held-out
performance, or reliability of GLM. The next acceptance step is the complete
fresh Kyoshi workflow, not another prompt change.

Fresh workflow `dojofoo-kyoshi-eval-HV1jvc` used Pi/DeepSeek V4 Pro for Kyoshi
and Codex/GPT-6-Astra high for Sensei. It stopped after its three first-lesson
material attempts, before any production teaching or second lesson:

- `run-FUisYd`: one judge blocked a renamed maximum algorithm and adaptation.
- `run-jaiCzL`: both blocked hint ladders whose final rungs remained questions,
  with no direct demonstration of missing knowledge.
- `run-ArOCpM`: one blocked a self-answered state-placement probe: the example
  states that the counter lives before the loop, then asks where the learner's
  running value must live. The other judge passed.

Kyoshi invoked its own evaluator and revised autonomously; the strict gate
correctly rejected the final split verdict and did not advance. Process exited
1 after 9m 51s. `.dojo/workflow-evidence.json` retains actual tool calls, final
material and all three reports. This is a failed full-workflow attempt, not a
teaching-model verdict. The remaining revision needs a new tracing prediction
after the state explanation, not recall of the location just stated. Judge
feedback itself needs checking here: the second panel suggested asking where
the running value lives after showing the declaration, the same pattern the
third panel rejected.

A bounded feedback-only calibration rejudged the saved `run-jaiCzL` material
with one added instruction requiring a fresh unanswered probe. Both judges still
failed adaptation; Claude again suggested asking where the counter belongs after
showing its declaration. Evidence: `dojo-judges-8qkSkJ`, prompt hash
`35f961e0a8b37d8342d03ea3706520fbe4069f4feb9eb03bfa4ce37c8fc95752`.
The prompt experiment was reverted; it did not establish better revision advice.
No new Kyoshi or Sensei trial ran, and the historical report remains unchanged.

Next bounded workflow: `dojofoo-kyoshi-eval-BYAhsn` tests a focused revision
rehearsal in `teaching-evals`: diagnose judge advice rather than copy it, and
check that the proposed question is not answered by its preceding explanation.
Attempt `run-urmtTH` failed material (a renamed maximum algorithm and a
self-answered guard question). Revised material in `run-WQjm8I` passed both
judges. Its production teaching trial (`run-bhKFkc`) also passed both judges:
it taught a comparison and indexing separately, exposed the initializer failure
without prescribing the edit, honored independence, and completed Review then
Pause. The workflow advanced to author `002-filter-positives`.

For the two-lesson set, `run-LfqoRy` failed material: a review supplied the complete
filter expression, and judges requested more support in lesson one. Kyoshi then
changed lesson one's previously accepted SENSEI. `run-yPyq1d` passed material but
both teaching judges failed self-answered probes in lesson two's terminology and
misconception turns. Final attempt `run-9gdVuV` failed material: Codex rejected
analogy-only help for return/loop control in the changed first lesson; Claude
passed. The workflow exited 1 after 23m 7s with 6/7 gates, no held-out run.

Acceptance audit finding: the workflow compared files at each handover but did
not preserve/revalidate earlier accepted snapshots after later authoring.
The first lesson's old teaching pass must not be claimed for its changed SENSEI.
A new regression gate now compares earlier lesson-scoped snapshots after each
later author turn. Adding a curriculum entry is allowed; changes to accepted
lesson files, shared guidance, execution configuration, or added lesson files
invalidate acceptance. Fourteen deterministic snapshot/workflow tests pass.
This gate was added after the run finished, not injected into its execution.

Workflow `dojofoo-kyoshi-eval-4iNlE9` finished after 24m31s without acceptance.
`run-BRPXXs` passed first-lesson material and teaching on attempt three. Second
lesson `run-jj8LHD` passed material but failed teaching: Claude identified repeated
append examples instead of teaching the learner's shared-reference misconception,
plus self-answered probes; Codex passed. The strict panel rejected the split.
Kyoshi also changed shared `DOJO.md` while adding lesson two, invalidating the
first lesson's earlier evidence. The snapshot gate caught it; held-out did not run.
All six attempts and the delivered files remain in that workspace.

The next authoring revision maps each stumbling point to its matching worked
operation in the template, asks for syntax when it is new, and keeps per-lesson
restrictions out of durable course guidance. The pass rule now explicitly covers
shared guidance when adding a later lesson. The acceptance criteria and learner
briefs are unchanged.

Fresh verification `dojofoo-kyoshi-eval-u0XlxR` passed the full workflow in
24m47s: **11/11 gates**, exit 0. Configuration: Pi/DeepSeek V4 Pro author and
simulated learner, Codex/GPT-6-Astra high Sensei, independent Codex/Astra high
and Claude/Opus 5.5 high judges. Lesson one passed on attempt three
(`run-qQpwTu`), after two retained material failures. Lesson two passed on its
first attempt (`run-FxshoV`), without changing accepted lesson-one/shared material.
Held-out confident teaching also passed (`run-mOWYSN`), with the same material
hash `7f6c34ab42af348d2516f4495cbc1564b801145072c41b224567cf58404e9f93`
and teaching-policy hash as the accepted pair. Every criterion passed both judges;
the real trials passed deterministic lifecycle and file-ownership checks.
This is one full pass, not one-shot authoring or evidence across untested models.
Second fresh verification `dojofoo-kyoshi-eval-VSbPO6` failed after 15m24s
(2/3 gates), without reaching a Sensei trial. Attempt one (`run-Qcla2p`)
contained false array/maximum claims and an equivalent solution recipe. Revisions
fixed those, but attempts two and three (`run-p9ZhjN`, `run-iGbIf5`) still lacked
a different-problem worked example for initialization. Codex rejected the missing
help rung; Claude passed, so the strict panel blocked acceptance. Kyoshi respected
the three-attempt limit. This is not a second workflow pass.

The next revision clarifies what a worked example contains: concrete input,
one operation performed, and its result, on another problem. Rehearsal now checks
every stumbling-point fallback, not only three opening replies. It adds no
largest-number-specific rule and leaves judges, briefs and attempt limits intact.
The earlier full pass is evidence for the previous instructions; this revision
still needs two fresh complete passes.
Full-workflow run `dojofoo-kyoshi-eval-1tmn8E` ended with a timeout, not a pass.
First lesson `run-B45YNp` passed material and teaching with both judges after
one rejected draft. Second-lesson draft `run-BLGgBt` leaked the filtering recipe;
its revision `run-Z8VqDD` reached the trial but the worker was terminated.
The retained `running` report is incomplete evidence, not an active evaluation.
No held-out result or complete acceptance pass was produced.

The current checkout's product panel distinguishes disputed criteria from
blocking failures. Full-workflow acceptance remains stricter: both complete
material and teaching panels must pass every criterion, including the held-out
run. It inspects raw verdicts rather than trusting aggregate `status: passed`.
Cancellation tests now cover a non-cooperating material judge, trial and teaching
judge: cancellation saves an infrastructure-failure report without waiting for
the provider, and late results cannot replace it. Prompts edited since this run
require fresh acceptance evidence.

Fresh verification started 2026-10-15 in `dojofoo-kyoshi-eval-5SvoqV`, with
Pi/DeepSeek V4 Pro authoring, Codex/GPT-6-Astra high teaching, Pi/DeepSeek learner
fixtures, and the same two native judges. This is a full workflow, not a matrix
or quick run. Its copied lesson-design and teaching-evals skills match the
current checkout. Finished after 20m13s: the first draft failed material review;
Kyoshi revised it and both judges passed the live teaching. One material judge
still failed adaptive instruction, so strict acceptance stopped before lesson
two. The product's disputed verdict was not treated as unanimous acceptance.

Run `dojofoo-kyoshi-eval-YKuLV8` was interrupted when the author requested shorter,
less prescriptive guidance. It is not acceptance evidence. The revision removes
fixed dialogue sequences and treats SENSEI as concepts, examples and diagnostic
notes. Tool/lifecycle safeguards and judge criteria are unchanged. Fresh live
verification is required; instruction-loading and preflight tests alone do not
prove conversational quality.

Fresh full verification `dojofoo-kyoshi-eval-TZhuga` is running against that
shortened guidance (Pi/DeepSeek author, Codex/GPT-6-Astra teacher, Pi/DeepSeek
learner, the same two judges). No passing result is claimed yet.

For `TZhuga`, the saved ACP configuration records the teacher's effort as `medium`; the
two independent judges use `high`. Model and effort evidence comes from the
saved runtime configuration, not an assumed default.

In that run, first-lesson attempt `run-85lq2j` passed every material and teaching
criterion with both judges after two rejected drafts. Sensei changed its help
after frustration and completed the interactive review without editing learner
code. Continuity, held-out teaching and the second fresh workflow remain
unverified; this is not yet full acceptance.

The second lesson passed both panels at `run-DVPliG`, again on attempt three,
after a collection example and then a live prose explanation revealed too much
of the solution. The successful continuity trial retained lesson one's accepted
files and omitted a repeated welcome. Held-out teaching and the second fresh
workflow are still required.

`TZhuga` completed the full workflow in 34m15s: **11/11 gates passed**.
Held-out report `run-WQZs7L` passed every material and teaching criterion with
both judges, using the same material and policy hashes as `run-DVPliG`.
Its confident learner completed review without receiving the struggling
profile's hint sequence. This is one fresh pass under the shortened guidance;
a second fresh pass is still required. No further prompt tuning follows this
pass before that verification.

Second fresh verification `dojofoo-kyoshi-eval-2Xpu46` was interrupted after its
first material review identified contradictory help instructions: the main
policy allowed adaptation, but hidden Check prompts still required a hint rung.
Those prompts now convey evidence and request useful help without prescribing a
ladder. The judge rubric, learning criteria and solution boundary are unchanged.
`TZhuga` remains a historical pass; it does not certify the revised turn prompts.
Fresh full verification of the corrected turn prompts, `dojofoo-kyoshi-eval-yp5ou4`,
finished after 11m06s with 2/3 gates. `run-sW0iBE` passed both live-teaching
judges, but its material panel retained one adaptive-instruction failure.
Production called this a pass and Kyoshi stopped; strict workflow acceptance
correctly rejected it before lesson two. One revision remained unused. The
product's split-verdict policy therefore does not enforce the goal's unanimous
acceptance rule. No rubric changes or extra coaching turns were added.
While preserving that policy, a focused revision makes worked examples explicit:
concrete input, one operation and result, with help beyond a revealing input.
One-lesson verification `dojofoo-kyoshi-eval-MJh3Jx` used `--quick` and finished
after 11m39s with 2/3 gates. `run-Q8OaQl` passed both teaching judges, but one
material judge still failed adaptive instruction. Kyoshi stopped on the product
pass with one attempt unused. This confirms the unresolved acceptance-policy
mismatch; it is not a full-workflow acceptance run. The 16 affected
skill/preflight tests pass. No evaluator criteria or thresholds were changed.
The authoring regression suite passed (196 tests; 17 opt-in cases skipped), and
the 18 affected production lesson tests passed with the corrected turn prompts.

Material rubric `material-v7` now matches the production trial's scope: the last
requested lesson is taught; earlier lessons provide continuity context rather
than being regraded. Shared course guidance is still assessed. Saved failing
draft `run-LfqoRy` was calibrated with both judges (`dojo-judges-qxR3aw`, prompt
hash `bfbd5faca6943bbb0c68ba44499bd1e5d29c7801b8d5024c5a118e94caf92083`).
Neither recommended changing lesson one; Codex still rejected the complete filter
expression, so the strict panel still failed. Claude's differing leakage verdict
remains recorded, not averaged away. The earlier-snapshot gate separately protects
the accepted lesson's evidence; a continuity report does not certify prior lessons.

The same attempt exposed two setup defects: Eve's `load_skill` could not find
the named Kyoshi skills, and `kyoshi lesson --help` created `001-help`. Fixes
register shipped skills in the managed Eve app and handle help before command
execution. The running attempt retains its original setup/build; neither fix
was injected into its workspace. Regression tests cover native skill discovery,
skill loading across a harness continuation, and help without side effects.

`fixtures/reference-sensei` is a candidate lesson, not a template injected into
Kyoshi or a scripted conversation. Copy it to a temporary directory, install its
dependencies, and evaluate it with the same production worker. Its intentionally
unsolved scaffold fails seven of eight checks; evaluator unit tests exclude it.

The initial 271-word SENSEI follows the purpose/actions/reference organization in
[Matt Pocock's writing-for-agents](https://github.com/mattpocock/skills/blob/main/skills/productivity/writing-for-agents/SKILL.md).
It keeps lesson-specific examples and avoids duplicating the shared platform rules.

Trial `dojo-reference-sensei-BpOUCf/run-K2heB8` passed both panels, but transcript
review still found a code-first opening and repeated summaries. The server's
separate code-first introduction instruction has been removed. Retrial
`run-qPVfi8` opened with the sensor situation instead, but failed the teaching
panel: one judge identified self-answered probes during failure feedback. Both
material judges passed. The same reference has therefore passed once and failed
once; it is not an established ideal. A panel pass is not proof of enjoyment.

The next Kyoshi revision simplifies its authoring section into four workflow
steps and four dialogue/scope rules, following the same writing reference. It
keeps teaching criteria and the evaluation budget unchanged. The 34 contract and
evaluation unit tests pass; live workflow behavior must still be checked.

Workflow `dojofoo-kyoshi-eval-46Kr7x` tested that simplification. Kyoshi authored
one lesson and revised it twice through its own evaluation tool. The first two
material reviews failed; `run-wdDFai` passed both material judges, then failed
teaching: one judge identified a supplied initialization repair. The other judge
passed. Kyoshi reported the exhausted allowance and made an unverified final
edit; the workflow failed before lesson two. This demonstrates revision, not
accepted teaching or continuity. The reference trial remains separate from this
workflow and cannot supply its missing acceptance evidence.

Reference retrial `run-tkh2vK` tested an explicit shared rule to leave the new
application unanswered. Codex passed teaching; Claude failed adaptation after
four repeated diagnoses and a pause instead of new instruction. The reference
now replaces its vague fallback with an isolated array-lookup example and a new
application. That revision needs a fresh live verdict; it is not yet an ideal
Sensei or an accepted Kyoshi template. Earlier failed reports remain unchanged.

`run-YtrGPP` passed both panels after that revision, but its generated mistake
concerned empty input rather than the negative-number initialization being
targeted. Controlled replay `run-ZXEKGs` used the saved fixture from `run-tkh2vK`.
The pass establishes one observed scenario, not that the new lookup example
caused an improvement or that the full authoring workflow passes.

That replay taught lookup and empty-loop behavior, but failed one judge's
adaptive-instruction criterion by answering its own negative-temperature probe.
The reference now pairs a demonstrated comparison with different practice
values. Replay `run-QkNVju` used that pair correctly, but both judges failed the
frustration response: it abandoned the pending lookup example, repeated the
earlier diagnosis, and supplied another comparison's answer. The reference now
replaces “teach an operation you have not yet explained” with staying on the
current example and asking what remains unclear. The previous failures remain
part of the evidence.

Controlled replay `run-wytL2z` passed both material and teaching panels with that
revision. It covers one struggling learner fixture, not continuity or confident
learners. Kyoshi's Quality section now uses the resulting Start / Help / Evidence
/ Review structure without including the reference lesson or its solutions.
The stopped-run rule now explicitly prohibits unverified edits after the
allowance is exhausted. A fresh autonomous workflow must verify these changes;
the reference pass is not a workflow pass.

Workflow `dojofoo-kyoshi-eval-MX00FF` stopped correctly after three attempts,
preserving its evaluated files and proposing—but not applying—further changes.
`run-IChNlI` failed factual accuracy; `run-IXtkYw` passed material but failed
teaching (repeated questions and an equivalent initialization repair);
`run-BZEPsi` failed material because its examples omitted changing loop state.
No second lesson was authored. Kyoshi's existing Help rule now explicitly covers
the concept's new operations and changing values, not just syntax. This revision
requires another fresh workflow; the failed attempts remain evidence.

CLI and UI `types:check` now pass. The CLI's no-emit configuration includes the
shared worker sources, permits native `.ts` imports, and declares its existing
raw-Markdown loader. Telemetry/tracking narrowing and the coordinator header
tuple were corrected without changing behavior. Focused telemetry, fixture,
Pi cassette, and handoff tests pass; these are infrastructure checks, not
teaching verdicts.

Workflow `dojofoo-kyoshi-eval-cbVf4V` passed its first lesson at `run-4ipXTs`, then
Kyoshi applied optional refinements and exhausted its allowance on a failed
rerun. It delivered additional unverified edits. The workflow correctly failed.
Kyoshi now has an explicit handoff point: preserve passing files and present
optional refinements to the author. This change still needs live verification.

### Solution boundary calibration (2026-10-08)

`sensei-chain-v5` implements the author's clarified boundary: teach missing
principles and relevant documentation, even when the answer becomes inferable.
Leave the diagnosis and exact edit to the learner; do not supply the repair or
complete recipe. Material and teaching judges share this boundary.

Run its focused, paid calibration explicitly:

```sh
DOJOFOO_EVAL_JUDGE_CALIBRATION=1 pnpm --filter @dojofoo/authoring test src/evaluation/solution-boundary.live.test.ts
```

All four excerpts passed calibration with both existing judges: principle and
documentation allowed; exact edit and multi-turn recipe rejected. The excerpts
do not establish a complete teaching pass. Prompts, evidence and verdicts are
retained under `dojo-boundary-calibration-*` in the temporary directory.

Workflow `dojofoo-kyoshi-eval-XM96S7` passed first-lesson material and teaching
under v4, then changed `DOJO.md` and `SENSEI.md` after evaluation. The snapshot
gate rejected it before lesson two. Kyoshi now reads back edits before evaluating
and explicitly treats post-pass cleanup as invalidating the snapshot. The
readiness failure in `dojofoo-kyoshi-eval-FkrqhX` was infrastructure, not teaching:
a native-Node import lacked its `.ts` extension. A subprocess regression now loads
the actual evaluation tool without Vite/tsx resolution; it failed before the fix
and passes afterward. Full v5 workflow acceptance remains outstanding.

### Earlier transfer calibration (2026-10-07)

The first self-testing run revised its own material after a failed panel, then
earned two teaching passes under `sensei-chain-v3`. These are not final acceptance:
that rubric allowed teacher-only review summaries to count as transfer. Re-scoring
the saved first-lesson transcript with explicit transfer criteria made both judges
fail `review-transfer`: Sensei supplied the new trace and the minimum-value
adaptation instead of leaving an application for the learner.

`sensei-chain-v4` requires a learner application opportunity and rejects
self-answered probes. Shared KATAS guidance had prohibited questions during Review;
that conflicting rule is now replaced with a short review exchange. Instruction
assembly tests pass, but the revised teaching behavior still needs a live trial.
The simulator now allows up to two answers to the actual review before expecting
the second completion prompt. It supplies only public dialogue and the learner's
code to the responder, never teacher guidance or judging criteria.

The worker's `--evaluate-heldout <root> <lesson-ids...>` uses a separate confident
learner scenario: a fresh production session, an early explanation and completed
code, and an interactive review. It skips scripted confusion and failure; reports
identify which profile was tested. Run it only after authoring freezes the files,
and do not feed its results back into that authoring attempt. Kyoshi's tool always
uses the struggling profile. Both profiles need passing evidence; neither stands
in for the other. Final workflow acceptance now invokes this gate after both
authoring turns and rejects a failure or a changed material hash. There are no
further author turns in that attempt. Live verification remains outstanding.

Harness-switch UX must disclose a separate conversation before switching and retain
the previous history and files. Model changes within a supporting harness keep the
session, happen at a turn boundary, and show pending/success/failure feedback.
The harness picker itself is a separate UI change, not implemented by this suite.
