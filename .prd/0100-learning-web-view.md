# Learning Web-View

- **Epic:** 0100
- **Status:** In Progress
- **Date:** 2026-07-05 (revised 2026-07-08)
- **Owner:** dojocho core

---

## Vision & Core Principle

dojocho turns the learner's own coding agent into a Socratic sensei: the learner does the reps — real code, real repo, real tests — and the agent teaches, constrained by the teaching contract (`SENSEI.md` is agent-only; the learner sees only the briefing).

The web-view is **not a state viewer and not a second product**. It is a second harness onto the *same* sensei session. There is no distinction in how a user interacts with the agent and the course material — terminal or web UI, it is the same interface. The web UI simply has richer affordances.

**The UI renders; the agent narrates.** Feedback, progression, unlocks, and suggestions come from the sensei. UI logic is limited to the course frame (agenda, workspace, action buttons) and to translating richer interactions into the same protocol the terminal already speaks.

## The Kata Flow (both surfaces, one interface)

Terminal today: the learner types `/kata`; the agent introduces the topic, the learner codes the tasks in their editor, the agent verifies via tests, narrates, answers questions, and asks intermediate steps when needed. State lands in `.dojorc`, notes in `JOURNAL.md`, transcripts in `.dojo/cassettes/`.

Web UI: the exact same flow, replicated with interactive possibilities the terminal cannot offer:

- **Agent questions become modals/popovers** ("how do you want to proceed?") instead of inline prompts.
- **The editor is embedded** (Monaco) on the real `katas/<name>/solution.ts` — no window swapping; the repo file stays the single source of truth, so terminal, external editor, and web workspace never diverge.
- **Intent buttons — `Test | Ask | Submit | Finish`** — signal steps and circumvent routines. Each button emits a structured intent event, so *the agent no longer needs to track where the user is*: the interface trigger tells it what the user is doing.
- **Presentational surface**: the UI can show narration as rich text, visuals like the current kata agenda, and navigation — between kata lessons, past sessions/submissions, and switching kata or dojo altogether.
- Finishing a kata **auto-runs the test suite** and hands the results to the agent, which narrates feedback and how to proceed.

## Goals

1. `dojo ui` opens a local course: agenda with per-kata state — **solved / current / not-started (hidden by default; progressive disclosure is Socratic navigation)** — plus dojo overview and progress.
2. The full kata loop in the browser: embedded Monaco on the real workspace file, `Test | Ask | Submit | Finish` intent buttons, auto test runs, agent feedback rendered as narration.
3. One broker, one message API: the dojo server receives messages and sends events; **proxy adapters** connect it to opencode's and codex's own servers first, Claude Code later. Terminal and web sessions are the same sessions.
4. Agent-driven interaction: agent questions render as modals/popovers; only the agent advances the learner, reveals feedback, or shows suggestions on request.
5. Journal and session history (cassettes) as navigable course material — revisit past submissions and sensei exchanges.
6. Local-first: no account, localhost-only by default; every browser session lands in cassettes like terminal sessions.

## Non-goals

- Public deployment / multi-user hosting (auth and pairing tracked, not shipped here).
- Course marketplace, publishing, discovery (0500). Analytics/benchmark dashboards (0300) — this epic lists and replays sessions only.
- Kata authoring from the browser (0400); the web-view later hosts its preview mode.
- UI-side pedagogy: the UI never decides progression, never reveals hints or solutions, offers no affordance that bypasses the Socratic contract. If the agent didn't say it, the UI doesn't show it.
- Replacing the terminal flow. Both surfaces stay first-class; protocol tags remain a stable contract.

## Users & Personas

- **Learner** (primary): practices a stack via katas. Wants one place to code, test, and converse with the sensei — no window swapping, visible progress, recall of past sessions.
- **Dojo author**: previews how a manifest renders — agenda grouping, briefing formatting — before publishing (consumer of 0400 tooling).
- **Sensei-agent**: the coding agent behind the broker. The web UI must deliver it the same protocol the CLI does, enriched with intent events, and render its narration faithfully.

## Current State (verified in-repo)

- **CLI**: kata state machine (`packages/cli/src/commands/kata.ts`), protocol tags (`packages/cli/src/format.ts`: `<dojo:status>`, `<dojo:sensei>`, `<dojo:prompt>`, `<dojo:learnings>`), journal (`journal.ts`), agent runtime detection (`agent.ts`), `dojo ui` launcher (env one-off at CLI root). Tracking/cassettes (`tracking.ts`, `commands/track.ts`) in working tree, unlanded.
- **Shared state**: `@dojocho/config` owns `.dojorc`/manifest schema *and* kata-state derivation (`kataState`, `findCurrentKata`, `findNextKata`, `completedCount`) — CLI and UI compute identical state (shipped in 0101).
- **UI server** (`apps/ui`): Hono app with the 0101 project API (`/api/project/state|katas|katas/:name/briefing|journal|cassettes[/:id]`), learner-safe briefing extraction (Goal + Tasks only), typed `hc` client, same-origin CORS. A2A skeleton (`/api/a2a/jsonrpc`, agent card) with `EchoExecutor` stub.
- **UI frontend**: TanStack Start + Tailwind; minimal overview + briefing routes (vertical slice). Unwired course template in `src/app` (sidebar, MDX pipeline, components) awaiting 0102.
- **Agent servers** (researched 2026-07-07): opencode `serve` — HTTP + SSE, sessions, `prompt_async`, `/event`, live TUI injection via `/tui/*`, SDK `@opencode-ai/sdk`. codex `app-server` — JSON-RPC/stdio, thread/turn/item, streamed deltas, server-initiated approvals, SDK `@openai/codex-sdk`. Claude Code — no attachable server; channels (MCP, research preview) or Agent SDK sessions.

### Gap summary

No agenda/course shell, no embedded editor, no intent buttons, no broker adapters (echo only), no modal rendering of agent questions, no live events, cassettes unlanded.

## Architecture

```
┌────────────────────────────  learner's repo  ────────────────────────────┐
│ .dojorc   .dojos/<dojo>/{dojo.json,DOJO.md,katas/*/SENSEI.md,JOURNAL.md} │
│ .dojo/cassettes/*.jsonl      katas/<name>/solution.ts                    │
└───────────────┬──────────────────────────────────────────┬──────────────┘
                │ fs read + watch                          │ writes (Monaco save,
                ▼                                          │  CLI, external editor)
┌────────────────────────  dojo server (Hono)  ────────────┴──────────────┐
│  Project API (0101, shipped)      Message API (one bus)                 │
│   GET /api/project/*               in:  message | intent(test/ask/      │
│                                         submit/finish) | navigate       │
│   SSE /api/events                  out: narration | question | status | │
│    (state + bus events)                 test-results | unlock           │
│                                              │                          │
│                                     proxy adapters                      │
└──────────────┬───────────────────────┬──────┴──────┬────────────────────┘
               │                       │             │
        Web UI (browser)          opencode        codex          claude (later)
        agenda · Monaco ·         HTTP+SSE        app-server     channel / SDK
        Test|Ask|Submit|Finish    :4096           JSON-RPC/stdio
        modals for questions
        sessions & dojo switch          Terminal keeps its native flow;
                                        same sessions, same cassettes.
```

**Data flow, concretely:**

1. `dojo ui` starts the server with `DOJO_PROJECT_ROOT` (set once at CLI root). Project API serves course frame data; the bus carries the conversation.
2. **Intent buttons** post structured events (`{intent: "test", kata}` …). The broker translates them into the agent's native input (a prompt carrying the intent + test output), so the agent reacts instead of bookkeeping.
3. **Test runs** execute the manifest's test command server-side; results go to both the UI (raw) and the agent (context for narration).
4. **Agent output** is normalized by adapters into typed parts (narration / question / status), reusing the `format.ts` tag vocabulary. Questions render as modals; answers post back as messages.
5. **Monaco** edits the real file; save writes to disk; the watcher invalidates both surfaces.
6. Every bus exchange is recorded to cassettes — browser and terminal sessions are indistinguishable in history.

## Feature Breakdown

- **0101 `project-api`** — ✅ shipped. Read-only project state, learner-safe briefing, journal, cassettes; kata-state extraction into `@dojocho/config`; typed `hc` client.
- **0102 `course-shell`** — Agenda with progressive disclosure (solved / current; not-started hidden behind a toggle), dojo overview, kata navigation, session/journal browsing, dojo/kata switching. Wire the dormant template (sidebar, MDX pipeline) to manifest data; delete placeholder content.
- **0103 `broker-and-adapters`** — The message API (in: message/intent/navigate; out: narration/question/status/test-results) with proxy adapters for **opencode** (HTTP+SSE) and **codex** (app-server JSON-RPC). Adapter contract normalizes events; sessions recorded to cassettes. Replaces `EchoExecutor`. (Claude adapter is 0107.)
- **0104 `kata-workspace`** — Embedded Monaco on `katas/<name>/solution.ts`, `Test | Ask | Submit | Finish` action bar emitting intent events, server-side test execution endpoint, results pane.
- **0105 `narrated-loop`** — Render adapter events: narration as rich text, agent questions as modals/popovers, status/unlock transitions animating the agenda. Finish flow: auto-test → results to agent → narrated feedback → next-kata handoff. SSE live-updates when terminal activity changes state.
- **0106 `session-history`** — Cassette browser and transcript replay as course material (past submissions per kata, cross-linked from the agenda); requires landing `tracking.ts`.
- **0107 `claude-adapter`** — Claude Code joins the broker: channel (MCP) into an active session where available, Agent SDK-spawned session as fallback; `/dojo start` slash command boots the server from inside a session.
- **0108 `ui-distribution`** — `dojo ui` outside the monorepo: Nitro node-server bundle shipped with the published CLI, `--port`/`--no-open`, browser auto-open.

## CLI / Schema Surface Changes

- `dojo ui`: unchanged interface; gains `--port`/`--no-open` and bundled launch in 0108.
- Protocol tags (`format.ts`) remain the stable contract; adapters parse the same vocabulary the terminal prints.
- **Intent events** are new surface: documented as part of the broker API (0103), versioned with it.
- Manifest: optional additive fields only (`katas[].estimatedMinutes`, `modules` grouping) — co-designed with 0200 output.
- `.dojorc`: UI writes only through the same code paths the CLI uses (kata switch, progress) — single-writer semantics preserved.
- Cassette format becomes a documented contract (shared with 0300/0500).

## Dependencies on Other Epics

- **0200 course distillation** (downstream): distilled courses emit modules/lessons + video/VTT — rendered by the 0102 shell's dormant video components.
- **0300 telemetry/reviewer** (downstream): consumes cassettes (0106) and the event bus (0103/0105).
- **0400 authoring** (peer): web-view is the live preview target.
- **0500 registry** (downstream): local course pages template the hosted ones.
- **Upstream:** `tracking.ts`/`track.ts` must land before 0106.

## Risks & Open Questions

- **Adapter drift**: three agents, three protocols. Mitigation: one adapter contract with conformance fixtures; opencode first (most stable server), codex second, Claude last (channels are a research preview).
- **SSE through Nitro unverified** — de-risk in 0105 with a spike; degrade to polling if buffered.
- **Monaco vs. external editors**: concurrent edits to the same file. Mitigation: fs watcher + last-write-wins with a dirty-state warning in the workspace; the file on disk is always authoritative.
- **Socratic contract in a richer UI**: buttons and modals must never become a "reveal answer" side-channel. Rule: every learner-visible string originates from the agent or the learner-safe briefing extraction.
- **Local security**: test-execution and intent endpoints spawn processes. Bind 127.0.0.1, per-launch token minted by `dojo ui`, no wildcard CORS (already same-origin).
- **Open**: how much agenda does progressive disclosure show — next-N or module-scoped? Proposal: current module visible, rest collapsed, "show all" toggle.
- **Open**: does `Submit` differ from `Finish`? Working definition: Submit = run tests + request feedback; Finish = mark complete + sensei closes with insight + next-kata handoff.

## Success Metrics

- **Loop reality:** a learner completes a full kata **entirely in the browser** — intro, coding in Monaco, Test/Ask/Submit/Finish, narrated feedback — against a real agent (opencode or codex), and the session appears in `.dojo/cassettes/`.
- **Interface parity:** the same kata completed in terminal and in web produces equivalent cassette transcripts (same protocol vocabulary).
- **Liveness:** terminal-side kata completion reflects in the browser agenda in <2s.
- **Adoption:** ≥40% of active learners launch `dojo ui` weekly (opt-in ping until 0300).
- **No regression:** terminal kata flow byte-identical with the UI running; existing smoke/e2e suites stay green.
