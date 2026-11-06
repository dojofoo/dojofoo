# @dojofoo/harness

Eve plus an experimental model provider backed by the official AI SDK
HarnessAgent. No maintained Eve source fork, custom execution backend, workflow
runner or per-adapter provider implementations. The build embeds a pinned Eve
release (1.0.0-rc.1) with a patch for native compaction.
The separate distribution patch redirects the generated module-map loader import
to `@dojofoo/harness`, recognizes that dependency during CLI project discovery,
and preserves Eve package identity for workflow steps in linked workspaces.
It also points the step-authorization import that Eve's workflow transformer adds
to an authored workflow tool's `"use step"` functions at
`@dojofoo/harness/internal/workflow-step-execution`, since a prepared persona build
has no `eve` package to resolve (Sensei's `dojo_lesson_complete`).
The latter prevents compiled workflow and registered step IDs from diverging
when the embedded runtime lives outside `node_modules` during development.
The native-turn patch respects a provider's terminal `stop` after native tool
results (including failures), instead of starting an unsolicited continuation.
Eve-owned tools and suspended questions still use the existing continuation flow.

All pinned Eve export paths are exposed directly, including skills, hooks,
memory, tools and framework integrations. A packed-consumer test checks every
declared target and loads the core authoring APIs. Optional integrations still
have their upstream framework/service requirements; export coverage alone is
not behavioral verification. The `self-modification/config` source condition
uses Eve's shipped JavaScript because its published TypeScript target is absent.

The package includes Eve's pinned `just-bash` engine dependency. Authored
filesystem tools require no consumer install or runtime auto-install. The packed
consumer test reads and edits a live course mount, observes human edits, and
reopens private workspace files after shutdown.

The managed authoring host prepares adapter bootstrap tools through mise:
`prepareHarnessEnvironment()` from `@dojofoo/harness/adapters` installs
and selects `pnpm@10.34.5` with `--no-config`. Only the resulting PATH is passed
to the local sandbox. Course/global mise configuration, credentials, and
global pnpm are not changed. Mise is prepared by `dojofoo install`; the first
tool download requires network access. Standalone local hosts can use the same
helper before creating their local sandbox.

Run the real toolchain regression (no model calls) with:
`DOJO_MISE_BOOTSTRAP=1 node --test packages/harness/experiments/model-provider/runtime-toolchain.test.mjs`.

The opt-in browser acceptance check runs a real local UI, Eve host and OpenCode
against a loopback model endpoint (no paid inference):

```sh
DOJO_AUTHORING_RUNTIME_E2E=1 pnpm --filter @dojofoo/ui exec playwright test e2e/eve-authoring-runtime.spec.ts
```

It starts from an empty temporary course, saves authored files through Monaco,
restarts the server with a pending question, answers the restored question, and
opens an isolated learner trial that receives an agent response. Requires Node 24,
built `@dojofoo/harness`, Playwright Chromium and a local ACP-capable OpenCode binary
(`OPENCODE_BIN` can override discovery). This verifies runtime integration, not
the pedagogical quality of generated material or other harnesses.

The shared native lifecycle check is opt-in as well:

```sh
DOJO_HARNESS_LIFECYCLE=1 pnpm --filter @dojofoo/agents exec vitest run src/eve/harness-lifecycle.test.ts
```

It sends no prompts, but may bootstrap native binaries and read existing login
configuration. It checks start/checkpoint/resume for each advertised adapter;
passing it does not establish tool, inference or compaction compatibility.

## Eve 1.0

- An ordinary project keeps its agent in `<package>/agent/` (`agent/agent.ts`); the
  managed `.dojo/<role>/` roots still compile flat.
- `write_file` refuses a file the agent hasn't read in the session.
- Compiling fetches the AI Gateway model catalog, best effort, as build metadata.
- Under `NODE_ENV=test` Eve replaces authored models with its own mock; test hosts
  that need their own model run with `development`.
- With the Docker CLI installed but its daemon down, a development server's shutdown
  waits a minute on `docker ps`; hosts without Docker sandboxes set `EVE_DOCKER_PATH`
  to a missing path.

## Boundaries

The export map has three groups. The UI server, the CLI and the browser import only the
closed set (A), and the test entries (C) only in their tests; lint rules in
`.dependency-cruiser.cjs` enforce both.

| Group | Entry | Responsibility |
| --- | --- | --- |
| A | `@dojofoo/harness` | Reexport Eve's root API unchanged |
| A | `/client`, `/react` | Reexport Eve's existing client integrations |
| A | `/server` | Reexport the pinned Eve host lifecycle (`start`/`close`) for local UI ownership |
| A | `/host-port` | The persona host's port to the UI server |
| A | `/adapters` | `agentAdapter`, the official HarnessAgent API unchanged, the harness model (`experimental_createHarnessModel`, which translates the AI SDK model contract to HarnessAgent), the local sandbox and `oneShot` |
| A | `/persona` | The persona host, the lifecycle hook, process groups, the file guard and the read-only settings |
| A | `/api` | The versioned workspace agent API, as TypeScript source (see [`src/api/README.md`](src/api/README.md)) |
| A | `/messages` | Eve's messages in the chat's render model (`eveChatMessages`, `eveQuestion`), and Eve's `activeTurn`, `emptySessionView`, `foldEvents` and `openInteractions` |
| B | Eve's other subpaths, `/server/production`, `/server/build`, `/eve/package.json` | Persona builds and evals |
| C | `/api/fixtures`, `/host-port/fixture`, `/scripted-harness`, `/local-history` | Tests, fixtures, the agents' scripts and the evals only |

The provider factory accepts the official adapter and runtime settings. Its
generic type preserves adapter-specific settings and the SDK's mutually exclusive
tool-filter options. There is no switch on Codex, Pi, OpenCode or other names.
Authored skill bundles, including companion files, use HarnessAgent's existing
`skills` option. System messages and host-tool declarations come from Eve's model
call; filesystem discovery and materialization remain outside this provider.
The packed-consumer type matrix covers all ten currently published adapters:
Claude Code, Cline, Codex, Cursor, Deep Agents, FX, GitHub Copilot, Grok Build,
OpenCode and Pi. This is **type compatibility**, not proof that every adapter's
capabilities work. Claude is not exercised at runtime. Unsupported behavior must
not be silently emulated.

Eve's existing ChatGPT model factory informed the boundary: supply a model through
the normal provider interface rather than replace Eve's execution engine. Unlike
that direct HTTP provider, this provider must coordinate a stateful local harness.

An authored Eve `agent.ts` assigns the returned `model` directly to
`defineAgent({ model, modelContextWindowTokens })`. Use the actual selected
model's context limit: Eve needs it to compile compaction settings when the model
is not in its gateway catalog. The packed-consumer tests verify public types and
Eve's compiler classification as an external provider, without gateway queries
or starting a harness at compile time. A disk-authored fixture additionally runs
Eve's discovery/compiler, loads its generated module map, and resolves the official
Pi-backed model through Eve's runtime resolver. It confirms repeated resolutions
reuse the model instance without network access. Deployed Workflow hosting and
real-provider inference through that full host remain separate verification gates.
An additional scripted-adapter test now boots Eve's actual Nitro development
server/local workflow world, loads authored instructions, isolates two HTTP
conversations, and restores the same native session after server shutdown/restart.

## Current status

The provider is experimental and supports function tools. User messages with
attachments pass through the official SDK unchanged; actual media support belongs
to the selected adapter. Native SDK checkpoint
handles travel in standard content-level provider metadata; the model instance
does not retain conversation state. Scripted-adapter tests cover concurrent
conversations and recovery in a fresh process, without a separate session store.

JSON response formats use the official AI SDK `Output.object` / `Output.json`
specifications. The requested schema, name and description reach HarnessAgent,
including external-tool continuations. The calling AI SDK owns output parsing
and validation; the provider does not inject JSON instructions into prompts.
Support for enforcing the format still depends on the selected adapter/model.

The scripted adapter also recovers a pending external tool call in a fresh
process and receives the student's answer exactly once.

The `src/local-sandbox.ts` implementation satisfies the official network
sandbox session contract using POSIX host processes. It preserves binary output,
absolute host paths, cancellation, and course files across teardown. Nine real
filesystem/process/bridge tests cover this boundary, including the official
bridge's rejection of absent/invalid tokens and authenticated protocol shutdown.
It is **not security isolation**. It is exported through `/experimental/local`
and used by the authored host fixtures. Bridge tokens are exercised by the
tests; the upstream bridge's `0.0.0.0` listener and live subscription inference
remain deployment/security considerations, not guarantees of this host runner.
The registry OpenCode 1.0.110 bootstrap and authenticated bridge start/stop now
pass in a separate temporary home with fixture-only authentication and a
pinned pnpm 10.34.5. `port: 0` uses the official OS-assigned-port capability.
The native CLI now completes a turn against a loopback Responses endpoint, then
stops and resumes its serialized checkpoint with the same session ID. A second
turn verifies that its model input includes the first exchange. Both direct
HarnessAgent calls and a newly constructed model provider pass this scenario;
the provider recovers solely from serialized AI SDK response messages. This uses no
paid inference and does not prove lesson completion. A third variant runs each
turn in a separate Node process: the first exits before the second starts, and
only the serialized response messages, workspace path and loopback model URL
are supplied to the next worker. Native history and session identity survive.
The same native runtime also passes through the shipped Eve tool loop, both
for conversation and for an Eve-owned `lesson_context` tool. The model requests
the advertised tool, Eve executes it exactly once, and native model input receives
the result. Teardown waits for the whole owned POSIX process group, including
background descendants left behind after the bridge's parent process exits.
An Eve-owned `dojo_ui_ask` also passes through real OpenCode: `input.requested`
parks the turn, serialized Eve state accepts an `inputResponses` entry keyed by
its request ID, one `input.resolved` is emitted, and the native model receives
the author's answer exactly once. This verifies the runtime contract, not the
authoring frontend: its current empty-session/bootstrap and ACP answer APIs
still need replacement with Eve's create-with-first-message and request-ID flow.
The native `read` tool is also verified through Eve: OpenCode reads a real
course file, the model receives its contents, and Eve retains the native result
without executing the tool itself. Use official
`sandboxConfig: { workDir: "course" }` to select the course directory; the SDK
otherwise creates a separate per-session working directory. Canonicalize host
paths before passing them to native tools: macOS's `/var` and `/private/var`
aliases can otherwise trigger OpenCode's external-directory permission guard.
This is not proof of every native tool or every adapter's filesystem behavior.

The adapter requires explicit `provider: "openai"` for this fixture's credential
selection, in addition to `model: "openai/gpt-4o"` on HarnessAgent.
An explicit `environment` replaces inherited process variables; use that for
isolated tests so adapter skill installation cannot touch the user's home.

Provider-owned sandbox recovery requires a resumable sandbox and compatible
adapter. The SDK's `just-bash` provider does not support resume and is explicitly
rejected on a subsequent turn. Alternatively, pass the official `sandboxSession`
option as the factory's second argument: the caller retains the sandbox and owns
its cleanup. This supports warm continuation with an existing sandbox, not cold
recovery of an in-memory filesystem. Native OpenCode disk recovery is tested as
described above. Remaining integration gaps include pending native questions
after process termination, the broader native built-in tool set, and the full model-options
contract. Authoring starts its managed Eve runtime automatically. The browser acceptance test covers
course creation, restart, question recovery and learner trial through the native
OpenCode harness against a deterministic local model endpoint. This verifies
integration, not teaching quality from a paid model.

One verified parity gap: the SDK preserves the original model and instructions
through a suspended tool continuation. Changes take effect on the next user turn,
not the next Eve tool-loop step. Restarting the local process does not remove
this constraint because the settings are part of the continuation handle.

For session-aware Eve configuration, `defineDynamic(async ctx => ...)` runs before
every model call and its context exposes the session. It can select the
harness/workspace and return `{ model: experimental_createHarnessModel(runtime,
{ mode, agent, eveSessionId: ctx.session.id }).model, modelContextWindowTokens }`.
`mode` is `"read-only"` when omitted, which needs `agent` and allows only the
agent's read-only built-ins and the call's Eve tools; a persona that writes,
such as Kyoshi, passes `mode: "full"`.
For adapters with package-relative bridge assets, retain their package boundary
using Eve's existing `build.externalDependencies` configuration. The hosted
OpenCode fixture externalizes `@ai-sdk/harness-opencode` and `@dojofoo/harness`;
bundling the adapter relocates `import.meta.url` without copying its bridge
assets. Keep native runtime state outside the authored source directory, so
database and journal writes do not trigger Eve's development watcher.
This does not override HarnessAgent's suspended-turn settings. The pinned Eve
uses its upstream model profiles for web-search routing. The selected
model object retains its provider; no model-reference metadata patch is needed. Regression coverage
includes external, OpenAI, Anthropic, Google and Gateway selections. No tools are
silently discarded and no provider-specific session registry is introduced.

Use the official `prepareCall` callback for dynamic selection; it is accepted
unchanged by this provider. Tests verify changing model, instructions and skills
between completed turns on one native session. A separate test verifies that
the callback is not invoked again during a suspended tool continuation.

The injected function can read a session-scoped selection without rebuilding
the provider:

```ts
const { model } = experimental_createHarnessModel({
  harness,
  sandbox,
  prepareCall: async input => ({
    ...input,
    model: await selections.readModel(sessionId),
  }),
}, { mode: "full" });
```

`selections` belongs to the caller; it is not another provider-owned session
store. Changing it while a host tool is pending takes effect on the next fresh
prompt, including learner input queued behind that tool in the same provider
call. The existing continuation retains its original settings and native
session ID. This is the official `@ai-sdk/harness@1.0.108` contract, not a
provider restriction: `prepareCall` prepares fresh prompts, while
`resolveActiveTurnSettings` restores suspended-turn settings. No checkpoint
rewriting or adapter-specific model setter is used.

The authoring `runtime-turn.test.ts` additionally changes the live model selection
between native OpenCode turns. It verifies the loopback provider receives the new
model ID, retains the original lesson and answered question, and keeps the same
Eve session after a server restart. This is a real adapter integration check;
it does not claim mid-suspension switching or equivalent behavior in every adapter.

## Provider acceptance ledger

For a focused clean-consumer workflow-host regression, run
`node experiments/model-provider/run.mjs --host-only` from this package after
building it. It exercises both root-copy and declared-specialist delegation;
failures identify the workflow stage without changing runtime behavior.

| Check | Status and evidence |
| --- | --- |
| Eve host tools | Pass: success/failure executes once, incremental native tool arguments stream before the call/result. |
| Human questions | Pass at tool-loop/SDK boundary: park, serialize, resume, answer once; existing Pi fixture also covers Eve questions. |
| Host tool approvals | Pass: Eve's approval policy requests input; restored state executes once on approval and never on denial. Tests seed Eve's real context container, not a deployed workflow host. |
| Native tool approvals | Pass: allow/deny reach official `continueStream`, including a separate Node-process recovery with the same session ID. |
| Attachments and JSON | Pass at adapter boundary: incoming file representations and structured output use SDK contracts. |
| Request headers | Per-call values override runtime defaults case-insensitively without mutation. HarnessAgent receives custom headers and rejects managed authentication/client headers; the AI SDK user-agent is omitted. |
| Unsupported options | Explicit warnings for sampling/token limits, non-default reasoning/tool choice, provider options and raw-chunk requests. Configure adapter-specific behavior through runtime settings. |
| Sources/generated files | Unsupported by the installed HarnessAgent adapter event union. Provider has standard output mappings, but no end-to-end capability is claimed. |
| Full workflow host | Conversation/isolation, pending-question recovery, persistent filesystem tools, root-copy and declared-specialist delegation with automatic parent wake-up pass through real Nitro and local workflow storage. Specialist instructions, tools, files and conversation are isolated. Real inference through that host remains unverified. |
| Authoring UI | Automatic managed runtime, bound to the startup workspace; tests use the fixture runtime. The real OpenCode browser test verifies course-file saves, restart with a pending question, answer recovery and an isolated learner trial response, without route mocks. Other browser fixtures cover failed-answer retry, read-only reconnect and unavailable-session errors. |

Approval checkpoints stay on their associated tool call because AI SDK does not
retain approval-request metadata. When HarnessAgent suppresses a resumed call's
replay, the provider includes that existing call ID beside its native result as
required by AI SDK's model-result contract. Neither case executes the tool again.

When restoring Eve's client, retain both `sessionId` and `streamIndex` from
`session.state`. `respond()` follows the saved cursor, unlike `send()` which
also filters by a new delivery ID. Attaching at cursor zero before responding
can return an old completed turn rather than the new answer. The full-host
test restores this documented client state and verifies one answer receipt
after restarting the server while a question is pending.

The full HTTP-host regression uses real OpenCode with loopback inference.
An Eve-authored question parks, the Eve host restarts, and its public client
restores the saved session/cursor and delivers the answer exactly once. The
following native turn retains the answer and original lesson instructions.
The authored agent builds its sandbox with `createLocalHarnessSandbox` inside
its dynamic model, as Kyoshi does. The development server ends its worker
without running process exit handlers, so OpenCode keeps running across the
restart and the answer reaches that live process; the test reaps it afterwards.
OpenCode's suspended-turn handle references its live bridge. Killing that native
process is not equivalent to restarting Eve or freezing a cloud sandbox:
pending-question recovery after native-process termination remains unsupported
by this local integration.

The Node-only entry point is `@dojofoo/harness/adapters`. Build the
sandbox where the model runs: call `createLocalHarnessSandbox(root, { environment })`
inside the agent's model definition and pass it to `experimental_createHarnessModel`.
The native package-consumer tests use these exports exclusively, including
separate-process history recovery; no implementation files are copied beside
the consumer. This API executes with host permissions and is not a security
sandbox.

When implementing a resumable sandbox provider, pass the SDK's `sessionId` as
`createLocalSandbox(root, { id: sessionId })` on both creation and resume. The
same ID must refer to the same existing resource; it does not restore deleted
files. Without an explicit ID, standalone sandbox instances receive fresh IDs.
Authoring preserves this SDK identity automatically across Eve worker/server
restarts; it does not rewrite native checkpoints or maintain another registry.

For Pi, the package-consumer test also verifies the public `eve dev --no-ui`
hosting path: a complete CLI-process restart restores a pending question from
the native journal, accepts its answer once, and retains the lesson history.
After the restart, Eve's own client attaches to the session, its snapshot shows the
open question, and `respond()` settles it once, accepted, with no new turn and no
synthetic learner message; Pi receives the answer once and the history carries into
the next turn. Only inference is mocked; Eve, Pi and the provider execute normally.
Run just these public-CLI cases with
`node experiments/model-provider/run.mjs --cli-only` after building this package.
The authored application declares `@dojofoo/harness` in `package.json`;
our distribution recognizes it during Eve project discovery.
This test requires no private Eve server imports. It
does not establish the same cold-restart behavior for bridge-based adapters.

Without overrides, the authoring UI prepares a private Eve application under
the course's `.dojo/kyoshi-app` and manages its server.
Official harness bootstrap files live in `.dojo/kyoshi-harness`; its `course`
working directory links to the live authored files, rather than a copied draft.
The runtime keeps the selected model across restarts for the same harness.
Credentials remain with the native harness.
The generated-app OpenCode integration test covers a pending question across
server restart using a loopback model endpoint, without paid inference.

The UI prepares and starts the managed application described above (tests use the fixture runtime);
concurrent requests share one startup, and startup failures reach the frontend
without automatic retries or fallback.
The draft's `.dojo/runtimes.json` `agent` selects its official adapter (OpenCode by default); there is no
`--execution-backend` mode.

Local Cursor uses the installed `cursor-agent` executable and its normal home/login.
`packages/harness/src/local-cursor.ts` disables the official adapter's credential
resolver with explicit empty authentication and changes only its bootstrap recipe:
link the installed executable instead of downloading another CLI, and retain the
normal home instead of creating a private one. It does not read Keychain, copy
credentials, or forward subscription tokens. The official ACP bridge, tool catalog,
and session implementation remain unchanged. A guarded bootstrap-shape test requires
review if the pinned adapter changes; this binding is local-only, not a remote-sandbox
authentication strategy. Missing CLI installation is an explicit error.

## Native compaction

`patches/eve@1.0.0-rc.1.patch` adds `experimental_compact` dispatch at Eve's
compaction step. The capability is already typed by our `HarnessModel`; Eve's
declarations are not modified. Models without the method
follow the unchanged Eve path. This is an experimental Eve extension, not an
AI SDK standard. Our build downloads the pinned registry release and applies the
patch before packaging it under `dist/eve`. Public exports reference that runtime,
including its original package scope, workers, assets and license notices.
Consumers neither install Eve separately nor configure patches. No postinstall
hook mutates consumer dependencies. The patch remains available through
`@dojofoo/harness/eve.patch` for auditing, not as an installation step.

`pnpm test:packaging` installs the tarball in a clean temporary project with
install scripts disabled, rejects a separate Eve installation, and runs the
provider/compaction contract tests against the embedded runtime. The broader
host matrix separately tests authored skills, subagents, native recovery and the UI
against this distribution.

The provider resumes the checkpoint, calls official `session.compact()`, stops
the session and returns its refreshed checkpoint plus any unsent trailing messages.
The native harness owns the summary and durable history; Eve sends no duplicate
summary prompt. No adapter code or opaque checkpoint data is rewritten.

`experimental_canCompact` keeps a paused native tool turn out of Eve's
compaction lifecycle. Deferral preserves the same session state and emits no
false completion event; compaction can run after that turn finishes.

For compaction accounting, the provider reports the last native request's input
plus output as `providerMetadata.harness.contextTokens`. The packaged Eve loop
uses that end-of-step measurement instead of cumulative billed usage, and does
not count the same native output again from its visible history. Ordinary model
usage remains the fallback when this metadata is absent or invalid. Billing and
usage limits still receive the complete native usage totals. This metadata is
our narrow provider integration, not a new AI SDK protocol.

Missing checkpoints and native failures are explicit errors. Compaction requested
during a suspended tool turn is deferred: its messages and checkpoint remain
unchanged so the result can be delivered exactly once. Eve retries compaction at
a later boundary, once the native turn has finished.
There is no silent fallback to a new session or Eve-generated summary. Unsupported
manual compaction remains unsupported. Use the harness model itself for compaction:
a separately configured summary model follows its own capabilities instead.
Arbitrary history edits/imports and in-flight compaction cancellation are not
covered by this extension. It does not establish full Eve parity.

## Verification

### Native acceptance evidence

These are separate behavioral gates, not a blanket compatibility claim. “Unverified”
means the native case has not passed here, even if scripted provider tests pass.
Codex, OpenCode, Pi, Grok and FX passes use deterministic local inference.
Cursor's streaming/recovery/cancellation acceptance uses the installed CLI and
real Auto model access, and requires explicit opt-in/usage approval.

| Harness | Conversation recovery | Eve question + host restart | Active-turn cancellation | Native compaction | Between-turn model switch |
| --- | --- | --- | --- | --- | --- |
| Codex | Passed | Passed | Passed | Unsupported (tested) | Passed |
| OpenCode | Passed | Passed | Passed | Passed | Passed |
| Pi | Passed | Passed | Passed | Passed | Passed |
| Grok | Passed | Passed | Passed | Unsupported (tested) | Passed |
| FX | Passed | Passed | Passed | Unsupported (tested) | Passed |
| Cursor | Passed | Unverified | Passed | Unsupported (tested) | Unverified |

Evidence: `experiments/model-provider/pi.test.mjs`, `opencode-startup.test.mjs`,
`cli-host.test.mjs`, and the authoring package's `conformance.test.ts` (tier A;
results per agent in `packages/protocol/src/conformance.json`) and
`runtime-turn.test.ts`. Cursor startup is covered separately, but its official
adapter cannot change provider routing, and the public `cursor-agent` build
rejects or ignores its hidden local-model options, so no loopback model can
drive it (tested; `docs/designs/agent-runtime.steps/cursor-spike.md`, "Tier A
through the loopback model?"); startup is not evidence for these gates.
The opt-in `cursor-acceptance.test.ts` exercises the real subscription path
(`DOJO_CURSOR_ACCEPTANCE=1`; explicit usage approval required). The latest local
run with the local binding passed streaming, remembered a codeword after a
stop/JSON checkpoint/resume, and confirmed abort during active streamed output.
It uses Cursor's ACP Auto ID `default` (the terminal's `--model auto` is a different
alias). Direct CLI Auto inference also passed. Named models returned `Free plans
can only use Auto` on this account, so model switching was not exercised.
The previous initialization failure came from the stock adapter forwarding a
subscription access token as an API key into its private CLI environment. The
local binding removes that forwarding rather than copying tokens differently.
The Eve question/host-restart gate and model-switch inference remain unverified.
Set `DOJO_CURSOR_MODEL` and `DOJO_CURSOR_SECOND_MODEL` to supported ACP model IDs
only when explicitly approving a run on an account that permits those models.
The test stops on failure and is skipped in normal runs.
The common suite is incomplete until each applicable cell is verified or a native
limitation has been demonstrated, documented, and tested explicitly.

The shared native model-switch check configures a new official `HarnessAgent`
with `openai/gpt-4.1` after a completed `openai/gpt-4o` turn, uses the existing
session, and verifies the actual inference request's model, retained conversation,
and unchanged session ID. OpenCode also passes the managed Eve runtime's dynamic
model-selection check. These results do not claim that changing a model during a
suspended tool continuation is supported.
FX passes the same history/identity assertions with `openai/gpt-5.5`, checking
its actual `ai-language-model-id` gateway header rather than assuming the model
is present in the request body. All these model requests terminate at the local
fixture; no provider inference is used.
Grok uses two local custom-model catalog entries to avoid depending on remote
catalog availability; the test switches from `fixture-first` to `fixture-second`.
Codex switches from the official adapter's default to `gpt-5.4` against the local
Responses fixture, preserving the native model-change warning. This validates
model routing, not subscription access to those particular model identifiers.

The compaction column measures explicit manual compaction, not automatic context
management inside a CLI. The official Codex adapter rejects manual compaction;
Codex still owns its automatic compaction. Cursor, Grok and FX use ACP v1, which
does not define this operation. `harness-lifecycle.test.ts` asserts each native
adapter's capability error. OpenCode's native contract verifies a summary request
and continued conversation with the same session ID; custom summary instructions
are explicitly unsupported and tested. These errors propagate through Eve instead
of silently replacing the conversation or fabricating a summary.

Codex's question/restart gate follows the official adapter's host-tool CLI relay
instruction through a native `exec_command`, rather than assuming those tools
are registered through MCP. The test parks an Eve question, shuts down the host,
restarts it, submits the answer, and verifies the conversation continues with
one question invocation. Neither the adapter nor its relay is patched.

The opt-in authoring startup check runs all six configured native adapters without
inference:

```sh
DOJO_HARNESS_LIFECYCLE=1 pnpm --filter @dojofoo/agents exec vitest run src/eve/harness-lifecycle.test.ts
```

Codex, OpenCode and Pi restore an unprompted checkpoint. Cursor, Grok and FX
explicitly reject that operation: the official ACP adapter creates the native
conversation on its first prompt, so an unused checkpoint has no native session
ID. This check does **not** establish their recovery after a real conversation,
tool use, or model access.

Tier-A conformance (`packages/agents/src/eve/conformance.test.ts`) runs every
registry row with an adapter except Cursor: Claude Code, Codex, Grok, OpenCode, FX
and Pi, each with its adapter's own pinned CLI and an isolated home. Its
harness-level cases run each adapter at the HarnessAgent level against loopback
endpoints (Responses for Codex, OpenCode and Pi; Chat Completions for Grok;
gateway events for FX; Messages for Claude Code): resume after stop, a model
switch, a host-tool turn, cancelling an active turn and a pending host tool,
compaction and a turn with seeded user config. Its host-level case runs Kyoshi's
prepared host in a child process, parks a question, restarts and answers it.
Every case ends with no native process left. Run it with
`pnpm --filter @dojofoo/agents conformance`.

`runtime-turn.test.ts -t 'grok model|fx model'` additionally verifies authored
instructions, native MCP tool discovery, an Eve question, full managed-server
restart, and delivery of the answer through the provider to both Grok and FX.
The FX fixture also handles the CLI's model-based permission review using the
upstream test response format; production permissions are unchanged.
The official ACP adapter warns that
process-loss recovery may rerun the interrupted prompt and repeat native work.
The fixture verifies one external question invocation and retained answer/history;
it does not establish exactly-once execution of arbitrary native side effects.

On macOS, the pinned FX adapter additionally requires GNU `chmod` on `PATH`:
its authentication-file setup invokes `chmod 600 -- …`, which BSD `chmod`
rejects. Authoring preserves an existing GNU `chmod` on `PATH`, otherwise it
discovers installed Homebrew coreutils under either standard Homebrew prefix and
prepends its `libexec/gnubin` directory for the owned harness processes only.
If unavailable, startup fails with an actionable installation message before the
adapter writes authentication files. It never installs utilities automatically,
mutates the user's shell environment, or rewrites adapter commands.

```sh
pnpm --filter @dojofoo/harness test
```

Type-checks/builds the provider, packs its patched runtime, and installs it with
official registry adapters in a temporary consumer with install scripts disabled.
No consumer patch step or separate Eve dependency is used. Native Pi compaction
uses a real journal with loopback inference. No paid models or local login state
are used.
See [the experiment gates](experiments/model-provider/README.md) for the remaining
requirements before production integration.
