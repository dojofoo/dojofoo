# Prepared upstream reports

These are local contribution drafts, not published issues or PRs.

## OpenCode: native model selection and runtime cleanup

- Affected artifact: `@ai-sdk/harness-opencode@1.0.173`.
- The bridge creates/restores a legacy session, then calls
  `client.v2.session.switchModel` against a different session store.
  This can fail before inference with a missing-session/foreign-key error.
- Proposed fix: remove the v2 switch and pass
  `model: { providerID, modelID }` to the existing legacy prompt call.
  Leave the model absent when using native defaults; compaction already supplies
  its model to the legacy summarize API.
- Source patch: [harness-opencode-legacy-model.patch](./harness-opencode-legacy-model.patch).
  Paths are relative to the published adapter package, not the monorepo root.
- Regression: `kyoshi.harness.model-switch` in `packages/agents/src/eve/conformance.test.ts`.
  The OpenCode row checks initial and changed models through the
  native OpenCode agent, including retained conversation history and session ID.
- Stop/destroy also need the bridge's existing `closeRuntime` callback. Without
  it, answering a parked tool and stopping the resumed session leaves OpenCode's
  server and host-tool process alive. The existing native authoring browser
  flow checks that these processes stop after a paused-question restart.
- The pinned OpenCode SDK also stops only its launcher on POSIX. Its bootstrap
  now applies a frozen pnpm patch: the server owns a process group and the
  existing SDK stop function signals that group. Windows keeps its taskkill
  behavior. A direct SDK start/close probe drops from one surviving native
  process to zero; the full browser restart/shutdown gate remains required.
- Packaged bridge patch:
  [../@ai-sdk__harness-opencode@1.0.173.patch](../@ai-sdk__harness-opencode@1.0.173.patch).
