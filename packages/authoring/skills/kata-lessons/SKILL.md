---
name: kata-lessons
description: Authoring kata courses, meaning deliberate practice against executable checks. Use when creating or editing dojo.yaml katas, a lesson's solution.ts scaffold and tests, or a kata SENSEI.md.
---

# Kata lessons

A **kata** is deliberate practice: the learner edits one scaffold until executable checks pass, and the Sensei pair-programs beside them. The checks define *what* must work. The SENSEI.md defines how the learner gets there and why it is worth it. Apply `lesson-design` to every lesson.

## Files

```yaml
test: npx vitest run {template}
katas:
  - name: 001-example
    template: src/001-example/solution.ts
    description: One observable learner outcome.
    difficulty: 1
```

- Write every `katas` item as an object like the one above.
- `src/<NNN-slug>/` holds `SENSEI.md`, the learner scaffold `solution.ts`, and `solution.test.ts`; the CLI finds the tests beside the scaffold.
- `test` is a shell command; `{template}` expands to the test file. Add a lesson-level `test` only when a lesson needs a different command.
- Tests import from `@/katas/<lesson-id>/solution`. The scaffold's Vitest alias resolves that to your authored code locally and to the learner's editable file once installed. Verify both.
- The scaffold compiles, exports the agreed signature, and fails the checks. Write reference code outside the course to prove the tests pass, then leave the scaffold unsolved.
- Each test name reads as a behavior the learner can understand ("keeps zero out of positives"), because failures show it.

## Checks as teaching

The tests are the learner's feedback loop, so order and name them like a staircase: the easiest win first, then each stumbling point as its own case. Types say which values are allowed; the task says when to return them, so state empty-input behavior explicitly instead of inferring it from a return type.

## Templates

Fill `DOJO.tmpl` into the course's `DOJO.md` and `SENSEI.tmpl` into each lesson's `SENSEI.md`. Replace every `{placeholder}` with real material; drop optional lines you have nothing for.

- **DOJO.md is durable.** It holds the learner, the outcomes and the rules shared by every lesson. `dojo.yaml` holds the lesson order; for an installed course the Sensei runs `dojofoo kata --list` for the current inventory and progress.
- **The learner's world** drives every hook. Use what the author said. When they said nothing, propose a plausible world for the stated learner and mark it as an assumption in your hand-over.
- **SENSEI.md is private and lesson-specific.** Tone, turn length, the hint ladder and solution protection come from the shared Sensei policy, so leave them out.
- **Different problems.** Worked examples use a different task from the kata, so they teach the operation, not the answer.
- **General names.** Name each operation by what it does anywhere ("a running value", "a guard for missing data"), never by the edit it implies here ("start from `numbers[0]`"). Read in order, the headings must not recite the algorithm.
- **Predictions, not edits.** The first move and every "ask" invite a prediction or explanation. The learner decides which edit to make.
- **Concrete and short.** Real values and situations, one screen per lesson. Every line is something the Sensei could say or ask.

## It's working if

- The production course checks run, discover the tests, and fail on the unsolved scaffold.
- Reference code passes every test.
- Every `{placeholder}` in SENSEI.md and DOJO.md is replaced with lesson-specific material.
