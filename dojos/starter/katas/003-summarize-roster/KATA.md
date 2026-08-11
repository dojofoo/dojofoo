# 003 — Summarize a roster

## Goal

Derive a small report from readonly domain records without mutating the source collection.

## Tasks

Implement `summarizeRoster(registrations)` so it returns:

- `total`: the number of registrations.
- `active`: the number whose `active` field is `true`.
- `handles`: every handle in the original input order.

An empty roster produces zero counts and an empty handles array. Treat the input and its records as immutable.
