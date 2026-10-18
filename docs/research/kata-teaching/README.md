# Kata teaching investigation

Status: two-pass evidence audit and approved reference direction, 2026-10-17.
Not a completed teaching redesign or a new acceptance result.

- [Audit and research](audit.md): what the current system does, why existing
  passing scores are insufficient, research implications, and experiment plan.
- [Reference conversations for human review](reference-conversations.md):
  approved direction and boundaries, not runtime scripts or labels for unseen outputs.
- [Evidence index](evidence.json): exact local sources and selected saved runs.
- [Blind output review](blind-comparison.md): actual replies for human preference review.
- [Comparison results](comparison-results.md): separate judge verdicts and limitations.
- [Fresh-material production probe](authored-probe.md): new Kyoshi guidance,
  production teaching, a small policy replay, and remaining acceptance gaps.
- [Full evaluation sweep](evaluation-2026-10-17.md): one passing production
  workflow plus the remaining calibration, design, harness and UI failures.

The user approved the reference direction and boundaries and a bounded comparison
of up to 12 short Sensei calls plus two judge calls. The first tested candidate changed
only the shared teacher guidance; course material and authoring templates remained
unchanged so their effects are not conflated. The comparison completed with ten
successful teacher calls and two Codex judge calls. Results are mixed, not an
acceptance pass; see the comparison report and separately retained failed launch.

Subsequent work removes required dialogue-shaped template
headings, supports ordinary learner questions in the evaluator, separates full
two-lesson teaching from seeded completion, and supplies bounded historical
evidence to resumed/next-lesson teachers. The full sweep below exercises this
path; it is not proof of learning gains or reliability across models.

After adversarial review, the user approved continuing the goal. The authoring
chain, material and teaching judges now share one criterion definition; mandatory
hooks, opening quizzes and review predictions were removed. Gateway questions
and the evaluation skill were aligned too. This is not a lowered threshold for
solution leaks or an acceptance result: useful concept support remains required.

The bounded probe drafted fresh Kyoshi guidance for the captured kata and used
the production Sensei for an introduction and two difficulty probes. The later
full sweep passed one fresh production authoring workflow, including both
lessons and a held-out learner. It also found a calibration failure and a
whitespace-authoring failure; the two-run acceptance goal is not complete.
The six-case A/B comparison remains available but has not been rerun.

This investigation uses the `feat/uix-narrow-workspace` checkout because it
contains the evaluated implementation and serves the current authoring preview.
Unrelated UI changes are outside this work. Historical artifacts are in temporary
directories; the index does not make those directories durable or portable.
