# Antigravity as a coding agent for Sensei and Kyoshi

*   **Author:** tomsiwik
*   **Status:** Brief
*   **Date:** 2026-11-03

Follows from `docs/designs/agent-runtime.md`, decision D23: Antigravity is designed here, and the registry offers it only once it passes conformance (D1, D24).

## Problem

Every coding agent must run both Sensei and Kyoshi. Antigravity (`agy`) runs neither. There is no AI SDK harness adapter for it, so Eve can't start it the way it starts Codex, OpenCode or Pi.

`agy` 1.3.4 is not a one-shot CLI. These options were checked with `agy --help`, `agy mcp --help` and `agy models` on 2026-11-01:

*   `agy mcp add|list|enable` configures MCP servers.
*   `--conversation <id>` continues an earlier conversation.
*   `--input-format stream-json` keeps one process open and reads one turn per line.
*   `--mode plan|accept-edits` chooses how edits are handled. Without `--dangerously-skip-permissions`, it asks for permission.
*   `agy models` lists the models.

## Goals

*   Write one `HarnessV1` adapter for `agy`, shaped like the local Cursor wrapper (`packages/authoring/src/eve/local-cursor.ts`). It covers starting a turn, streaming its output, cancelling, resuming a conversation by id, and choosing a model.
*   Prevent Sensei from writing (D18). Sensei's turns run without write or shell tools, or with every write denied automatically. The learner never sees a permission prompt.
*   Give Kyoshi the full tool set, with no permission prompts either.
*   Pass the conformance cases in `agent-runtime.md` for both personas, then add the `agy` row to the registry.

## Open questions

*   Does print mode load the MCP servers that `agy mcp` configured, or does each run need its own MCP configuration? Sensei's and Kyoshi's tools reach the agent over MCP. Unverified.
*   How does `agy` ask for permission when it has no terminal? Does `--mode plan` deny writes without asking, and can a single tool be turned off? Unverified.
*   Can `--conversation <id>` resume a conversation after `agy` restarts, the way Eve's re-drive on resume expects? Unverified.
*   Can conformance run without a login (tier A, against a loopback model), or only with one (tier B)? Unverified.

## Next step

A spike against the installed `agy` that answers the four questions with commands and their output. The adapter design is written after the spike.
