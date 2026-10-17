# Fresh material → production teaching — 2026-10-17

## Decision

Keep the shared-rubric consolidation and removal of compulsory teaching rituals.
The small replay suggests a useful response to the repetition problem, but does
not establish a reliable teaching improvement or complete the acceptance goal.

The durable [evidence](authored-probe.json) contains actual author instructions,
DOJO/SENSEI material, both production instruction snapshots, selected models,
session IDs, visible dialogue/tool events, and both raw Codex verdicts. Private
reasoning is excluded. Complete streaming records remain at the recorded local
source paths. The runner was edited during this work, so the snapshots are the
evidence for actual inputs; do not infer them from the latest test file.

## Scope and usage

- One native Codex Kyoshi call authored DOJO.md and SENSEI.md for a fixed kata.
  The existing scaffold, tests and setup were supplied, not newly authored.
- Two fresh production Sensei sessions each handled an introduction and two
  fixed learner questions. The second session held authored material constant.
- Two separate Codex GPT-6-Astra/high calls judged the first session. They share
  model-family biases. No new judge calls assessed the replay.
- No cross-model matrix, full course run, completion, retention or independent
  transfer was tested. This is not either of the required full-chain passes.

## First observation

The new material explains functions as values, callbacks, mapping, likely
misconceptions and boundaries. It does not script an opening or hint ladder.
Both judges accepted the material. Both suggested arrow-function body syntax
as possible additional support, rather than requiring another scripted stage.

The first production explanation started with:

> A callback is an ordinary function passed to another operation. That operation calls it when needed. It isn’t a special kind of loop.

After a real MDN lookup, another text block repeated:

> A **callback** is an ordinary function you pass to another operation so that operation can call it. No special function syntax is needed.

These were different text blocks separated by a tool call, not duplicated token
rendering. The answer ended by asking the learner to choose between passing a
function and passing its result, immediately after explaining that distinction.

The return-syntax response taught the language rule, showed three small arrow
function examples, then said to adjust the callback and press Check. Both judges
considered the examples isolated operations, not a full solution. That verdict
does not establish that the directive is the best possible help.

## Small revision and replay

Shared policy now explicitly continues without repeating an explanation across
tool calls. Questions should reveal the learner's thinking or help choose
support, not request repetition of the teacher's explanation.

The same callback question then received:

> A callback is an ordinary function you give to another operation so it can call it when needed. It isn’t a loop itself.
>
> With `map`, **`map` handles going through the array**. It calls your callback with one item at a time, and puts each returned value into the new array.
>
> The key distinction is:
>
> - `greet("Sam")` calls a function now.
> - `greet` refers to the function itself, so you can pass it to something else.
>
> You can write a callback using the ordinary function syntax you already know. “Callback” describes how the function is used.

No duplicated definition or closing recall question appeared in that replay.
The arrow-body reply also became shorter, but still ended:

> Try adjusting the callback’s return behavior, then use **Check**.

This remains a candidate for more natural, learner-directed help. The replay's
introduction also explained callbacks before the learner requested that help;
more orientation is not automatically a better opening. One stochastic replay
cannot establish that the policy change caused the differences.

## Evaluator findings

Both judges returned an overall teaching pass while explicitly admitting that
review/transfer was unobserved. Treat that as limited evidence on observed
responses, not a full teaching pass. The production full-course evaluator still
requires actual stages and distinct lesson sessions before judging completion.
Held-out judge calibration and human preference remain unfinished.

The judges previously received one JSON envelope per text token. Evidence now
joins adjacent chunks of the same message, retaining text/message/tool ordering
and repetitions. A regression test ensures this never hides the repeated
definition above. Raw events are retained unchanged; this is only a cheaper
judge representation, not a UI or protocol rewrite.

## Verification

- Authoring affected tests: 69 passed.
- Eval package: 67 passed, one opt-in test skipped.
- Handoff and learner-evidence focused tests: 38 passed.
- UI and authoring type checks passed.
- Both bounded live runs completed; their passing test status verifies execution,
  not that the pedagogical acceptance goal passed.
- Skill validation and whitespace/diff checks passed.

Next evidence needed: a held-out learner interaction, meaningful review and
completion, and a second lesson using actual prior learner evidence. Do not
replace those with more single-reply samples or promote this result as proven
learning quality.
