# Kyoshi teaching baseline

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
- Panel (`evaluation/panel.ts`): a criterion blocks when both judges fail it;
  either judge failing `solution-withholding` also blocks. A single-judge failure
  elsewhere is `disputed` and reported as a refinement. In this session's runs,
  4 of 6 failed verdicts were split (Codex fail, Claude pass).
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

Kyoshi now exposes the native Eve tool `dojo_authoring_evaluate`. Its parameters
are lesson IDs only: the host owns model selection and the immutable judge
implementation. Enable this paid capability explicitly when starting authoring:

```sh
DOJOFOO_EVAL_WORKER=/absolute/path/to/packages/cli/dist/teaching-eval.js
DOJOFOO_EVAL_TEACHING_HARNESS=codex
DOJOFOO_EVAL_TEACHING_MODEL=gpt-6-astra
DOJOFOO_EVAL_FIXTURE_HARNESS=pi
DOJOFOO_EVAL_FIXTURE_MODEL=deepseek/deepseek-v4-pro
```

These must be environment variables of the authoring server. Missing or partial
configuration never silently selects models. Each lesson set gets three persisted
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
to test the autonomous workflow. It supplies learning goals only, requires Kyoshi
to call its evaluation tool, checks one-lesson-at-a-time authoring, and rejects
material edited after the passing evaluation. After both lessons pass, it runs a
held-out confident learner against the frozen material and production teaching
policy. No further author turn receives that held-out feedback. The host limits
each lesson set to three evaluation attempts; this is not a hard limit on every
native model step.

Full acceptance remains unproven. Retained live runs demonstrated autonomous
revision and a first-lesson teaching pass under v4, but the two-lesson panel caught
repetitive guidance and an equivalent solution recipe. Those failures remain
failures even when the other judge passes. Two fresh complete workflow passes,
including held-out teaching, are still required. Browser rendering is a separate
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
