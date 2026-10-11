---
name: teaching-evals
description: Testing a lesson the way a learner meets it, before handing it to the author. Use after authoring or revising a lesson, when reading an evaluation report, or when deciding what to change after a failed trial.
---

# Teaching evals

A lesson is done when a learner would learn from it and want the next one, not when its files look right. Test it like a teacher rehearsing: cheap checks first, the paid trial last. Every step ends on evidence you can show the author.

## 1. Checks (free)

Run the production course checks. They must discover the tests and fail on the unsolved scaffold. Reference code, written outside the course, must pass them. This step is done when both are observed, not assumed.

## 2. Rehearsal (free)

Read DOJO.md, SENSEI.md and the scaffold as three learners:

- **Stuck novice:** "I don't know where to start." Is there a hook and a first move they can win? A worked example on a different problem?
- **Answer-seeker:** "Just tell me the fix." Can the Sensei teach the operation without handing over the composition?
- **Ahead learner:** solves it in one go. Is there a review prediction and a stretch case?

For each, write the Sensei's likely first reply from the material alone. Fix any reply that would be cold, vague, or a giveaway. This step is done when all three replies use lesson-specific material.

## 3. Trial (paid)

Call `dojo_authoring_evaluate` with the lesson ID. To check continuity, list the previous lesson first: it counts as the learner's completed progress, and only the last lesson is taught. It runs a fresh production Sensei against a simulated struggling learner: uncertainty, unfamiliar terms, a generated misconception, repeated failures, frustration, then success and review. Two independent judges then score the material and the observed teaching against shared criteria: engagement, learner-grounding, adaptive-instruction, solution-withholding and review-transfer. Each lesson set has three attempts.

## 4. Read the report

- **Blocking** (`decisions.*.blocking`): both judges failed the criterion, or either judge found a solution leak. Fix it.
- **Disputed** (`decisions.*.disputed`): one judge failed it, the other passed. Read both citations and treat it as a refinement: report it, and change the lesson only if the cited turn convinces you.
- **Improvement on a passing criterion:** an optional refinement. Report it to the author; leave the attempt for blocking problems.
- **Root cause:** find the file that caused the behavior.
  - A missing hook, example or revealing input belongs in SENSEI.md.
  - A wrong learner assumption belongs in DOJO.md.
  - A behavior no lesson file can change, such as a platform rule, goes to the author as a finding, not as a contortion of the lesson.

## 5. Revise once, well

Change the smallest thing that fixes the root cause, keeping the hook, the examples and the warmth intact. Re-run checks and rehearsal, then the trial. A lesson-specific corner case the author requests goes in `src/<lesson>/eval.yaml`; see `scripts/eval-types.ts` for its schema and `npm run eval` to run it.

## Stop rules

- **Pass:** stop editing; any change invalidates the tested snapshot. Report the refinements as options.
- **Infrastructure failure or exhausted attempts:** stop, report the evidence and your proposed change unapplied, and never claim a pass.
- **Not configured:** say so once and stop; leave the judges and models as they are.
