# Prepared upstream reports

These are local contribution drafts, not published issues or PRs.

## OpenCode: keep model selection on the session API that created the session

- Affected artifact: `@ai-sdk/harness-opencode@1.0.155`.
- The bridge creates/restores a legacy session, then calls
  `client.v2.session.switchModel` against a different session store.
  This can fail before inference with a missing-session/foreign-key error.
- Proposed fix: remove the v2 switch and pass
  `model: { providerID, modelID }` to the existing legacy prompt call.
  Leave the model absent when using native defaults; compaction already supplies
  its model to the legacy summarize API.
- Source patch: [harness-opencode-legacy-model.patch](./harness-opencode-legacy-model.patch).
  Paths are relative to the published adapter package, not the monorepo root.
- Regression: `packages/authoring/src/eve/opencode-model.test.ts`.
  It exercises both prompt APIs, initial selection, repeated selection, changed
  models with slashes in their IDs, and an absent model; session IDs stay fixed.
- Packaged bridge patch:
  [../@ai-sdk__harness-opencode@1.0.155.patch](../@ai-sdk__harness-opencode@1.0.155.patch).

## TanStack: preserve queued input while an interrupt owns the turn

- Affected artifact: `@tanstack/ai-client@0.39.3`.
- `sendMessage` throws before consulting queue policy when an interrupt is
  pending. Queue draining also ignores pending interrupts.
- Proposed fix: apply queue/drop policy before rejecting incompatible sends;
  preserve merged body options; hold draining until interrupts are resolved.
  Do not answer, dismiss, or replace the pending question.
- Prepared source and distribution patch:
  [../@tanstack__ai-client@0.39.3.patch](../@tanstack__ai-client@0.39.3.patch).
- Browser regression:
  `packages/ui/e2e/eve-authoring.spec.ts`, “keeps a pending question while
  queuing messages through its continuation”. Uses mocked transport, no model.
- Verification: unpatched 0.39.3 fails the queue/drop regression; patched 0.39.3
  passes all three public-client contracts and both browser queue/continuation
  scenarios. Do not report the draft as upstream-accepted.
