# Eve model-provider experiment

Run with Node 24+ from `packages/harness`:

```sh
pnpm test
```

The runner installs the packed `@dojofoo/harness`, pinned AI SDK and official
HarnessAgent adapters into a fresh temporary consumer. Eve 1.0.0-rc.1 and its four
audited patches are already assembled in that package; consumers install no
separate Eve and run no patch scripts. The runner verifies registry URLs,
integrity and production/eval version alignment, then tests that exact runtime.
It removes only its own temporary directory afterwards. No paid model is called.

The compile-only `adapter-types.ts` matrix covers the ten published
[official adapters](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters).
Their release numbers differ: the runner pins releases whose declared harness
dependency matches the tested SDK and asserts that alignment after installation.
Adapter packages are installed only in the temporary consumer (Pi is also a local
test dependency). No extra adapter CLI is started, including Claude Code.
The matrix guards against missing factory exports, invalid adapter objects and
accidentally allowing both active/inactive tool filters. It does not certify
authentication, streaming or lifecycle behavior for those adapters.

`pi.test.mjs` additionally uses the official Pi adapter and coding-agent runtime
with a loopback Responses API fixture. It verifies native journal recovery,
stable session identity, and retained system instructions across two provider
calls. It also suspends a real Pi host-tool call and restores it with one answer.
The removed pre-0.80 internal request-input behavior is not emulated: Eve's
current workflow question is exercised by `cli-host.test.mjs` (real Pi and CLI
restart) and `native-host.test.mjs` (real OpenCode and host restart).
Only inference is canned; Pi's adapter/session implementation is real.
Non-loopback fetches are rejected, credentials are fixture-only, and no personal
Pi agent directory is supplied. The fixture event sequence follows the
[Responses streaming reference](https://developers.openai.com/api/reference/typescript/resources/beta/subresources/responses/methods/create).

`src/harness-model.ts` implements the AI SDK v4 model interface using official
HarnessAgent. Tool declarations have no execute function: unmodified Eve owns
execution, and its next model call supplies the result to HarnessAgent's public
continuation API. The adapter fixture emits its answer only after receiving that
result. Tests use the registry Eve tool loop directly, not a full HTTP/workflow host.
Eve consequently logs a tracing warning about the absent Workflow context.

Verified gates:

- Incremental tool-input start/delta/end events precede native calls and results.
- Native approval and denial resume through official `toolApprovalContinuations`.
  Both restore serialized history in a fresh provider and a separate Node process.
  The SDK checkpoint stays on the call (approval metadata is not retained by AI SDK).
- Eve host-tool approval policies run with Eve's real context container. A parked
  approval restores from serialized session state, executes once when approved
  and never when denied, and reports `input.resolved`. This is not full-host testing.
- The official `prepareCall` callback changes model, instructions and skills
  between turns, preserving session identity. It is not called on continuation.
- Unsupported call options emit standard provider warnings for both generation
  and streaming. Runtime settings remain the route for harness-specific configuration.
  Per-call headers override runtime defaults case-insensitively and pass through
  HarnessAgent's official header API. AI SDK's automatically supplied user-agent
  is omitted because HarnessAgent owns it. Managed authentication/client headers
  remain rejected by HarnessAgent before any native session starts.

The installed `HarnessV1StreamPart` union does not include source or generated-file
events. Standard mappings in the provider do not create those missing capabilities.
No adapter modifications were made to manufacture support.

`host.test.mjs` boots Eve's real Nitro development server and local workflow
world using a disk-authored agent and the installed provider. Through the public
HTTP client it creates two concurrent sessions, checks authored instructions,
continues one conversation, shuts down/restarts the server and attaches by the
original session ID and client stream cursor. The server restarts while an
authored `ask_question` request is pending; answering Review reaches the original
harness session exactly once, then another user message retains all prior history.
Only the native adapter/inference is scripted; no HTTP routes, workflow store or
runtime model resolver is mocked. Its sandbox resume shim is fixture-only because
the scripted journal resides entirely in the checkpoint, not the filesystem.
The same scenario uses Eve's authored sandbox definition and official just-bash
backend with a seeded `note.md`. It calls Eve's built-in `read_file`, then
`write_file`, restarts the server again, and verifies the saved content through
another `read_file` call. Eve's filesystem tools and persistent sandbox are real;
they are separate from the scripted harness adapter's checkpoint-only sandbox.
The scenario also dispatches Eve's built-in `agent`, verifies a separate native
child session with no inherited conversation, and requires the child's answer to
wake the parent without a user message. This now passes. Eve can park the parent
after background dispatch, retaining a suspended harness checkpoint and its tool
receipt. The provider delivers that receipt through official `continueStream`
before submitting the completion notification through `stream` in the same
session. If continuation suspends again, undelivered inputs travel beside the
checkpoint in content-level metadata. There is no additional session store or
adapter patch. Provider tests cover multiple queued inputs, a second tool pause,
reconstruction, binary attachments, exactly-once delivery, and summed token usage.
The same host scenario also runs with a declared `subagents/reviewer/` specialist.
It loads separate instructions and a separately seeded sandbox, calls its own
`read_file`, and returns its evidence to the parent automatically. Assertions
reject inherited parent instructions, the parent's private tool, recursive root
delegation, inherited conversation, or reading the parent's file contents.
Both variants use the same provider model configuration; isolation belongs to
Eve's authored-agent boundaries and each official native harness session.
The second conversation uses Eve's official `SessionStore`, the store behind
`useEveAgent`. The test serializes its events and session cursor, reconstructs it
after a host restart, and answers the pending question. Replay must not duplicate
user messages, and the answer must reach the same native session exactly once; the
question settles with `interaction.settled`, accepted, on its tool part.

The browser talks to these sessions through Eve's own client as well: the agent
API forwards each session's Eve routes (`packages/harness/src/api`), and the authoring
chat uses `useEveAgent`. `@dojofoo/harness/messages` only maps Eve's messages
into the chat's render model.

`cli-host.test.mjs` additionally uses the supported `eve dev --no-ui --host
127.0.0.1 --port 0` executable, not the private server constructor. A packed
package consumer authors a Pi-backed agent, parks an actual Eve question, stops
the CLI process, starts a new CLI process, and answers through Eve's own client,
attached after the restart. The native Pi journal retains the introduction, authored
instructions and exactly one answer; a subsequent turn sees that history.
Only inference uses the loopback fixture. The agent stores its journal outside
the watched source directory using the exported local filesystem helper.
Eve's CLI requires the application package to explicitly declare an `eve`
dependency: a transitive dependency through `@dojofoo/harness` is not sufficient
for project discovery. This proves a public CLI hosting path for Pi, not cold
recovery of OpenCode's live native bridge.

Authoring now exports `createAuthoringSandbox(courseRoot)` from
`@dojofoo/authoring/sandbox`. Use it as an authored Eve sandbox definition. It
mounts the selected real directory at `/course` through upstream `ReadWriteFs`
and `MountableFs`, preserving Eve's private filesystem at other paths. Relative
paths and filesystem-root mounts are rejected; upstream symlink restrictions
remain enabled. This grants write access to that course, not a copied seed.
The host tests call the actual authoring helper: a disk edit is visible through
Eve's read tool, an Eve write changes the disk file, and a subsequent human edit
is visible after restarting the host. The helper does not provide native command
execution or a network sandbox for CLI bridge adapters, and it is not yet wired
into the application's authoring routes. Those remain integration requirements.

### Authoring definitions

The full-host skill test authors a real `skills/course-outline/SKILL.md`, invokes
Eve's default `load_skill` tool through the provider, and asserts that its source
text reaches the native session exactly once. A following user turn retains that
session and the loaded result. Only inference is scripted; skill loading, workflow
execution, and tool continuation use the installed libraries.

The authoring package supplies Eve-authored modules without selecting a model:

```ts
// instructions.ts in the consuming Eve agent
export { default } from "@dojofoo/authoring/eve/instructions";

// tools/dojo_ui_ask.ts (a separate file)
export { default } from "@dojofoo/authoring/eve/ask";
```

Use `@dojofoo/authoring/sandbox` for the live `/course` mount and inject the harness
provider in the consumer's `agent.ts`. Eve's default filesystem tools remain
enabled. The question definition is the official Eve tool, re-exported unchanged;
the filename gives it the name used by the Kyoshi contract.

Instructions read the existing `KYOSHI.md` through its package export at compile
time. A relative `?raw` import crosses Eve's consumer asset boundary, and a read
relative to the bundled `import.meta.url` points into Eve's cache instead. The
package-resolved asset avoids both without changing the compiler. Its content is
compiled as system instructions, not appended as a user chat message. The isolated
compiler test consumes the actual authoring source modules and package exports.
This establishes the definitions; the live authoring routes still use ACP.
Production deployment and real-provider inference through this host remain untested.

- An authored `defineAgent` configuration accepts the provider through the packed
  public declarations. Eve's actual configuration compiler retains its module
  reference and classifies it as an external provider. Explicit context-window
  limits avoid gateway catalog queries, and compilation starts no harness.
  This compiler-unit gate does not cover filesystem discovery or bundle loading.
- `authored.test.mjs` separately compiles a real temporary `agent.ts` and
  `instructions.md` project with its own package manifest. Eve bundles the authored
  imports, generates its artifacts, loads its module map and resolves the official
  Pi-backed provider through `resolveRuntimeModelReference`. Repeated resolutions
  share the model instance. Fetch is forbidden; this is a loading test, not a
  deployed Workflow host or inference test. The temporary project is removed.
- Public packed TypeScript declarations accept official skill bundles. Skill
  content and companion files reach the scripted adapter unchanged; the provider
  does not implement its own skill discovery or filesystem loader.
- Token-chunk streaming and usage conversion through AI SDK.
- JSON schema/name/description forwarding through official output specifications,
  including an external-tool continuation before the final object. Schemaless JSON
  succeeds and malformed JSON is rejected by AI SDK parsing. These scripted tests
  do not establish a vendor model's schema adherence.
- Structured user messages retain binary, URL, inline-text and provider-reference
  file data, filenames, media types and provider options at the official adapter
  boundary. These are contract tests, not proof of every adapter's media support.
  Text-only prompts keep their existing string representation.
- Provider-executed dynamic tool calls retain their execution ownership and
  success/error results. A scripted native command's call and result precede its
  next-step text response; no host-side tool execution is requested.
- Successful and failed Eve tools execute once; their actual results reach the
  adapter before it answers.
- Eve's real `ask_question` handling emits `input.requested`, parks without
  settling the turn, and resolves a selection after JSON restoration of its
  session. A freshly created model receives the answer once through the original
  native session, and Eve emits `input.resolved`. This uses the registry tool loop
  and event handler, not a mocked question router or rendered browser.
- Two user turns share one native session without resending the prior conversation.
- Cancelling the provider stream aborts the active native request.
- Startup/stream errors remain visible when cleanup also fails: both errors are
  retained in `AggregateError`. A cleanup-only failure is not duplicated.
- Unmodified Eve retains content-level `providerMetadata` as `providerOptions`
  in subsequent model prompts, including tool calls returned with an executed
  result. The text case survives JSON serialization of Eve's session state.
- AI SDK preserves metadata supplied on streaming `text-end` events in response
  messages. Top-level response metadata alone is **not** retained in prompts.

- Official SDK stop/resume handles round-trip through that metadata boundary.
- A shared provider isolates two concurrent conversations. A fresh Node process
  recovers both from serialized messages and retains their native session IDs.
- A pending external tool call survives a process restart. The recovered adapter
  receives the student's exact answer once before generating its response. This
  exercises AI SDK messages and HarnessAgent continuation, not Eve's UI prompt host.
- A sandbox without resume support fails explicitly rather than silently
  starting a replacement conversation.
- An explicitly caller-owned official `just-bash` sandbox survives two turns,
  retains a written file, and is stopped only when the caller stops it. This uses
  `createSession({ sandboxSession })`, not the fixture's resume shim. It does not
  promise filesystem survival across process termination.
- Model and instruction changes apply to the next user turn while retaining the
  native session ID. A suspended tool continuation retains its original settings,
  even when resumed through a newly configured provider instance.

## Verified parity constraint

### Client projection regression coverage

The HTTP-host tests also start six concurrent client-store sessions per host
variant and check each projected reply against its own native history. A malformed
projection reports the complete received event sequence and message parts. This
targets an intermittent duplicate-text projection observed with Eve 0.53.0;
passing reruns alone do not establish that its cause has been fixed. No reducer
deduplication workaround is applied.

### Dynamic configuration contract

Use the official `prepareCall` injection point, not a second provider-specific
model-switch API. The callback may asynchronously read the current selection
from the caller's configuration store:

```ts
const { model } = experimental_createHarnessModel({
  harness,
  sandbox,
  prepareCall: async input => ({
    ...input,
    model: await readSelectedModel(),
  }),
}, { mode: "read-only", agent: "codex" });
```

Keep this resolver scoped to the intended agent/session; do not put all learners'
model selections into one mutable global. Throw when selection resolution fails;
the provider propagates the failure and does not choose a fallback model.
The regression suite verifies async selection, failure cleanup, and a selection
changed while a tool is suspended: the continuation finishes with its original
settings, then the next user turn uses the selection without changing session ID.
This requires no HarnessAgent or adapter patch.

HarnessAgent 1.0.108 persists active-turn settings in its continuation handle.
`HarnessAgentSession.resolveActiveTurnSettings` prefers those persisted settings;
`prompt` installs fresh settings for a new user turn. The regression test asserts
both behaviors against the registry SDK rather than inferring them from docs.
Removing an existing tool during continuation is also explicitly rejected in
that SDK method (source-inspected, not yet regression-tested here).

Consequently, Eve's ability to change model/instructions between steps of one
turn is not equivalent to configuring the next harness user turn. Full parity
needs a supported upstream continuation-reconfiguration capability or an explicit
product decision about that difference. Do not rewrite opaque handles or silently
fork a conversation to make a parity test pass.

### Compaction ownership

HarnessAgent 1.0.108 exposes `session.compact(customInstructions)`, delegating to
the adapter's `doCompact`. An adapter may reject manual compaction as unsupported;
native automatic compaction is a separate capability.

The registry Eve compaction regression covers both a retained short tail and a
discarded oversized tail. Eve renders older history into a plain summary prompt,
so that request has no native checkpoint. It then takes only `result.text` into
the summary, dropping the summarizer's response metadata. A retained tail may
still hold the old native handle; when that tail is discarded, neither handle
survives. These are limitation tests, not evidence that compaction works.

Eve's synchronous `onCompaction` callback cannot replace summarization. The narrow
dependency patch instead adds an opt-in `experimental_compact` model capability
at the existing asynchronous compaction entry point, plus its public type. The
provider delegates to official `session.compact()` and returns a refreshed native
checkpoint, preserving unsent trailing messages. No prompt matching, ambient
"last session" or opaque-handle rewriting is used. Models without the capability
still execute the original path above; delegation errors propagate without fallback.

Patched tests verify checkpoint identity, native summary recovery, unchanged input,
preserved next user messages, missing checkpoints, pre-aborted requests and pending
tool-turn deferral followed by exactly-once tool continuation and successful
compaction at the completed boundary. The real Pi fixture exceeds Pi's recent-history window,
lets Pi request its summary through loopback inference, then resumes the same
journal. Manual compaction support still belongs to each adapter. Separate Eve
summary models, arbitrary rewritten history and in-flight cancellation are not
established by these tests.

The adapter is scripted: these are SDK lifecycle contract tests, not real vendor
recovery tests. Its history lives in its opaque resume handle and it does not use
the filesystem. The fixture's sandbox resume shim creates a fresh environment
for that reason only; it is not a production workaround for `just-bash`, whose
missing resume capability has its own rejection test.

The provider remains available through the explicit
`@dojofoo/harness/adapters` entrypoint. Authoring now uses it through the
managed Eve runtime; this integration is still under acceptance testing.
It retains no conversation state on the model instance. It accepts text or
structured user turns and function tools;
it does not implement the entire provider options contract.

Remaining acceptance work (see the package README for verified native cases):

1. Extend the common behavioral contracts across every advertised adapter, beyond
   the existing native startup/capability checks and selected real-host cases.
2. Verify pending-question recovery and cancellation for each applicable adapter;
   passing the scripted SDK test alone does not prove native recovery.
3. Arbitrary rewritten history is not synchronized; the opt-in compaction hook
   covers native delegation only, not history editing/imports.
4. Dynamic instructions, tool changes, approvals, attachments, structured output
   and native built-in tools through the provider contract.
5. Real adapters and the full authoring host, using the existing regression scenarios.

The experiment does not add another session registry or claim these remaining
gates are solved. The abandoned patched backend was archived, not shipped.

The stream translator holds only the latest checkpoint-eligible event until the
next content event arrives. At completion it annotates that final event with the
SDK checkpoint. Earlier tool calls/results are not accumulated until after the
answer, and text deltas stream normally. This preserves event order without
inventing a separate checkpoint message type.
