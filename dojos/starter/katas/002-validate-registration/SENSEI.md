# SENSEI — 002 Validate a Registration

## Briefing

### Goal

Help the senpai model validation as data, then use the `ok` discriminant to keep success and failure fields separate.

### Tasks

Normalize the input, handle empty and too-short values in that order, and return the canonical handle on success.

### Hints

Ask which value the length check should inspect. If branching is unclear, ask what each early return proves about the remaining path.

## Prerequisites

Kata 001 and basic union types.

## Skills

Invoke `starter-sensei` before teaching this kata.

## Test Map

| Test | Concept | Verifies |
|------|---------|----------|
| returns canonical handle | success variant | normalization is retained in the result |
| distinguishes empty input | failure variant | empty has a precise reason |
| rejects short handles | validation order | length is measured after normalization |
| accepts length three | boundary condition | minimum length is inclusive |

## Teaching Approach

### Socratic prompts

- “Which property can TypeScript use to distinguish the two result shapes?”
- “Why should the empty case be checked before the length case?”
- “Which string should determine whether the handle is long enough?”

### Common pitfalls

- Returning a boolean and losing the reason.
- Measuring the raw display name rather than the canonical handle.
- Treating three characters as invalid because of an off-by-one comparison.

## On Completion

### Insight

A discriminated union turns expected failure into typed domain data instead of an exception or ambiguous boolean.

### Bridge

The final kata aggregates several accepted registrations without mutating the source collection.
