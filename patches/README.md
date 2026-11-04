# Dependency compatibility

Upgrade status and baseline results live in
[`docs/architecture/dependency-upgrade-ledger.md`](../docs/architecture/dependency-upgrade-ledger.md).
The compatibility patches here and four assembled into `@dojofoo/agent` are independent
compatibility changes. Passing tests against an old release does not justify
removing them from a new one.

## Chat queue during questions

`@tanstack/ai-client@1.0.1` rejects normal messages before applying its queue
policy when an interrupt is pending. Its drain also starts queued messages while
the question still owns the next turn. The patch applies the configured queue
policy and holds that same native queue until the interrupt is resolved. It does
not answer or dismiss the question. Remove it when upstream supports this case.

Browser regression: `packages/ui/e2e/eve-authoring.spec.ts`, “keeps a pending
question while queuing messages through its continuation”. It verifies both
waiting for an answer and accepting messages during the resumed stream.

## OpenCode adapter compatibility

`@ai-sdk/harness-opencode@1.0.173` creates legacy OpenCode sessions but calls the
v2 `switchModel` endpoint before every turn. That endpoint uses a different
session store and can fail with a foreign-key constraint before inference.

The patch removes that call and supplies `model: { providerID, modelID }` to the
existing legacy prompt API. Initial selection and subsequent model changes use
the same session and API; native defaults remain untouched when no model is set.
Compaction already supplies its model to the legacy summarize API.

Regression coverage: `kyoshi.harness.model-switch` in `packages/authoring/src/eve/conformance.test.ts`,
the OpenCode row, checks initial and changed models through the native agent.
This is a dependency patch, not a replacement harness. Authoring bundles the
tested adapter and its bridge assets so npm consumers receive the same fix;
the packed-install smoke verifies model selection against that shipped bridge.
Remove it when
the upstream adapter consistently uses a compatible session/model API. The
published 1.0.173 bridge still mixes these APIs, so the compatibility patch remains.

## FX state folder on macOS

`@ai-sdk/harness-fx@1.0.86` creates its private state folder with
`chmod 700 -- <folder>`. GNU `chmod` accepts that; macOS `chmod` reads the `--`
after the mode as a file name and fails, so FX could not start a turn on a Mac
without GNU coreutils. The patch writes `chmod -- 700 <folder>`, which both
accept. Regression: `packages/authoring/src/eve/runtime-turn.test.ts`, the FX
case, run on macOS without coreutils. Remove it when upstream reorders the call.

FX's file tools resolve every path with `realpath -mz`, and macOS `realpath`
has neither option, so on a Mac FX could not read or write a file through its
tools ("Unable to resolve sandbox path"). The patch keeps GNU `realpath -mz`
and, where it fails, resolves the deepest existing folder with plain `realpath`
and appends the missing rest. It stops at a symlink, so a dangling link fails
the resolution instead of passing the workspace check (1.0.89 still has the
GNU-only call). Regression: `kyoshi.harness.native-write` in
`packages/authoring/src/eve/conformance.test.ts`, the FX row, run on macOS.
Remove it when upstream resolves paths portably.

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
| `eve-distribution@1.0.0-rc.1.patch` | Resolve packaged modules (including an authored workflow step's authorization import), project root and workflow identity; guard incompatible history | `experiments/model-provider/exports.test.mjs`, `local-history.test.mjs`, authored/host fixtures, `packaging.mjs` |
| `eve-managed-project@1.0.0-rc.1.patch` | Compile manifest-free `.dojo/kyoshi` and `.dojo/sensei` using the installed runtime, without project dependencies or symlinks | `experiments/model-provider/manifest-free-project.test.mjs` |
| `eve-local-shutdown@1.0.0-rc.1.patch` | On SIGTERM/SIGINT, wait up to 1 s for in-flight local World deliveries before exiting | `test/local-shutdown.test.ts`; `kyoshi.host.ask-answer-across-restart` |

Eve's signal handler exits as soon as its remote sandboxes are stopped. With the
local World, a workflow step still running then is lost: the step started inline,
so after a restart the Workflow runtime treats it as leased to the dead invocation
for `WORKFLOW_INLINE_OWNERSHIP_LEASE_SECONDS` (860 s) and does not rerun it. A
host closed right after a question appears hits this, because the step that
publishes the question records its own result a moment later; the session then
ignores the answer until the lease runs out. The patch counts deliveries in the
local World's queue handler and waits for them on shutdown, for at most 1 s: a
delivery that is still running a turn would otherwise go on to start a native
agent while the server exits, and that agent outlives it
(`sensei.host-port.rerun-no-duplicate` leaves an OpenCode server with a 5 s
bound). Such a delivery is cut short as before, and a crash still loses the
step. Remove the patch when Eve drains deliveries itself or the local World
recovers inline steps of a previous process.

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
