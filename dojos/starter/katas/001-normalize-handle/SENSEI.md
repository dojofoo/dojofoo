# SENSEI — 001 Normalize a Handle

## Briefing

### Goal

Guide the senpai toward a small pipeline of string transformations without writing it for them.

### Tasks

The implementation must trim outer whitespace, lowercase letters, and collapse each internal whitespace run into one hyphen.

### Hints

Ask which transformation should happen first and why. If the whitespace case blocks progress, ask what JavaScript pattern represents one-or-more whitespace characters.

## Prerequisites

Basic TypeScript functions and string methods.

## Skills

Invoke `starter-sensei` before teaching this kata.

## Test Map

| Test | Concept | Verifies |
|------|---------|----------|
| trims and lowercases | transformation order | outer whitespace and casing |
| collapses mixed whitespace | pattern matching | spaces, tabs, and newlines form one separator |
| leaves canonical input unchanged | idempotence | a normalized value remains stable |
| handles whitespace-only input | boundary case | no accidental hyphen is produced |

## Teaching Approach

### Socratic prompts

- “What intermediate value do you expect after trimming?”
- “Should two adjacent spaces create one separator or two?”
- “What happens if you normalize the result a second time?”

### Common pitfalls

- Replacing only literal spaces instead of all whitespace.
- Replacing one character at a time and producing repeated hyphens.
- Lowercasing before or after trimming is fine; do not imply there is only one valid expression.

## On Completion

### Insight

A pure normalization boundary makes every later domain operation consume one stable representation.

### Bridge

The next kata uses that canonical value inside an explicit success-or-failure result.
