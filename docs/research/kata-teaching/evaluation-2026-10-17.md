# Evaluation sweep — 2026-10-17

## Result

The full production authoring workflow passed **11/11 gates** in **22m 44s**.
The overall suite is **not green**. One teaching-judge calibration case and one
lesson-design case failed, alongside separate harness and UI failures.

This is one fresh authored course, not two fresh full-course acceptance runs.
Simulated learners and two judges from the same model family do not prove human
learning or eliminate shared judging biases. The broader goal remains open.

## Scope and settings

- Checkout: `feat/uix-narrow-workspace`, uncommitted changes included.
- Kyoshi and simulated learners: Pi, `deepseek/deepseek-v4-pro`.
- Production Sensei: Codex, `gpt-6-astra`.
- Judges: two separate Codex `gpt-6-astra`/high calls.
- Earlier lessons: actually taught (`priorLessons: teach`), not seeded completion.
- Rubrics: `material-v10`, `sensei-chain-v11`, `authoring-chain-v7`.
- No paid cross-model matrix, deployment, commit or push.

## Live evaluations

| Evaluation | Result | Meaning |
| --- | --- | --- |
| Teaching/material/boundary calibration | 16 passed, 1 failed | Includes one free fixture-integrity test. All six withholding cases and three material-support cases passed. |
| Small Kyoshi design tests | 1 passed, 1 failed | Running-state material passed first draft. Whitespace exhausted three bounded revisions. |
| Production authoring workflow | 11/11 gates passed | First lesson, two-lesson teaching, actual transition/continuity, frozen handoff, and held-out confident learner. |

### Calibration failure

`opening-stub-recital`: both judges accepted the dry interface-led opening as
engaging because it offered a small first step. They caught the incorrect type
explanation elsewhere in their verdicts, but missed the expected engagement
failure. Keep this negative example and its failed expectation; do not relabel it
to turn the suite green.

### Whitespace authoring failure

Both judges saw the same progression:

1. The draft named runs but did not teach how to recognize their boundaries.
2. The revision supplied a cumulative state/initialization/update recipe and
   leaked the algorithm.
3. The final revision removed the recipe but again omitted usable support for
   loop-carried state and the first-character case.

The author chose a character-by-character approach, introducing extra
prerequisites. This is a material-design problem, not an authentication or
transport problem. It needs prompt/lesson-design work, not another harness layer.

## Free checks

| Suite | Result |
| --- | --- |
| CLI, complete serial rerun | 147 passed |
| Authoring | 221 passed, 1 failed, 30 skipped opt-in cases |
| UI | 332 passed, 5 failed, 4 skipped |
| Eval package | 67 passed, 1 skipped |
| Protocol | 4 passed |
| API | 40 passed |
| Avatar | 3 passed |
| Authoring, CLI, UI and eval-package type checks | Passed |
| Config package | No standalone test files; not counted as a pass |

The first parallel CLI run had three timeouts; all 147 tests passed in the
complete serial rerun. Original failures remain in the logs.

### Harness and UI failures

- FX: official adapter maps `allow-all` to `code`, but the installed agent
  advertises `auto`, `ask`, `full-access`. This fails before model inference.
- Packed-agent HTTP host: filesystem restoration times out without a specialist.
  An isolated host-only rerun reproduced it; the specialist variant passed.
  The full packed suite stops at that failure, so later cases are not certified.
- UI: one mixed-icon import assertion and four chat fixture/rendering failures
  (ordering, old timeline selector, duration label, synchronous fragment output).
  These files were unchanged by this work and the failures matched the preceding
  sweep. They remain failures, not silently skipped checks.

The clean-package run also found two stale fixture assumptions: missing copied
prompt/skill resources, then assertions on old Kyoshi wording. The fixture now
copies its actual dependencies and compares compiled instructions with their
source. The compilation checks passed afterward. No runtime fallback was added.

## Evidence

- Logs: `/tmp/dojo-eval-all.QQyRgu/`.
- Full authored course and Eve evidence:
  `/var/folders/6s/2ny5mlnd483gf8f67x6xrhfc0000gn/T/dojofoo-kyoshi-eval-ia3uXk`.
- First lesson: `.dojo/evaluations/run-o80H4x`.
- Both lessons: `.dojo/evaluations/run-0ztolh`.
- Held-out learner: `.dojo/evaluations/run-U29PYd`.
- Teaching event histories: `.dojo/handoffs/run-2AB6gd`, `run-HSTg4L`,
  `run-23kGLl`. Each has `evidence.json` and the supplied instructions.
- Small design cases: `dojo-design-eval-BGkMRo` (pass) and
  `dojo-design-eval-b8lD38` (all three attempts retained), under the same system
  temporary parent directory as the course above.
- Calibration mismatch: `dojo-teaching-calibration-gi7OHy` under that parent.

These temporary artifacts are inspectable now but are not portable or permanent.
Do not substitute this summary for their raw verdicts or claim untested models.

## Next work

Keep the eval setup stable. Refine the engagement judgment and Kyoshi's choice
of prerequisite-appropriate teaching material using these failed cases. Run the
affected small cases before paying for another full workflow. Track the FX and
host-restoration failures separately from prompt quality.
