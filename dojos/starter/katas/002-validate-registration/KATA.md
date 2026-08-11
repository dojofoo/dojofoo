# 002 — Validate a registration

## Goal

Use a discriminated union to make every validation outcome explicit and safe to narrow in TypeScript.

## Tasks

Implement `validateRegistration(input)` using the exported `RegistrationResult` type.

1. Normalize the input with the same rules as kata 001.
2. Return `{ ok: false, reason: "empty" }` when the normalized handle is empty.
3. Return `{ ok: false, reason: "too-short" }` when it contains fewer than three characters.
4. Otherwise return `{ ok: true, handle }` with the normalized handle.

The length rule applies after normalization.
