# First controlled comparison — 2026-10-17

Ten successful Sensei calls and two fresh Codex judge calls used `gpt-6-astra`
with high effort, through the local Codex CLI and its existing login. One earlier
launch failed before returning a response; it counts against the authorized
teacher-call allowance. No cross-model matrix or full-course run was performed.

Both judges saw counterbalanced A/B responses without prompt-version labels or
their peer's verdict. They use the same model family, so separate calls do not
establish independence of model biases. Human calibration remains outstanding.

| Fixed state | Judge 1 | Judge 2 |
| --- | --- | --- |
| First arrival | Candidate | Candidate |
| Still reading | Tie | Tie |
| Unknown callback | Tie | Baseline |
| Missing return | Baseline | Baseline |
| Independent practice | Tie | Tie |

## What changed and what did not

The candidate improved the opening: it referred to the actual `wordLengths`
task and left room to read instead of assigning an unrelated doubling exercise.
Reading time and the explicit request for independent practice were respected
by both versions. The independent-practice responses were identical.

The candidate's callback reply ends with a conceptual question. It is relevant,
but judge 2 preferred the baseline's additional explanation of passing versus
calling a function. This is not evidence that every explanation needs a quiz.

The candidate's missing-return reply explicitly suggests either removing the
block body or returning from it, then directs the learner to adjust and check.
Both judges preferred the baseline's separate example explaining the concept.
This matches the concern about a teacher prescribing the repair. It does not
prove that the baseline example is always safe: the human boundary still
matters, especially when an example is directly transferable to the solution.

## Decision

Do not promote this candidate as an overall improvement. Preserve the opening
finding, but review the actual replies with the user before another revision.
No automatic pass threshold or repeated generation selected a winning sample.

The live test passing means calls completed and structured verdicts validated;
it does **not** mean the teaching passed. This probe used the production
instruction assembler but not its full ACP session lifecycle or Kyoshi authoring.
It has one sample per version per state, no learner follow-through, no held-out
calibration, and no continuity or retention evidence.

## Traceability

Raw inputs, responses, events, timings, and judge outputs are in the directory
recorded as `comparisonExecution.output` in [evidence.json](evidence.json).
The source is `packages/ui/src/server/lesson/teaching-comparison.live.test.ts`.
Baseline revision: `fe3f07f`. Policy hashes are recorded in the evidence index.
The [blind review](blind-comparison.md) preserves learner-visible replies.

Next: human preference review, a narrower instruction revision, and regression
cases for the observed weakness. Further paid runs require remaining-budget
accounting or renewed authorization; two fresh end-to-end runs remain undone.
