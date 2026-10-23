# Dependency compatibility

Upgrade status and baseline results live in
[`docs/architecture/dependency-upgrade-ledger.md`](../docs/architecture/dependency-upgrade-ledger.md).
The two patches here and three assembled into `@dojofoo/agent` are independent
compatibility changes. Passing tests against an old release does not justify
removing them from a new one.

## Chat queue during questions

`@tanstack/ai-client@0.39.3` rejects normal messages before applying its queue
policy when an interrupt is pending. Its drain also starts queued messages while
the question still owns the next turn. The patch applies the configured queue
policy and holds that same native queue until the interrupt is resolved. It does
not answer or dismiss the question. Remove it when upstream supports this case.

Browser regression: `packages/ui/e2e/eve-authoring.spec.ts`, “keeps a pending
question while queuing messages through its continuation”. It verifies both
waiting for an answer and accepting messages during the resumed stream.

## OpenCode adapter compatibility

`@ai-sdk/harness-opencode@1.0.155` creates legacy OpenCode sessions but calls the
v2 `switchModel` endpoint before every turn. That endpoint uses a different
session store and can fail with a foreign-key constraint before inference.

The patch removes that call and supplies `model: { providerID, modelID }` to the
existing legacy prompt API. Initial selection and subsequent model changes use
the same session and API; native defaults remain untouched when no model is set.
Compaction already supplies its model to the legacy summarize API.

Regression coverage: `packages/authoring/src/eve/opencode-model.test.ts`.
This is a dependency patch, not a replacement harness. Authoring bundles the
tested adapter and its bridge assets so npm consumers receive the same fix;
the packed-install smoke verifies model selection against that shipped bridge.
Remove it when
the upstream adapter consistently uses a compatible session/model API. The
published 1.0.155 bridge still mixes these APIs; the rebased patch's model
selection regression passes against that installed bridge.

## Bundled Eve patches (0.80.1)

Consumers do not apply these patches. `packages/agent/scripts/build-runtime.mjs`
checks the upstream tarball integrity, applies them while assembling the package,
and ships the resulting runtime with Eve's notices.

| Patch in `packages/agent/patches` | Purpose | Offline regression |
| --- | --- | --- |
| `eve@0.80.1.patch` | Delegate compaction to ready providers; retain dynamic provider identity | `experiments/model-provider/provider.test.mjs` and host fixtures |
| `eve-native-turn@0.80.1.patch` | Honor a native provider's completed turn and context-token accounting | Provider/host continuation and compaction fixtures |
| `eve-distribution@0.80.1.patch` | Resolve packaged modules, project root and workflow identity; retain the development-server export; guard incompatible history | `experiments/model-provider/exports.test.mjs`, `local-history.test.mjs`, authored/host fixtures, `packaging.mjs` |

Web-search routing now uses Eve's upstream model-profile implementation. Its
previous patch was removed after the capability regression passed. The other
behaviors remain patched and tested against the exact published artifact.

The native-compaction extension includes an optional `experimental_canCompact`
readiness check. When a host tool turn is paused, Eve must defer without replacing
history or emitting a completed compaction. The provider test covers this state
boundary as well as ordinary and native compaction.

The Workflow dependency in Eve 0.80.1 deletes the flat storage layout shipped
with Eve 0.53.0. The distribution guard moves that known layout intact to
`.eve/legacy-workflow-data` before starting the new World. Reads use the current
Workflow reader/serializer without running old workflow code. Unknown layouts
and existing-archive collisions fail closed; course files and credentials are
not modified. See the upgrade ledger for the browser read-only/new-conversation
checks and byte-preservation fixture.

## Upstream tracking

No upstream issue or PR has been filed for the OpenCode or TanStack fixes yet.
Local reports and regression details are prepared in [`upstream/`](./upstream/README.md).
Publishing those reports requires explicit authorization; do not
mislabel Dojofoo PR #162 as an upstream TanStack fix.
