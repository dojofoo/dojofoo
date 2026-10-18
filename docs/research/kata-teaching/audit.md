# Why the current kata experience falls short

Initial audit: 2026-10-17, checkout `fe3f07f` plus unrelated user UI edits.
This is a diagnosis and experimental design, not evidence that the proposed
changes improve human learning. Source paths below are relative to the repo.

## Main finding

The system is not simply missing a friendliness instruction. It already has
several. Its stronger constraints nevertheless reward an identifiable pattern:
invent a practical hook, ask an easy question immediately, teach on a different
example, and finish with a prediction. The evaluator recognizes that pattern as
good teaching. A learner can experience the same pattern as irrelevant,
patronizing, disjointed, and controlling.

Three different questions have been conflated:

1. Can the infrastructure run an isolated lesson and complete its lifecycle?
2. Does the teacher perform recognizable pedagogical actions?
3. Does this particular learner experience useful, well-paced instruction and
   demonstrate learning they can later use independently?

Existing runs provide useful evidence for the first, narrower evidence for the
second, and do not establish the third. We should preserve them, not relabel them
as proof of an enjoyable learning experience.

## 1. Reconstructing the actual system

### Authoring

`packages/authoring/src/eve/instructions.ts` assembles:

1. `src/contracts/KYOSHI.md`;
2. the full `lesson-design`, `kata-lessons`, and `teaching-evals` skills;
3. the literal `DOJO.tmpl` and `SENSEI.tmpl` files;
4. `src/contracts/NATIVE-HARNESS.md`.

These skills are embedded, not merely made available for optional discovery.
Editing KYOSHI.md alone therefore does not control the whole instruction set.
The resulting content becomes the Eve-authored agent's instructions; its model
backend delegates through the official HarnessAgent adapter. The inspected
preview uses Pi/DeepSeek V4 Pro.

Kyoshi can inspect and edit the course, scaffold a lesson, run mise tasks, ask
the author a structured question, and request a teaching evaluation. The author
does not need to design the lesson's pedagogy manually. That is the intended
role; the quality of fulfilling it remains the subject of this investigation.

### Teaching

`packages/ui/src/server/lesson/instructions.ts` assembles the platform
`DOJOFOO.md`, the selected teaching-style policy (`KATAS.md`), the course's actual
`DOJO.md`, and the current lesson's `SENSEI.md(x)`. A separate hidden message from
`TURNS.md` starts or advances a turn. Kyoshi instructions are not a teacher input.

`dojoLessonContext()` in `lesson/service.ts` supplies start/resume phase,
completed lesson IDs/titles/summaries, the current objective/state, current code,
and latest test report. Check observations add attempt count, code-change flag,
diff, and test evidence. These are useful observations, but not a learner model.

The course's `Knows` section is a proposed entry baseline. It is not proof about
the individual learner. The code correctly avoids calling completion conceptual
mastery in several places, but it does not currently carry a separate structured
record of demonstrated concepts, unresolved misconceptions, or help already used.

The lesson runtime in this checkout is ACP-based. Pi is supported by the
authoring HarnessAgent path, not by that lesson adapter registry. For the current
preview, Pi authoring and Codex teaching must be configured separately. Earlier
model-default and trial errors were infrastructure/setup failures, not evidence
about the teaching prompt.

### Evaluation

`packages/authoring/src/evaluation/run.ts` preserves material, policy hashes,
judge verdicts, and trial evidence. `authoring-handoff.ts` uses the production
lesson service and checks file ownership and lifecycle behavior. These are real
strengths: it is not simply asking a judge whether a draft looks nice.

However, the struggling learner follows fixed stages. Generated uncertainty and
terminology questions are followed by a pre-generated misconception and incorrect
implementation. Later the driver writes a pre-generated solved implementation,
regardless of how useful the teaching was. Review replies can respond to the
actual question, but this does not make the earlier learning trajectory causal.

The confident profile similarly begins with solved code. Earlier completed
lessons are fast-forwarded for continuity checks, not taught to the same learner
through a full preceding dialogue. These are legitimate targeted tests, but
they cannot establish learning gains or rich cross-lesson learner continuity.

## 2. Concrete failures and causal hypotheses

The evidence index identifies exact files, hashes, and saved reports. Quotations
below are from our own captured outputs, not invented examples.

### A. The reported opening follows the instructions too well

Actual trial `01a141dc-71ad-7032-a4e8-c8a057f4bce8` begins:

> An API might give you a list of names, while your UI needs a value calculated
> from each name. `map` lets you transform every item into a new array.
>
> Start with a small experiment: imagine doubling each number in `[2, 5, 7]`.
> What would the resulting array contain?

The task is `wordLengths(words: string[]): number[]`. Its authored SENSEI supplies
an API/UI hook and a doubling experiment. `DOJOFOO.md:19` mandates a useful hook
and a first step; `DOJOFOO.md:15` says not to repeat the visible goal/tasks;
`KATAS.md:20-22` favors a different problem for instruction.

The output is therefore explainable without assuming that the model ignored its
instructions. The learner must infer why a new arithmetic exercise has replaced
the task they just opened. The API context is related in the abstract, but not
grounded in the concrete word-length problem or in a known personal interest.

Hypothesis to test: brief orientation to this actual task, space to read, and a
response to the learner's chosen starting point will outperform mandatory
hook-plus-probe openings. Do not replace one compulsory opening script with another.

### B. We mistake visible information for processed information

`DOJOFOO.md:15` assumes the goal/tasks need no repetition because they are visible.
There is no observation establishing that the learner has read or understood
them. `streamLessonIntroduction()` starts with the hidden message “Begin the
lesson.” It does not carry a learner-ready signal or a comprehension observation.

Showing a brief orientation is not the same as reciting the entire brief.
Waiting should be a legitimate first teaching decision. We need neither a timer
guessing reading speed nor a mandatory “ready?” gate every lesson.

### C. The template has become a conversational checklist

`SENSEI.tmpl` requires Start/Hook/Builds on/First move, Teach, Stumbling points,
Evidence, and Review. `preflight.ts` enforces headings and mandatory labels from
that template. `kata-lessons/SKILL.md:43` targets roughly 200 words and preflight
rejects more than 450. This measures document shape, not pedagogical sufficiency.

Even though the prose says “not a script,” the layout gives the model a highly
salient first action and sequence. The concrete first-move example is particularly
easy for a teacher to repeat. A short document can still be highly prescriptive;
a longer conceptual reference can be useful if retrieved only when needed.

Hypothesis: keep required technical validity checks, but compare a compact
concept-reference format with this beat-based template. Do not remove checks
until replacement coverage exists. Length should be a maintenance signal, not
an unsupported definition of good instruction.

### D. An overgeneralized leakage rule causes detours

Preserving learner ownership is appropriate. It does not follow that every
explanation must move to an unrelated problem. A direct explanation of what a
callback means can stay attached to the learner's question without supplying
their `wordLengths` implementation. Conversely, renaming a whole solution is
still a leak.

Current text mixes “different problem,” “unrelated example,” “fresh application,”
and a strong warning about cumulative algorithm disclosure. Those instructions
can discourage a clear bridge back to the learner's task. The response then
becomes a chain of disconnected mini-quizzes.

The user-approved boundary remains: explain principles and sourced APIs, even
when the answer becomes inferable; do not prescribe the repair or write the
solution. Review examples at whole-conversation level. The same sentence can
be harmless in one prior context and leak an edit in another.

### E. Some teaching material is technically too absolute

The generated `001-map/SENSEI.md:13,19,30` says `map` never modifies its input.
The method constructs a new result, but callbacks can mutate objects or the
source array. Its same-length claim also needs ordinary-array assumptions;
sparse arrays retain holes and callbacks are not called for empty slots. The
current task can deliberately use dense arrays of strings without teaching
every edge case, but wording should not teach a universal falsehood.

The review says map cannot change count “that's filter”; `filter` removes items,
whereas other operations such as `flatMap` can expand results. This is a material
accuracy issue separate from tone. [MDN's specification-oriented explanation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map)
supports these distinctions. Simplify scope, not truth.

### F. Passing judges accepted the same interaction pattern

Saved passing `run-VHQalc` opens with a high-score hook, points at the stub, and
immediately asks how to compare two entries. Both judges passed engagement and
treated a welcome as optional polish. In `run-3MD8XJ`, a multi-part prediction
about three singleton inputs also passes the one-focused-question criterion.

`CRITERIA.md` requires a first-lesson welcome, while the platform instruction only
prohibits repeated welcomes later. Judge verdicts downgrade that requirement to
optional. More importantly, neither a welcome token nor an easy prediction
establishes that the learner was oriented and willing to engage.

The calibration fixture labels `opening-concrete-purpose` and other positives
as “proposed-reference,” explicitly not human-approved. Agreement with those
labels demonstrated agreement with the implementer's expectations, not alignment
with the user's preference. We must not describe that as human calibration.

### G. The simulated learner cannot prove the teacher helped

`authoring-handoff.ts` writes `fixture.solved` after frustration and independence
regardless of prior responses. Every teacher can therefore receive a successful
learner at the end. Judges can reject bad teaching in the preceding transcript,
but the final pass is not independent evidence that the learner understood it.

The stage script also does not test “I am still reading,” spontaneous curiosity,
an unexpected valid approach, or a learner who wants to stop. The “confident”
case does not prove that an expert was spared redundant beginner questions while
working naturally from an unsolved task.

Keep this driver for lifecycle regression. Do not claim it measures acquisition.
Introduce fixed, focused behavior cases and a separately labeled interactive
simulation. Neither substitutes for human review or delayed unaided application.

### H. A single pass/fail label conceals evaluator uncertainty

In failed `run-7ibxLT`, Codex calls an indexing explanation non-leaking while
Claude sees the combined initializer line reference and `names[0]` example as
the exact repair. Both describe the evidence coherently. This is an important
boundary disagreement, not a reason to count votes until green.

Show the disputed exchange, previous help, and both rationales together. Ask the
human to label the boundary. Improve the rubric from that decision; retain old
verdicts with their original evaluator version.

## 3. Research synthesis and boundaries

These are design inputs, not a literature-derived recipe for every response.
Full-text access was available for several sources below; PRIMM and expertise
reversal were also checked through publisher abstracts. The technical-interview
paper was located in NSF's repository but its PDF fetch timed out in this pass;
its abstract-level finding is not used for quantitative claims here.

| Source and evidence | Implication for Dojofoo | What it does not establish |
| --- | --- | --- |
| [Koedinger & Aleven, assistance dilemma](https://pslcdatashop.web.cmu.edu/KDDCup/FAQ/Koedinger-Aleven-EPR-07.pdf), author manuscript reviewing cognitive-tutor experiments | Giving and withholding help both have costs. Choose assistance from current evidence; “always Socratic” is not a defensible default. | A universal number of failed attempts before explanation. |
| [Salden et al., worked examples and tutoring](https://www.cs.cmu.edu/~rons/AERA%202008%20paper%20-%20Salden%2C%20Aleven%2C%20Renkl%20%26%20Schwonke.pdf), research synthesis | Example study and active problem solving can complement each other. A prerequisite example can help when a learner cannot construct a step. | Permission to show the learner's entire assessed solution; universal superiority of examples. |
| [Sentance, Waite & Kallia, PRIMM](https://doi.org/10.1080/08993408.2019.1608781), school programming study, 493 learners aged 11–14 in 13 schools | Reading, predicting, discussing, modifying, and writing code are useful instructional options. Novices need not invent all syntax before seeing it. | That adults need a fixed Predict–Run–Investigate–Modify–Make ritual in every kata. |
| [Kalyuga et al., expertise reversal](https://doi.org/10.1207/S15326985EP3801_4), review | Support useful to novices can become redundant for experienced learners. Fade assistance based on evidence. | That a completed lesson proves expertise, or a short answer proves confusion. |
| [Shute, formative feedback](https://doi.org/10.3102/0034654307313795), review | Feedback should be relevant, manageable, and timed to the task and learner; diagnosis itself has costs and can be wrong. | Instant commentary after every click, or enforced silence after every first failure. |
| [Ryan & Deci, self-determination](https://www.selfdeterminationtheory.org/SDT/documents/2000_RyanDeci_SDT.pdf), theoretical/research synthesis | Support competence, autonomy, and relatedness: achievable progress, genuine choices, and being listened to. | Maximizing choices, praise frequency, playful stories, or time in chat. |
| [Karpicke & Roediger, retrieval](https://doi.org/10.1126/science.1152408), vocabulary experiments | Previously learned material benefits from retrieval practice; distinguish recall from first instruction. | Quizzing syntax that was never learned, or direct transfer of effect sizes to coding. |
| [Corbett et al., student modelling](https://escholarship.org/uc/item/5bs755pr), ACT programming tutor research | Performance is evidence about knowledge, not knowledge itself. Slips and successful guesses matter. | A calibrated mastery probability from a few free-form LLM observations. |
| [Bastani et al., AI learning trial](https://doi.org/10.1073/pnas.2422633122), high-school mathematics RCT, corrected publication | Better assisted practice can coexist with worse unaided performance. Evaluate later independence separately. | That no-answer policies alone improve learning or all AI tutors help. |
| [Kestin et al., AI tutoring trial](https://doi.org/10.1038/s41598-025-97652-6), undergraduate physics RCT | Carefully designed AI tutoring can be promising in a specific instructional setting. Content and surrounding design matter. | That a generic friendly chatbot or our current prompts inherit those results. |
| [Tutor CoPilot](https://arxiv.org/abs/2410.03017), human-AI tutoring trial | Human expertise remains a productive part of the loop, including review of age/context appropriateness. | Autonomous Kyoshi/Sensei equivalence to a trained human tutor. |
| [Emily Bache, Coding Dojo Handbook excerpt](https://media.pragprog.com/titles/ebdojo/kata-catalogue.pdf), practitioner guidance | Repetition can target process, alternatives, and reflection, not memorized keystrokes. Match the exercise to the skill being practised. | Experimental proof that every short programming exercise is deliberate practice. |
| [Behroozi et al., interview stress](https://par.nsf.gov/servlets/purl/10196170), randomized study identified through repository abstract | Separate learning from performance under observation. Interview rehearsal should be explicit and optional. | Making all kata practice timed or treating interview performance as pure coding skill. |

Design inference: “enjoyable” here should mean coherent, responsive, agentic,
appropriately challenging, and respectful of effort. It should not mean a quota
of jokes, enthusiasm, or fictional scenarios. Relevance can come directly from
the task's behavior; an invented real-world story is not necessary.

For interview-oriented courses, distinguish four objectives: understanding a
technique, implementing it, explaining tradeoffs, and rehearsing performance
under interview constraints. They require different activities. Do not quietly
change from teaching into assessment or withhold instruction to simulate an
interview the learner did not request.

## 4. Proposed instruction ownership

No changes below are applied yet. Reference conversations require human review
before they become calibration data.

| Owner | Owns | Must not become |
| --- | --- | --- |
| Platform | Tool/lifecycle semantics, honesty, learner ownership, privacy, how current context is supplied | A mandated hook/question/review script |
| Kata style | Practice norms, use of learner attempts and checks, assistance boundary, optional reflection | A turn-by-turn pedagogical state machine |
| Kyoshi | Learning objectives, prerequisite boundaries, coherent exercises and evidence, revisions with the author | An interviewer demanding the human design its pedagogy |
| DOJO.md | Stable course purpose, intended entry baseline, course-wide conventions and pedagogical preferences | A claim that every learner already knows the prerequisites; live progress; duplicated tool manual |
| SENSEI.md | Concepts, likely misconceptions, accurate domain facts/resources, optional examples/transfer opportunities | Exact replies, compulsory first moves, the complete solution in prose |
| Learner context | Provenanced observations, explicit preferences, prior assistance and unresolved questions | Personality labels, inferred emotions presented as facts, another hidden policy prompt |

One important current conflict: `kata-lessons/SKILL.md:39` says tone, turn length,
and help selection belong to shared policy, while the user's desired DOJO role
includes course-wide teaching philosophy. Resolve this by allowing the course to
choose a pedagogical preference without overriding platform safety or dictating
every utterance. Keep those responsibilities visible and testable.

## 5. Smallest useful learner awareness

First distinguish four kinds of state, rather than introducing a general profile
database:

1. **Task state:** code version, check result, lesson, selected course. Already
   available and mostly deterministic.
2. **Conversation state:** what was said and shown, open questions, recent help.
   Already in the native thread, but not guaranteed to survive every compaction
   or become available to the next lesson.
3. **Learning evidence:** demonstrated concept, stated uncertainty, specific
   misconception, level of support used, transfer evidence. Missing as an
   explicit, cross-lesson context contract.
4. **Preferences:** e.g. “let me attempt it before hints.” Explicitly supplied,
   revisable preferences, not an inferred fixed learning-style category.

Proposed minimum observation:

```json
{
  "concept": "callback return value",
  "evidence": "Learner explained that a block body needs an explicit return",
  "source": { "sessionId": "…", "messageId": "…", "codeRevision": "…" },
  "status": "demonstrated-with-support",
  "assistance": "one explanation and a prerequisite example",
  "openQuestion": "Independent use in another callback is untested"
}
```

This is a design candidate, not a new schema to implement now. The representation
must earn its place by passing resume/transfer tests. Prefer deriving it from the
native transcript and existing progress records; store only the minimum summary
needed across boundaries, with source references and correction support.

Unknown is meaningful. Failed tests alone do not establish a misconception;
repeated clicks do not establish frustration; passing code does not establish
ownership or retention. Negative evidence should be specific and revisable, not
“weak programmer.” A learner saying “I already know this” should change the next
move without requiring them to complete a ritual quiz.

Required continuity experiments: reload same thread; native compaction; fresh
thread for same lesson; next lesson with an isolated thread; outdated code;
contradictory new evidence; learner correcting the summary. Check both retrieval
and the teacher's actual behavior. Do not add a second transcript store.

## 6. A better evaluation structure

### Keep each claim attached to the right evidence

- Deterministic tests: tool results, file ownership, transitions, configuration,
  context propagation, no synthetic user message rendered as authored text.
- Fixed dialogue cases: readiness, relevance, direct explanation, contextual
  help, no repeated recall, privacy, independence. Same inputs for A/B comparison.
- Interactive simulation: follow unexpected learner replies; label it simulated
  interaction quality, not measured human acquisition.
- Human paired review: which response is more helpful here, and why? Allow
  neither/tie, wrong premises, and disagreements with the rubric.
- Human unaided application: a small new task and, where feasible, delayed
  follow-up. Required before claiming actual learning gains.

Material correctness and teaching usefulness need separate verdicts. Do not make
the teacher compensate for bad authored facts. Engagement should cite a response
to this learner and task, not merely the presence of a “hook.” Judge each opening
under its actual state: unread brief, ready novice, returning learner, or expert.

For leakage, retain the entire relevant exchange. A local snippet cannot reveal
whether several helpful-looking examples collectively supplied the solution.
For adaptation, compare behavior under different evidence, not just whether the
assistant says it adapted.

### Avoid repeating the prior calibration error

The author approved the direction and boundaries of the conversations on
2026-10-17. This is not a label for unseen outputs or approval of a mandatory
script. Split approved examples
into calibration and held-out sets before prompt optimization. Keep negative
controls: friendly answer-giving, irrelevant but accurate teaching, superficially
Socratic guessing, and a silent teacher when help was explicitly requested.

Report agreement/disagreement by criterion and false approvals on user-rejected
examples. Do not promise reliable percentages from a tiny set. Two model judges
can share biases; unanimity is not ground truth.

The [Anthropic engineering guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
supports combining deterministic, model-based, and human evaluation, and
calibrating model graders against people. This is a methodological reference,
not independent evidence that our own rubrics are calibrated.

### Cost and attribution

Hold task, learner inputs, code state, model/effort, and judge version constant
when comparing a prompt change. Current fixture generation can change cases
between revisions; record that as a confound, not a clean A/B win. Preserve every
attempt and report distribution over repeats, not just the best transcript.

Start with free inspection and contract tests. After reference approval, use a
small explicitly bounded paired trial. Propose the model-turn cap and expected
usage before the two full fresh-workspace acceptance runs. Do not run a broad
model matrix as a substitute for fixing the evaluation question.

## 7. Inspection and dashboard plan

The current report component exposes per-judge criteria and explanations, but not
a usable cross-run view. Saved snapshots are a good foundation. Import selected
historical failures and passes into a framework-independent experiment view
before spending more usage. Langfuse has been proposed; no destination or
credentials are configured, and no upload has happened.

Each comparison needs: immutable prompt/material IDs, learner scenario version,
actual harness/model/effort, visible dialogue, tool events, judge rubric version,
human comments, and source links. Display infrastructure errors separately.
Do not invent dollar costs where a subscription harness exposes no reliable cost.
Exclude credentials, unrelated conversations, and private reasoning by default.

## 8. Next steps and completion ledger

| Requirement | Evidence now | Still needed |
| --- | --- | --- |
| Diagnose real failures | Current map opening traced to exact material and policy; failed/passed historical examples inspected | Expand representative session audit, including author questioning and resume failures |
| Research effective practice | Sources above with limitations and explicit design inferences | Complete outstanding full-text checks; turn disputed implications into tests |
| Human-approved references | Draft conversations beside this report | User review and revision; no judge calibration before approval |
| Clear instruction ownership | Proposed responsibility table | Small tested prompt/template changes after reference review |
| Learner evidence and continuity | Existing context/persistence gap identified | Minimal implementation justified by resume and next-lesson tests |
| Improved teaching | No claim yet | Fixed-case paired results, human preference, held-out checks |
| Full-chain acceptance | Historical infrastructure baselines preserved | Two fresh runs under the revised, approved design and agreed usage cap |
| Inspectable results | Local evidence index and source paths | Selected run import once dashboard destination is chosen |

Do not mark this goal complete because a document exists or old evals passed.
The acceptance condition is an approved and demonstrated improvement in the
learner experience, with the implementation and limits recorded.

## 9. Second-pass findings: authoring and memory

### What the successful authoring runs actually exercise

The first request in both `0aeNzG` and `zBfs82` explicitly supplies the language,
learner prerequisites, first topic, empty-input boundary, desired files, and
permission to create the first lesson. The second supplies the next topic and
several boundaries. This is a useful authoring task, but not a test of discovery
from “I want to learn programming.” Neither captured pair of author turns calls
the structured author-question tool. Their success therefore does not establish
that Kyoshi avoids an interrogation when important context is missing.

The first author turn used 17 shell calls in `0aeNzG` and 18 in `zBfs82`;
the second used 6 and 7. Commands included setup, file inspection, and local
verification. Tool count alone does not imply poor teaching. The actionable
issue is redundant discovery and whether tool outputs displace the author's
conversation. For example, `0aeNzG` reads `.dojo/evaluated-instructions.md`, an
evaluation artifact exposing its own assembled instructions. That is not proof
of judge-rubric leakage, but it is an avoidable difference from normal authoring
and consumes context. Keep capture artifacts outside the agent-visible course.

### Instruction delivery is covered; knowledge retention is not

The free run of `instructions.test.ts`, `service-state.test.ts`,
`authoring-handoff.test.ts`, and `codex-client.test.ts` passed 65 tests on
2026-10-17. Their scope matters:

| Existing check | What it proves | What remains unproved |
| --- | --- | --- |
| Instruction assembly matches source contracts | The selected course/style/lesson text reaches the constructed prompt | The teacher interprets it usefully |
| Next lesson excludes old SENSEI content | Lesson isolation | Useful prior learning evidence is retained |
| Same-thread restore and retry | Session identity and transcript replay behavior with mocked transport | A real model retains the learner's unresolved misconception |
| Native compact-provider fixtures | Checkpoint delegation and message handling | Pedagogical content of a real compacted summary |
| Completed lesson context | IDs, titles, and summaries of completion reach the next lesson | Skills mastered, assistance used, or a correct understanding |
| Before/after learner-file comparison | Final source is unchanged by a teacher turn | No transient edit-and-revert occurred inside the turn |

`codex-client.ts:checkpoint()` sends `/compact`. The completion path can skip
that checkpoint, and a new lesson has a separate native thread. Even a perfect
summary inside the old thread would not by itself provide a learning summary to
the next one. Do not add a second chat history to solve this; add a narrowly
scoped, source-backed handoff only where the current context loses necessary
information.

### The trial driver constrains which teaching interactions can succeed

The elicitation handler in `authoring-handoff.ts` searches every question's
options for Review, then Move on or Pause. A legitimate mid-lesson choice such
as “try first / explain the callback” is not supported by that simulated answer
logic. It throws “Unexpected learner question” instead. That is a limitation of
the test participant, not evidence that a useful teaching choice is invalid.

Keep a completion-choice handler for the deterministic lifecycle test. For
interactive teaching tests, the learner must answer the actual question, with
bounded behavior and no hidden rubric. Unsupported fixture interactions need a
distinct result from a teaching failure. A teacher must not be pressured into
avoiding legitimate UI tools just to satisfy our simulator.

## 10. What educational benchmarks can and cannot supply

- [MathTutorBench](https://github.com/eth-lre/mathtutorbench) separates expertise,
  student understanding, and pedagogical response quality. Its scaffolding
  configuration limits the next response to two sentences and compares against
  teacher references with a reward model. This is useful task decomposition,
  not a sentence limit or grader to copy into coding lessons. A next-turn score
  does not validate a whole conversation or lasting learning.
- [MathDial](https://github.com/eth-nlped/mathdial) records teacher descriptions
  of confusion and distinguishes successful resolution from success where the
  teacher revealed the answer. The learner side is simulated. Borrow the
  separation between outcome and disclosure, not a claim of human acquisition.
  Its CC BY-SA dataset is not copied into our project fixtures here.
- [MRBench](https://arxiv.org/abs/2412.09416) separates mistake detection/location,
  guidance, actionability, coherence, tone, answer disclosure, and human-likeness.
  Its task assumes a learner mistake. Our tests also need correct attempts,
  exploratory questions, and a learner who wants time or independence; otherwise
  every interaction becomes remediation. “Sounds human” is not sufficient for
  good or honest teaching.
- [Simulated Students in Tutoring Dialogues](https://people.umass.edu/~andrewlan/papers/26acl-studentsim.pdf)
  evaluates simulation realism, rather than assuming a prompted learner is
  realistic. It finds important weaknesses in prompting-based simulators and
  limits its claims to its studied math dataset. It reinforces the need to test
  our learner model separately, not to fine-tune a simulator before establishing
  useful baseline cases.

These are research/implementation sources, not models we have installed or run.
No benchmark's reported scores transfer to our coding domain without validation.

## 11. First controlled change

The user approved the reference direction and boundaries and authorized up to
12 short teaching calls plus two judge calls. At their request both judge calls
use Codex; that is independent execution, not independent model-family bias.

Candidate one changes only the shared DOJOFOO/KATAS guidance. It removes the
mandatory hook-and-first-question behavior, distinguishes visible from read,
allows contextual explanations, and stops forcing a quiz after explanation.
The authored course and SENSEI remain unchanged. This deliberately does not
claim to have fixed Kyoshi yet; it isolates one causal hypothesis.

The comparison uses five fixed learner states, each once with the committed
baseline policy and once with the candidate: arrival, reading, unknown callback,
missing return, and independent practice. Two Codex
judges receive blinded A/B labels in counterbalanced order. They can choose a
tie or neither, and must cite evidence. Native CLI/login is used for these
prompt probes; this is not a substitute for the later production-ACP trial.

No case forces a generated learner to improve. Losses, ties, and infrastructure
errors are retained. The five cases test response selection, not coverage of all
teaching stages, student acquisition, or long-term retention. The source
`teaching-comparison.live.test.ts` keeps the call cap and stores prompts, model,
effort, raw events, visible responses, and judge results in its reported output
directory. It is opt-in and does not run during ordinary tests.

The first launch timed out before producing a response because its stdin pipe
was left open. The failure is retained separately and a free subprocess test now
covers input closure. To stay within the approved call allowance, the later-lesson
case was omitted from this batch rather than silently spending additional calls.

The combined shared policy changes from 753 to 764 words in this first candidate.
This is not yet a prompt-size optimization. It is a small, attributable test of
reading time and relevance before attempting broader compression.

## 12. Learner-evidence implementation criteria

The next implementation should demonstrate a useful handoff, not merely add
profile fields. These examples define the intended behavior before choosing
storage or another agent tool:

| Source event | Supported claim | Unsupported conclusion |
| --- | --- | --- |
| Learner says “I don't understand callbacks” | Explicit uncertainty about callbacks at that turn | Does not understand functions or cannot program |
| Teacher explains block-body returns | This explanation has already been supplied | The learner now understands return values |
| Learner predicts a new callback's returned value and explains why | One demonstrated application, with the help level recorded | General mastery or long-term retention |
| Tests pass after a hint | This code version passes these checks after that help | Independent solution or unaided transfer |
| Learner chooses Move on | Preference to continue | Proof of conceptual readiness |
| A later statement contradicts an earlier summary | Reconsider the specific knowledge claim | Diagnose attention, motivation, or ability |
| Repeated Check without code changes | Same evidence was requested again | Frustration, refusal to learn, or failure to read |

Necessary consumers are concrete:

- A resumed Sensei sees the unresolved question and the last explanation so it
  does not start that same explanation again as though it were new.
- A next-lesson Sensei receives relevant prior observations, not the whole old
  conversation or a bare “completed” flag.
- When the learner corrects an inference, subsequent teaching uses the
  correction. The old inference must not keep resurfacing as established fact.
- Unsupported or expired source references remain visibly uncertain; they do
  not silently become durable facts.

Start with the existing course progress boundary and native session history.
Measure how much needed evidence is lost at a switch before adding storage.
If a compact handoff is required, store the smallest bounded set of observations
and source pointers, not a second transcript or an accumulating biography. Do
not put progress into the authored DOJO.md or SENSEI.md.

An extraction prompt or agent-written note is itself fallible. Its validation
must include false-positive examples: a teacher statement misattributed to the
learner, a copied solution interpreted as mastery, a successful guess, unrelated
personal data, and a disagreement with the summary. Source existence is
deterministically checkable; whether it supports a conceptual claim still needs
review. No percentage mastery score is justified at this stage.

## 13. Coverage corrections after the bounded comparison

The first live comparison is complete; see `comparison-results.md`. Its mixed
result is not an acceptance pass. No further model calls were made while making
the following deterministic evaluation changes.

- `runAuthoringHandoff` now distinguishes `seed-completion` (the existing
  per-lesson check) from `teach` (observe both lesson dialogues). The opt-in live
  two-lesson test explicitly uses `teach`; ordinary per-lesson evaluation retains
  its smaller scope and cost.
- `readTeachingEvidence` verifies the requested coverage rather than accepting
  a marker alone. A full chain requires the requested lesson order, distinct
  sessions, no fast-forwarded lessons, and every required teaching stage for
  each lesson. Missing stages, duplicate sessions, reversed order, and seeded
  completion cannot pass as a full teaching chain.
- Material and teaching judge inputs state which lessons are actually taught.
  Seeded completion is no longer described as observed learning.
- The synthetic learner can receive a normal structured teaching question via
  an explicit `respondToQuestion` callback, separately from completion choices.
  Its inputs are the public dialogue, current learner code, and actual questions;
  no SENSEI instructions, solutions, or judge rubric are supplied by this hook.
  Selections and free-text answers are retained in evidence. Invalid answers or
  an unconfigured responder abort the suspended turn as an evaluation problem,
  not an invented learner response or a teaching verdict.

Verification: 58 UI tests and 32 authoring evaluation tests pass; the two paid
live tests remain skipped. Both package type checks pass. These include mocked
transport/lifecycle tests, not proof of live cross-harness behavior. The existing
CLI still uses its configured review responder only; wiring a budgeted model
responder for ordinary teaching questions is outstanding. So are live full-chain
runs, learner-profile continuity, and human approval of the candidate outputs.

## 14. Remove the template-format gate, not the quality gate

The shipped preflight previously extracted mandatory headings and bold labels
from SENSEI.tmpl. It rejected notes missing `Start`, `Hook`, `First move`,
`Review`, or `Predict`, even if the material covered the same concepts well.
That made the “material, not a script” instruction internally inconsistent.

The authoring candidate now uses concept-focused reference sections. Its
template is 111 words instead of 182; the exact hashes are in evidence.json.
Kata guidance permits adapting headings and uses the actual task when the
author has not supplied a meaningful setting, rather than inventing a hook.

Preflight no longer extracts or enforces headings. It still checks nonempty
guidance, unfinished placeholders, the existing word budget, and the presence
of executable test declarations. These are file-level checks, not a teaching
score. Existing course files do not need migration, and empty guidance is not
accepted. Semantic completeness and teaching quality still require evaluation;
no claim is made that any arbitrary paragraph is adequate teaching material.

Verification: 77 selected authoring tests passed; three paid calibration cases
were skipped, and the authoring package type check passed. This includes the
host path refusing placeholders without consuming an attempt and accepting
free-form notes without requiring a dialogue structure. No new live authoring
or teaching calls have tested this candidate. It remains provisional pending
the approved reference boundaries, blind human feedback, and a bounded
Kyoshi-to-Sensei comparison—not a successful final redesign.

## 15. Connect the learner responder to teaching questions

The CLI evaluation worker now supplies the teaching-question responder added
in section 13. It uses the same explicitly selected learner harness/model as
review replies. No new provider, agent protocol, or API key is introduced.
The existing isolated, tool-disabled HarnessAgent receives the public dialogue,
current learner code and actual question form. A validated JSON answer maps
question IDs to option titles or permitted free text. Wrong IDs, missing answers,
invented options and invalid output fail without a retry or fallback model.

The handoff transcript retains question/answer exchanges for later simulated
replies; previously it retained only ordinary text. A regression verifies their
order and that streamed assistant text is not duplicated. Four automatically
answered teaching forms per lesson is an explicit cost ceiling, recorded in
evidence. Exhausting it is an evaluation limitation, not a negative teaching
judgment. Review continuation keeps its existing separate bound.

Verification: 14 learner-response tests, 27 handoff tests and 11 CLI worker smoke
tests passed. The worker was built in an ignored node_modules cache directory,
not over the current running server build. Authoring and UI type checks passed.
Tests use mocked generation or fail before inference; no new paid run occurred.
This proves the connection and validation, not that a simulated learner's
answers accurately represent human understanding. That limitation remains.

## 16. A source-grounded continuity layer

Production lesson context now includes bounded historical excerpts from public
chat. The existing `.dojo/web.json` retains up to eight excerpts per visited
lesson; the current prompt receives up to four from this lesson and four from
the nearest completed earlier lesson. This is not another full transcript store.
It uses the existing native-history projection and needs no model call or database.

Every excerpt retains its speaker, lesson, session, projected message ID, and
SHA-256 of the complete message at capture. Long text is marked truncated.
Projected message IDs are not native ACP event IDs and may change on replay;
the hash identifies the captured text rather than promising a permanent native
lookup. The visible excerpt remains inspectable even when a resumed native
history is empty. No assertion of current mastery is generated from it.

The code excludes reasoning and tool-result parts. Stream updates replace the
same message rather than storing repeated partial copies. Source excerpts stay
in the workspace/course that produced them. Evidence writes reread current
state after awaiting history so a concurrently saved check is not overwritten.
Moving on captures already received history without restarting the old harness.

Tests cover replay deduplication, bounded/truncated data, a fresh session with
empty history, correct speaker attribution, workspace isolation, concurrent
state preservation, and inclusion in the actual next-lesson prompt resource.
The protocol formatter preserves the evidence without adding knowledge claims.
These are deterministic tests, not a live compaction or learning-quality result.

This is the source layer for learner awareness, not the complete learner model.
It does not yet label demonstrated understanding, distinguish a misconception
from uncertainty, prioritize relevant old evidence across a long course, or
test whether a teacher acts on a correction appropriately. Those require the
remaining observation design and full-chain behavioral evaluation. The current
shared teacher-policy candidate explicitly treats quotes and prior help as
historical evidence, not proof of mastery; that change is not yet live-evaluated.

## 17. Broader verification and next comparison

The complete UI test run reports 322 passing tests, three skipped tests and five
failures. The failures are in the untouched icon-source and chat-renderer tests
(Lucide import in CopyButton, render order, old timeline markup/duration, and
synchronous fragment-render expectations). The tested files and implementation
paths show no local diff from HEAD. They are retained as failures, not folded
into the teaching results or repaired by changing expected output here.

The complete authoring test run includes local native-harness/loopback-model
tests and was still running at this update. Its process was verified alive;
no duplicate run was started. The focused teaching-comparison tests pass with
the paid case skipped.

A sixth comparison case is prepared, not executed: a resumed learner whose
historical uncertainty has been followed by explanation and a request to try
independently. Both prompt variants receive the same production-formatted
source evidence. Judges receive that evidence too; no current mastery is assumed.
Future runs archive the runner source and full instruction hashes alongside the
existing prompts, responses and events. This raises the batch to 12 teacher
calls plus two judges, for which renewed permission has been requested.

The production-handoff recorder now also saves `contextBeforeTurn`, built by
the production context formatter from the snapshot immediately before each
turn. This lets reviewers inspect what historical evidence was available,
without inferring it from the reply. It is a pre-turn snapshot, not a claim to
capture every later tool response. Fifty targeted handoff/context tests and
the UI type check passed after this addition. The historical acceptance README
now explicitly distinguishes its seeded-completion trials from an observed
two-lesson teaching chain.

## 18. Terminal broad-suite result

The authoring suite completed: 217 passed, 30 skipped, two failed in
`eve/runtime-turn.test.ts`. Grok timed out. FX failed before model inference:
the installed `@ai-sdk/harness-fx` maps `allow-all` to ACP session mode `code`,
but the installed FX CLI advertises `auto`, `ask`, and `full-access`. Its public
`FxHarnessSettings` does not expose the underlying ACP permission mapping.
These are infrastructure failures, not teaching or material verdicts. The
local loopback tests made no new paid evaluation calls.

This was verified against installed adapter source/types and FX's
[documented permission modes](https://fx.sh/docs/configure-fx/configuration).
The [current adapter documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/fx)
describes a different libfx-backed implementation and no native subscription
credential discovery. A blind package upgrade would therefore change more than
the failing mode name. No dependency upgrade, credential change, or custom
bootstrap patch was made in this investigation. Codex evaluation does not
depend on this FX path; multi-harness reliability remains unproven.

## 19. Source-backed learner interpretations

`dojo_learner_observe` now uses the existing lesson MCP server and run
capability. There is no new transport or database. The server saves bounded
course-scoped notes in the existing web state and returns them through the
ordinary lesson context. Categories cover uncertainty, understanding,
misconception, support and transfer; every note is explicitly an interpretation,
with its quoted source alongside it, not a mastery score.

The server verifies that the cited session/message/hash exists in this course's
retained evidence. Support requires a teacher message; other categories require
a learner message, so a teacher explanation cannot be presented as demonstrated
learner understanding. This verifies provenance, **not** the interpretation's
semantic correctness. A learner saying “I understand” is still only that statement,
not evidence of successful transfer. Live evaluation must test this distinction.

`replaces` corrects a prior note using new evidence. Active/resolved status is
visible to the next teacher; the old interpretation is not also left active.
The new note copies the small source excerpt, so trimming raw history does not
silently detach its evidence. Storage is capped at 24 notes per course. Supplied
tool instructions call for meaningful changes, not a note after every turn.

Verification: 52 targeted UI/runtime/source tests, three MCP tests and four
protocol tests passed; UI and CLI type checks passed. Tests cover runtime binding
and shutdown, source/speaker rejection, deduplication, corrections in subsequent
lesson context, and workspace separation. The source implementation and request
validation are exercised; there is still no paid/live proof of model use or
judgment quality. These notes complete an initial functional profile path, not
the goal's behavioral acceptance gate.

## 20. Packaged MCP round-trip verification

`packages/cli/test/learner-notes.integration.test.ts` now starts the packaged
stdio MCP server and uses the official MCP client against the real run route
and lesson services. A valid synthetic course supplies the retained source;
no coding harness or model runs. The test discovers the tool, saves a grounded
note, reads it through `dojo_context`, and verifies that a forged citation is
rejected without changing saved state. This closes the gap left by mocked
registration tests. Four targeted CLI tests pass, including this round trip.

The fixture initially lacked required manifest fields, then omitted the empty
argument object required by this tool schema. Those were corrected in the test,
not worked around in production. The server correctly reported both failures.
The build used an ignored node_modules cache directory, leaving the running
server's bundle unchanged.

Tool-use guidance for observations now lives in the shipped generic Dojofoo
skill, not duplicated in the shared teaching policy. Skill validation passes;
this establishes syntax/metadata validity, not reliable model use. Human
preference review, renewed paid-run approval, held-out behavioral calibration,
and two fresh end-to-end runs remain outstanding. Further prompt changes should
follow that evidence rather than more unvalidated instruction accumulation.
