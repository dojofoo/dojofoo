# Dojofoo evaluations

This package runs teaching scenarios through AI SDK `HarnessAgent`. It is
separate from the production lesson server so prompt experiments cannot change
live behavior accidentally.

The Kyoshi benchmark starts from the blank authoring scaffold and asks a real
harness to produce one complete kata lesson. It scores manifest validity,
course/lesson separation, checks, learner-persona eval coverage, solution
withholding, and the visible authoring handoff:
It then simulates a human editing learner material in the UI and verifies that
Kyoshi reads the changed file before advising without exposing transport context.

```sh
DOJOFOO_EVAL_HARNESS=codex pnpm --filter @dojofoo/evals eval:authoring
```

The first scenario assembles:

1. the internal lesson-runtime `DOJOFOO.md` platform contract (`packages/authoring/src/sensei/contracts/`);
2. the starter course's `DOJO.md`;
3. lesson 002's `SENSEI.md`;
4. the generic Dojofoo skill;
5. a fresh in-memory lesson workspace.

Run it with:

```sh
pnpm --filter @dojofoo/evals eval:introduction
```

To run the same scenario through the locally authenticated OpenCode harness:

```sh
pnpm --filter @dojofoo/evals eval:introduction:opencode
```

The OpenCode runner creates and removes a disposable workspace and reuses the
local OpenCode provider login. It shares the scenario and assertions with the
HarnessAgent runner; only the execution adapter differs.

By default it gates the complete production stack. Set `DOJOFOO_EVAL_ABLATION=1`
to compare lesson only, lesson plus skill, platform plus lesson and skill,
course plus lesson and skill, and the complete stack. Run one cell with
`DOJOFOO_EVAL_VARIANT`, for example:

```sh
DOJOFOO_EVAL_VARIANT=lesson+skill pnpm --filter @dojofoo/evals eval:introduction:opencode
```

The official Pi harness resolves credentials from its own agent directory or
provider environment variables. It does not reuse a Codex or OpenCode login.
Use `DOJOFOO_EVAL_MODEL` to select a configured model, or
`DOJOFOO_EVAL_PI_AGENT_DIR` to point at an existing Pi agent configuration.

The result is JSON containing the visible response, semantic tool calls, and
deterministic assertions. Tool activity is recorded rather than treated as a
failure: whether reading or checking was pedagogically appropriate belongs to
the scenario's quality evaluation. Private reasoning and UI labels such as
“Worked” are not scored.

The kata capability scenario evaluates whether the teacher inspects the
learner's current solution, retrieves authoritative documentation, teaches the
missing API without editing the file or exposing the completed expression, and
keeps the response focused:

```sh
pnpm --filter @dojofoo/evals eval:transformation
```

The scenario uses the harness's normal file-reading and web-fetching tools.
Dojofoo contributes only the same lesson capabilities registered in production.

The lifecycle matrix evaluates fresh introduction, adapting to a novice API gap,
repeated failure requiring an authored fragment, successful completion, substantive
review, and resume from server-supplied compacted context:

```sh
pnpm --filter @dojofoo/evals eval:lifecycle
```

Use `DOJOFOO_EVAL_STAGE=start|novice|stuck|complete|review|resume` to run one stage.

Run the high-signal lifecycle stages and documented-source scenario across a
strong, average, and deliberately weaker OpenCode Go model:

```sh
pnpm --filter @dojofoo/evals eval:matrix
```

Override the matrix with comma-separated `DOJOFOO_EVAL_MODELS` or
`DOJOFOO_EVAL_STAGES`. Every cell receives a fresh harness process and temporary
workspace.

The model matrix is deliberately opt-in because it can be slow and expensive.
Do not use it as the routine development gate.

## Full-course harness matrix

The contract matrix drives the complete three-lesson starter lifecycle through
every supported harness identity. It verifies introduction, an initial failing
check, a passing solution, completion, reload, and progression without invoking
a model:

```sh
pnpm --filter @dojofoo/evals eval:course:contract
```

An authenticated ACP smoke matrix reuses the same journey. It is doubly gated
so an ordinary test run cannot spend model credits:

```sh
DOJOFOO_LIVE_HARNESS_MATRIX=1 \
DOJOFOO_LIVE_HARNESSES=codex,opencode \
pnpm --filter @dojofoo/evals eval:course:live
```

Select only the harnesses you intend to pay for. Pi runs through the official
`HarnessAgent`; the other harnesses run through the same ACP client as the local
Dojofoo UI.
