---
name: teaching-evals
description: Eval-driven lesson development, the way TDD drives code. Use when starting a lesson, after drafting or revising one, when reading an evaluation report, or when deciding what to change after a failed trial.
---

# Teaching evals

A lesson needs observed teaching evidence, not just plausible files. Use checks and rehearsal before spending a paid trial.

## 1. Red: define done before drafting

Write the lesson's checks first: the test staircase from `kata-lessons`, then reference code written outside the course. Done when the course checks fail on the unsolved scaffold and pass on your reference code, both observed rather than assumed.

Consider a confused novice, someone asking for the answer, and someone who solves it quickly. Would the material help Sensei respond differently to each?

## 2. Green: draft to pass

Use `SENSEI.tmpl` to organize the material, not the conversation.

**Preflight is free.** Fix reported structure, placeholders, length and unfinished checks before a trial. `preflight-failed` uses no attempt.

**Check for leaks.** Compare the examples with your reference solution. Remove exact repairs, renamed algorithms and recipes assembled across examples.

**Rehearse briefly.** Could Sensei explain each likely gap without giving the edit away? Check that examples teach the missing decision and leave something new for the learner to do. Don't put rehearsed replies into SENSEI.md.

## 3. Trial (paid)

Call `dojo_authoring_evaluate` with the lesson ID. To check continuity, list the previous lesson first: it counts as the learner's completed progress, and only the last lesson is taught. The trial runs a fresh production Sensei against a simulated struggling learner: uncertainty, unfamiliar terms, a generated misconception, repeated failures, frustration, then success and review. Two independent judges score the material and the observed teaching on engagement, learner-grounding, adaptive-instruction, solution-withholding and review-transfer. Each lesson set has three attempts; preflight findings come back as `preflight-failed` without using one.

## 4. Read the report

- **Blocking** (`decisions.*.blocking`): both judges failed the criterion, or either judge found a solution leak. Fix it.
- **Disputed** (`decisions.*.disputed`): one judge failed it. Read both citations, address the learning problem without copying the judge's proposed dialogue, and retest within the allowance. A combined pass does not clear a failed criterion.
- **Improvement on a passing criterion:** optional polish, not a reason to spend another attempt.
- **Root cause:** find the file that caused the behavior.
  - A missing hook, example or revealing input belongs in SENSEI.md.
  - A wrong learner assumption belongs in DOJO.md.
  - A behavior no lesson file can change, such as a platform rule, goes to the author as a finding, not as a contortion of the lesson.

## 5. Refactor: revise once, well

Treat judge suggestions as diagnoses, not text to copy. Change the smallest thing that fixes the cited problem, keeping the hook, examples and warmth; cut a line for every line you add. Rehearse the changed exchange: could the learner answer by repeating the explanation? Then ask a fresh prediction instead. Re-run the leak diff, then the trial.

## Stop rules

- **Pass:** both judges pass every material and teaching criterion. Stop editing the tested files, including wording and formatting. Hand them over unchanged; list any correction or polish as an unapplied proposal. An edit needs another evaluation, even if it looks harmless.
- **Infrastructure failure or exhausted attempts:** stop, report the evidence and your proposed change unapplied, and never claim a pass.
- **Not configured:** say so once and stop; leave the judges and models as they are.
- **Evidence:** your own rehearsal and preflight are development evals. Only the production trial supports a teaching verdict.
