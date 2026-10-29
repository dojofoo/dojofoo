# Prepared upstream reports

These are local contribution drafts, not published issues or PRs.

## OpenCode: keep model selection on the session API that created the session

- Affected artifact: `@ai-sdk/harness-opencode@1.0.169`.
- The bridge creates/restores a legacy session, then calls
  `client.v2.session.switchModel` against a different session store.
  This can fail before inference with a missing-session/foreign-key error.
- Proposed fix: remove the v2 switch and pass
  `model: { providerID, modelID }` to the existing legacy prompt call.
  Leave the model absent when using native defaults; compaction already supplies
  its model to the legacy summarize API.
- Source patch: [harness-opencode-legacy-model.patch](./harness-opencode-legacy-model.patch).
  Paths are relative to the published adapter package, not the monorepo root.
- Regression: `packages/authoring/src/eve/native-harness-contract.test.ts`.
  The OpenCode case checks initial and changed models through the
  native OpenCode agent, including retained conversation history and session ID.
- Packaged bridge patch:
  [../@ai-sdk__harness-opencode@1.0.169.patch](../@ai-sdk__harness-opencode@1.0.169.patch).

## TanStack: preserve queued input while an interrupt owns the turn

- Affected artifact: `@tanstack/ai-client@0.39.3`.
- `sendMessage` throws before consulting queue policy when an interrupt is
  pending. Queue draining also ignores pending interrupts.
- Proposed fix: apply queue/drop policy before rejecting incompatible sends;
  preserve merged body options; hold draining until interrupts are resolved.
  Do not answer, dismiss, or replace the pending question.
- Prepared source and distribution patch:
  [../@tanstack__ai-client@0.39.3.patch](../@tanstack__ai-client@0.39.3.patch).
- Upstream issue draft: a failed answer submission also clears queued notes in
  0.39.3 and 1.0.0. Keep those notes until an explicit retry succeeds. Normal
  failed sends, stop and abort still clear the queue; an error never auto-drains it.
- Regressions: `packages/authoring/src/eve/chat-queue.test.ts` checks queue/drop,
  failed answer then successful retry with ordered notes, stop and in-flight abort.
  `packages/ui/e2e/agent-chat.spec.ts` covers the same answer retry through the
  versioned API and rendered composer. Both use local fixtures without model calls.
- This is a local upstream report and patch, not an upstream-accepted fix or a
  published GitHub issue.
