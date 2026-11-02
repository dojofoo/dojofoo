# Dependency compatibility

Upgrade status and baseline results live in
[`docs/architecture/dependency-upgrade-ledger.md`](../docs/architecture/dependency-upgrade-ledger.md).
The compatibility patches here and four assembled into `@dojofoo/agent` are independent
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

`@ai-sdk/harness-opencode@1.0.169` creates legacy OpenCode sessions but calls the
v2 `switchModel` endpoint before every turn. That endpoint uses a different
session store and can fail with a foreign-key constraint before inference.

The patch removes that call and supplies `model: { providerID, modelID }` to the
existing legacy prompt API. Initial selection and subsequent model changes use
the same session and API; native defaults remain untouched when no model is set.
Compaction already supplies its model to the legacy summarize API.

Regression coverage: `packages/authoring/src/eve/native-harness-contract.test.ts`,
the OpenCode case, checks initial and changed models through the native agent.
This is a dependency patch, not a replacement harness. Authoring bundles the
tested adapter and its bridge assets so npm consumers receive the same fix;
the packed-install smoke verifies model selection against that shipped bridge.
Remove it when
the upstream adapter consistently uses a compatible session/model API. The
published 1.0.169 bridge still mixes these APIs, so the compatibility patch remains.

## FX state folder on macOS

`@ai-sdk/harness-fx@1.0.83` creates its private state folder with
`chmod 700 -- <folder>`. GNU `chmod` accepts that; macOS `chmod` reads the `--`
after the mode as a file name and fails, so FX could not start a turn on a Mac
without GNU coreutils. The patch writes `chmod -- 700 <folder>`, which both
accept. Regression: `packages/authoring/src/eve/runtime-turn.test.ts`, the FX
case, run on macOS without coreutils. Remove it when upstream reorders the call.

## Nitro error reporting on closed output

`nitro@3.0.260903-beta` reports uncaught errors with `console.error`. When a
server's stdout and stderr are gone (the terminal that started the UI closed, or
the UI died while a Kyoshi server it started was still running), that write fails
with `EPIPE`, which is reported again, without end: the server runs at full CPU
and never handles SIGTERM. The patch drops `EPIPE` and destroyed-stream errors in
that reporter. The UI and every prepared Kyoshi server use this Nitro.

Regression: `packages/ui/src/server/nitro-close.integration.test.ts`, “stops a
production server whose stdout and stderr are gone”. Remove the hunk when
upstream stops re-reporting failed writes to closed output.

## Bundled Eve patches (1.0.0-rc.1)

Consumers do not apply these patches. `packages/agent/scripts/build-runtime.mjs`
checks the upstream tarball integrity, applies them while assembling the package,
and ships the resulting runtime with Eve's notices.

| Patch in `packages/agent/patches` | Purpose | Offline regression |
| --- | --- | --- |
| `eve@1.0.0-rc.1.patch` | Delegate compaction to ready providers instead of summarizing harness-owned history | `experiments/model-provider/provider.test.mjs` and host fixtures |
| `eve-native-turn@1.0.0-rc.1.patch` | Honor a native provider's completed turn and context-token accounting; preserve upstream sign-in parking | Provider/host continuation, sign-in parking and compaction fixtures |
| `eve-distribution@1.0.0-rc.1.patch` | Resolve packaged modules, project root and workflow identity; guard incompatible history | `experiments/model-provider/exports.test.mjs`, `local-history.test.mjs`, authored/host fixtures, `packaging.mjs` |
| `eve-managed-project@1.0.0-rc.1.patch` | Compile manifest-free `.dojo/kyoshi` and `.dojo/sensei` using the installed runtime, without project dependencies or symlinks | `experiments/model-provider/manifest-free-project.test.mjs` |

The upgrade audit removed redundant model-reference metadata and capability-type
patches. Eve's own model profiles handle provider routing; our `HarnessModel`
already declares compaction capabilities. `createDevelopmentServer` is re-exported
by our generated server facade instead of editing Eve's public modules. The
remaining patches touch 12 Eve files rather than 16. These include intentional
integration extensions, not only upstream bugs; see the dated upgrade ledger.

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
