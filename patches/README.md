# Dependency compatibility

## Chat queue during questions

`@tanstack/ai-client@0.25.1` rejects normal messages before applying its queue
policy when an interrupt is pending. Its drain also starts queued messages while
the question still owns the next turn. The patch applies the configured queue
policy and holds that same native queue until the interrupt is resolved. It does
not answer or dismiss the question. Remove it when upstream supports this case.

Browser regression: `packages/ui/e2e/eve-authoring.spec.ts`, “keeps a pending
question while queuing messages through its continuation”. It verifies both
waiting for an answer and accepting messages during the resumed stream.

## OpenCode adapter compatibility

`@ai-sdk/harness-opencode@1.0.110` creates legacy OpenCode sessions but calls the
v2 `switchModel` endpoint before every turn. That endpoint uses a different
session store and can fail with a foreign-key constraint before inference.

The patch removes that call and supplies `model: { providerID, modelID }` to the
existing legacy prompt API. Initial selection and subsequent model changes use
the same session and API; native defaults remain untouched when no model is set.
Compaction already supplies its model to the legacy summarize API.

Regression coverage: `packages/authoring/src/eve/opencode-model.test.ts`.
This is a workspace dependency patch, not a replacement harness. Remove it when
the upstream adapter consistently uses a compatible session/model API. Version
1.0.141 was inspected and still mixes these APIs.
