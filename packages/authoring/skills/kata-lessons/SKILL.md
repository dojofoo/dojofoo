---
name: kata-lessons
description: Authoring kata courses, meaning deliberate practice against executable checks. Use when creating or editing dojo.yaml katas, a lesson's kata.ts scaffold and tests, or a kata SENSEI.md.
---

# Kata lessons

A **kata** is deliberate practice: the learner edits one scaffold until executable checks pass, and the Sensei pair-programs beside them. The checks define *what* must work. The SENSEI.md defines how the learner gets there and why it is worth it. Apply `lesson-design` to every lesson.

## Files

```yaml
test: npx vitest run {template}
katas:
  - name: 001-example
    template: src/001-example/kata.ts
    description: One observable learner outcome.
    difficulty: 1
```

- Write every `katas` item as an object like the one above.
- `src/<NNN-slug>/` holds `SENSEI.md`, the learner scaffold `kata.ts`, and `kata.test.ts`; the CLI finds the tests beside the scaffold. Preserve existing course paths when editing older lessons.
- `test` is a shell command; `{template}` expands to the test file. Add a lesson-level `test` only when a lesson needs a different command.
- Tests import from `@/katas/<lesson-id>/kata`. The scaffold's Vitest alias resolves that to your authored code locally and to the learner's editable file once installed. Verify both.
- Keep `mise.toml` as the toolchain source. Use `mise run setup` and `mise run check`; do not rely on the author's global Node or package-manager versions.
- The scaffold compiles, exports the agreed signature, and fails the checks. Write reference code outside the course to prove the tests pass, then leave the scaffold unsolved.
- Each test name reads as a behavior the learner can understand ("keeps zero out of positives"), because failures show it.

## Checks as teaching

The tests are the learner's feedback loop, so order and name them like a staircase: the easiest win first, then each stumbling point as its own case. Types say which values are allowed; the task says when to return them, so state empty-input behavior explicitly instead of inferring it from a return type.

## Templates

Use `DOJO.tmpl` and `SENSEI.tmpl` as starting notes, not required headings. Replace every `{placeholder}` with real material; omit irrelevant sections.

- **DOJO.md is durable.** It holds the learner's entry baseline, broad course outcomes and shared rules, not live progress or a lesson inventory. New concepts and restrictions belong in each SENSEI.md. `dojo.yaml` holds the order; an installed Sensei runs `dojofoo kata --list` for inventory and progress.
- **Relevance.** Use the author's context when supplied. Otherwise explain the value in the actual task; don't invent a separate story or warm-up exercise.
- **SENSEI.md is private and lesson-specific.** Tone, turn length, help selection and solution protection come from the shared Sensei policy, so leave them out.
- **Isolated examples.** Illustrate a missing operation, not the kata's algorithm in another story.
- **General names.** Name each operation by what it does anywhere ("a running value", "a guard for missing data"), never by the edit it implies here ("start from `numbers[0]`"). Read in order, the headings must not recite the algorithm.
- **Material, not a script.** Give concepts and useful examples, not mandatory questions or a sequence of replies. The learner chooses their edits; Sensei chooses how to help.
- **Concrete and short.** Use real values. Aim for about 200 words; preflight rejects more than 450. Keep only lesson-specific knowledge.

## It's working if

- The production course checks run, discover the tests, and fail on the unsolved scaffold.
- Reference code passes every test.
- Every `{placeholder}` in SENSEI.md and DOJO.md is replaced with lesson-specific material.
- The lesson preflight passes.
