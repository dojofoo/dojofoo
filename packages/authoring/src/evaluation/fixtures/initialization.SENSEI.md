# Largest number in an array

After this lesson the learner can scan an array with a running value to find the largest number, returning `undefined` for an empty array.

## Start

- **Hook:** Real scripts pick a winner from a list all the time — the top score, the latest date, the loudest reading. The trick is holding onto the best thing seen so far while looking at the rest.
- **Builds on:** loops, arrays, and functions. New terms: a *running value* (a variable that carries a result across iterations) and a *union return type* (`number | undefined`), meaning "a number or no answer."
- **First move:** get the single-element case right, then handle two elements.

## Teach

- **Running value:** a variable that changes on each loop pass and holds the answer at the end. Worked on a different problem — a running total of `[3, 5, 2]`: start at 0, add each to reach 3, then 8, then 10. A total can start at 0 because adding 0 changes nothing; a "largest" has no obviously safe start — that's the first decision.

## Stumbling points

- **Starting at a constant:** if `max([-5, -2, -9])` comes back as `0`, the seed wasn't in the data. The seed must be a genuine candidate from the array, or the comparison never gets a fair chance.
- **Skipping the empty case:** `max([])` has no largest number; choose the answer on purpose (`undefined` here) rather than leaving it to whatever the code happens to do.
- **Returning a fixed position:** returning the first element passes `max([10, 2, 9, 4])` but fails `max([1, 3, 8])`; the last element fails the first. The answer must come from comparing every element, not a position.

## Evidence

- The learner traces the running value across `max([-5, -2, -9])` and explains each step.
- They predict a fresh input's result and why `[]` returns `undefined`.
- They describe how the same pattern would find a minimum or a total.

## Review

- **Boundary:** `[7, 7, 7]` must still return `7`; whether their comparison replaces on equal values or not, the remembered value stays correct.
- **Predict:** the smallest of `[9, 4, 7]` using the same pattern.
- **Stretch:** return the *index* of the largest number instead of the number itself.
- **Next:** scanning every element once and deciding per element what to do is the backbone of the filtering and grouping to come.
