# 001 — Normalize a handle

## Goal

Implement one pure function that turns a display name into the canonical handle used by the dojo.

## Tasks

Implement `normalizeHandle(input)` so it:

1. Removes whitespace from the beginning and end.
2. Converts letters to lowercase.
3. Replaces each run of internal whitespace with one hyphen.

The empty string and whitespace-only input both normalize to an empty string. Existing punctuation, including hyphens, is otherwise left unchanged.

### Examples

```ts
normalizeHandle("  Ada Lovelace  "); // "ada-lovelace"
normalizeHandle("Grace\t Hopper");  // "grace-hopper"
```
