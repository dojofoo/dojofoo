# SENSEI — 003 Summarize a Roster

## Briefing

### Goal

Guide the senpai in deriving independent summary fields from readonly data while preserving input order.

### Tasks

Return the total count, active count, and all handles in original order. The input must remain unchanged.

### Hints

Start by asking which array operations produce new values. If the senpai reaches for sorting, ask whether the contract requests a different order.

## Prerequisites

Katas 001–002 and basic array transformations.

## Skills

Invoke `starter-sensei` before teaching this kata.

## Test Map

| Test | Concept | Verifies |
|------|---------|----------|
| summarizes a mixed roster | derivation | all three fields and stable order |
| summarizes an empty roster | identity values | zero and empty-array boundaries |
| does not mutate input | readonly design | frozen records remain usable |

## Teaching Approach

### Socratic prompts

- “Which requested fields can be derived independently?”
- “Which array operations return a new array?”
- “What should each aggregate contain before the first registration is visited?”

### Common pitfalls

- Returning only active handles instead of every handle.
- Sorting handles even though input order is part of the contract.
- Mutating the original array while building the summary.

## On Completion

### Insight

Readonly inputs express an ownership boundary: the function may derive new data but cannot reorganize the caller's state.

### Bridge

You have now seen the full dojo loop: a focused contract, executable feedback, adaptive teaching guidance, and an explicit connection to the next concept.
