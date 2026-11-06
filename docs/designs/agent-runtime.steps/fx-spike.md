# FX spike (step 3)

*   **For:** the design's "Model selection" FX row ("its adapter's own discovery; if none, the CLI's model flag values (unverified, settled in step 3)").
*   **Date:** 2026-11-04, on the step 3 machine (macOS, darwin-arm64).

## Facts

*   FX on Eve is not the FX CLI. `@ai-sdk/harness-fx` 1.0.83 runs `libfx` 0.0.14 in-process, and its `getSandboxTemplate()` returns nothing, so no CLI is bootstrapped. The FX CLI on this machine is 0.0.16.
*   `fx models --json` (FX 0.0.16) prints the active provider's models: `{"kind":"models","count":8,…,"ids":[…],"models":[{"id":"gpt-6.1-sol","source":"Codex subscription"},…]}`.
*   `libfx` 0.0.14 exports `listModels({ apiKey, fetch? }): Promise<string[]>`, but only for the AI Gateway catalog (`types/libfx.d.cts:79-85,1058`).
*   `@ai-sdk/harness-fx` 1.0.83 has no model listing.
*   The adapter uses the CLI's own provider stores (`src/fx-subscription.ts`: gateway, Codex or Grok), so the CLI's active provider is also the one Eve's FX runs on.

## Decision

Model discovery runs the installed CLI's `fx models --json` (`fxModels` in `packages/authoring/src/eve/models.ts`) and lists nothing when no `fx` is installed. The registry's FX row uses `modelDiscovery: { method: "native" }`, and the unused `adapter` method is removed.

A CLI that exits non-zero (for example when not signed in), times out or prints anything but that JSON makes `GET /models` answer 500, as Codex and OpenCode discovery do. The model input then shows its error state and still accepts a typed model id.

## Unverified

That an id from the CLI's list, such as a Codex-subscription id, is accepted by `libfx` 0.0.14 through the adapter. Tier B settles it.

## Isolation

FX's user-config findings stay in `sensei-isolation.md`.
