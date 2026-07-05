# Learning Web-View

- **Epic:** 0100
- **Status:** In Progress
- **Date:** 2026-07-05
- **Owner:** dojocho core

---

## Problem & Opportunity

dojocho today is terminal-only. The learner's entire experience — kata briefings, progress, journal entries, sensei dialogue — lives in an agent chat transcript and in scattered dot-files (`.dojorc`, `.dojos/<dojo>/JOURNAL.md`, `.dojo/cassettes/`). This works, but it caps what dojocho can be:

- **No sense of place.** A dojo is a course, but the learner never sees it as one: no syllabus view, no progress bar, no "you are here". Every mainstream learning product (Exercism, Codecademy, Frontend Masters) wins on exactly this.
- **State is invisible.** Progress lives in `.dojorc` JSON, learnings in a markdown journal, session history in JSONL cassettes. Rich data with zero surface area.
- **The sensei is trapped in one harness.** Interaction only happens inside whichever CLI agent the learner runs. A web view backed by the A2A broker (`apps/ui/src/server`) decouples the sensei from the terminal — the same session becomes reachable from a browser, and eventually from anywhere.
- **It unlocks the rest of the roadmap.** The web-view is the display layer for 0300's cassette analytics (learner progress, instructor benchmarks), the preview surface for 0400's authoring toolkit, and the local twin of 0500's registry/community pages. Building it raises dojocho from "a clever CLI trick" to "a learning platform that happens to use your own agent".

The raw materials already exist in-repo: a working A2A broker skeleton, a polished (unwired) course UI template, and a `dojo ui` launcher. This epic wires them together around real dojo state.

## Goals

1. `dojo ui` opens a local web app showing the active dojo: kata list with per-kata state (done / current / locked), briefing (`SENSEI.md`), and dojo overview (`DOJO.md`).
2. Render the learner's journal (`.dojos/<dojo>/JOURNAL.md`) and session history (`.dojo/cassettes/*.jsonl`) as readable views.
3. Live-update the UI when CLI/agent activity changes state (kata completed, note appended, cassette refreshed).
4. Interactive sensei chat in the browser via the A2A broker, backed by at least one real harness adapter (replacing `EchoExecutor`).
5. Read-only actions first, then safe write actions (start next kata, add journal note, run tests) exposed through a project API.
6. Keep everything local-first: no account, no network dependency, localhost-only by default.

## Non-goals

- Public deployment / multi-user hosting of the UI (localhost only; auth and pairing are tracked but not shipped here).
- Course marketplace, publishing, or discovery pages (epic 0500).
- Cassette analytics, scoring, or benchmarking dashboards (epic 0300) — this epic only *lists and replays* cassettes.
- Authoring/editing katas from the browser (epic 0400); the web-view may later host a preview mode for it.
- In-browser code editing of kata solutions (Monaco pane). Candidate stretch child, not a goal — the philosophy is "you type in your editor".
- Replacing the CLI/agent flow. The web-view is a companion, never a requirement.

## Users & Personas

- **Learner** (primary): mid-level engineer practicing a stack via katas. Wants orientation ("where am I in this course?"), motivation (visible progress), and recall (journal + past sessions). May prefer chatting with the sensei in a browser pane next to their editor instead of a terminal.
- **Dojo author**: builds training packs (`dojos/effect-ts`, `dojos/pydantic-agents`, `dojos/build-llm`). Uses the web-view to preview how a manifest renders — kata ordering, difficulty, prerequisites, briefing formatting — before publishing. Consumer of 0400 tooling.
- **Sensei-agent**: the coding agent (claude/codex/gemini/opencode/pi) driven by the CLI protocol. Indirect user: its output surfaces in the UI via cassettes today, and via the A2A broker as a live participant tomorrow. The web-view must never let a browser action bypass the Socratic contract (no "reveal solution" button).

## Current State

Everything below is verified in-repo.

### CLI (packages/cli)

- `packages/cli/src/commands/ui.ts` — `dojo ui` spawns `pnpm dev` inside `apps/ui` (port from `DOJO_UI_PORT`, default 4567). Dev-only: it walks parent dirs to find `apps/ui`, so it only works inside/near the monorepo. No production/built path yet.
- `packages/cli/src/commands/kata.ts` — kata state machine: `--start`, `--test/--check`, `--list`, `--change`, `--note`, `--open`, `intro`. Records progress into `.dojorc` and calls `refreshCassette` after activity.
- `packages/cli/src/format.ts` — the agent protocol tags: `<dojo:status>`, `<dojo:sensei>`, `<dojo:prompt>`, `<dojo:learnings>`.
- `packages/cli/src/journal.ts` — `JOURNAL.md` read/append at `.dojos/<dojo>/JOURNAL.md`, sectioned by kata heading.
- `packages/cli/src/tracking.ts` + `packages/cli/src/commands/track.ts` (unlanded, in working tree) — detect the active agent's session log (pi/codex/claude/opencode/gemini), normalize it to `{role, content}` entries, and write cassettes to `.dojo/cassettes/<yyyymmddhhmm>-<sessionId>.jsonl`. `dojo track --list` enumerates them.

### Schema (packages/config/src/index.ts)

- `DojoRc` (`.dojorc`): `currentDojo`, `currentKata`, `editor`, `progress[dojo] = { completed[], lastActive, introduced, kataIntros[] }`.
- `DojoManifest` (`dojo.json`): `name/version/description/test`, `katas[] = { template, test?, name?, description?, difficulty(1-3)?, tags?, prerequisites? }`, `runner`, `author/homepage/repository`.
- Helpers the UI server can reuse directly: `readDojoRc`, `readCatalog`, `readDojoMd`, `resolveAllKatas`, `listDojos`, `loadConfig`, `findProjectRoot`.

### Web UI shell (apps/ui)

- **Wired backend** (`apps/ui/src/server/`): a Hono app (`app.ts`) mounted into TanStack Start via `src/routes/$.ts`, serving `GET /api/health`, `GET /.well-known/agent-card.json`, and `POST /api/a2a/jsonrpc` through `@a2a-js/sdk`'s `JsonRpcTransportHandler`. `executor.ts` is an `EchoExecutor` stub; `agent-card.ts` advertises a single `echo` skill with `capabilities.streaming: false` (SSE through Nitro unverified). `InMemoryTaskStore` only.
- **Wired frontend**: `src/routes/index.tsx` is a placeholder landing page.
- **Unwired course template** (`apps/ui/src/app`, `src/components`, `src/data`): a complete Next.js-style learning-course UI — sidebar layout with modules/lessons (`src/data/lessons.ts`, 20 MDX lessons in `src/data/lessons/`), video player + VTT transcripts (`src/data/interviews/`), components like `sidebar-layout.tsx`, `video-card.tsx`, `table-of-contents.tsx`, `next-page-link.tsx`, `breadcrumbs.tsx`, plus `(auth)` login/OTP pages. None of it is reachable from the TanStack router, and its content is placeholder self-help material — it is a design system + layout kit awaiting real dojo data.
- `apps/web` is the separate public site (dojocho.ai, TanStack Start + fumadocs) — out of scope but shares the stack.

### Gap summary

No route reads `.dojorc`, `dojo.json`, `JOURNAL.md`, or cassettes. The UI server has no notion of "the learner's project". The course template renders hardcoded data. The broker echoes. `dojo ui` cannot run from an installed CLI.

## Proposed Solution & Architecture

Three planes, all inside `apps/ui`, launched by `dojo ui` with the learner's project root as context.

```
┌─────────────────────────────  learner's repo  ─────────────────────────────┐
│  .dojorc     .dojos/<dojo>/{dojo.json,DOJO.md,katas/*/SENSEI.md,JOURNAL.md} │
│  .dojo/cassettes/*.jsonl     katas/<name>/solution.ts                       │
└──────────────┬───────────────────────────────────────────────┬─────────────┘
               │ fs read + chokidar watch                      │ writes
               ▼                                               │
┌──────────────────────── apps/ui Hono server ─────────────────┴───────────┐
│  Project API (new)                        A2A broker (exists, stubbed)   │
│   GET  /api/project/state                  POST /api/a2a/jsonrpc         │
│   GET  /api/project/katas                  GET  /.well-known/agent-card  │
│   GET  /api/project/katas/:name/briefing   HarnessExecutor per agent     │
│   GET  /api/project/journal                (replaces EchoExecutor)       │
│   GET  /api/project/cassettes[/:id]              │                       │
│   POST /api/project/actions/{start,test,note}    │ spawn/attach          │
│   GET  /api/events        (SSE)                  ▼                       │
│                                        claude / codex / gemini /         │
│                                        opencode / pi harness             │
└───────────────┬──────────────────────────────────────────────────────────┘
                │ fetch + EventSource
                ▼
┌──────────────────── TanStack Start React frontend ───────────────────────┐
│  /            dojo overview (DOJO.md, progress ring, module list)        │
│  /kata/:name  briefing (SENSEI.md), state, test results, journal notes   │
│  /journal     rendered JOURNAL.md                                        │
│  /sessions    cassette list  →  /sessions/:id transcript replay          │
│  /sensei      chat pane over A2A (message/send → message/stream)         │
└───────────────────────────────────────────────────────────────────────────┘
```

**Data flow, concretely:**

1. `dojo ui` (packages/cli/src/commands/ui.ts) resolves the learner's project root via `findProjectRoot()` (packages/config) and passes it as `DOJO_PROJECT_ROOT` in the child env. The UI server refuses to start without it (falls back to `process.cwd()` in dev).
2. The Hono app grows a **project API** module (`apps/ui/src/server/project/`) that imports `@dojocho/config` and reads `.dojorc` + manifests + journal + cassettes on request. It computes per-kata state the same way `packages/cli/src/state.ts` does — extract that state logic into `packages/config` (or a new `@dojocho/core`) so CLI and UI cannot drift.
3. A **file watcher** (chokidar on `.dojorc`, `JOURNAL.md`, `.dojo/cassettes/`) pushes invalidation events over `GET /api/events` (SSE). The frontend uses TanStack Query with SSE-driven invalidation — when the learner completes a kata in the terminal, the browser updates within a second. Verifying SSE through Nitro here also unblocks flipping `capabilities.streaming: true` in the agent card.
4. **Write actions** are a thin allowlist that shells out to the CLI binary (`dojo kata --start`, `dojo kata --test`, `dojo kata --note "..."`) rather than reimplementing mutations. Single writer, single source of truth; the CLI already refreshes cassettes and progress as side effects.
5. **Sensei chat** goes through the existing A2A plumbing: the frontend calls `message/send` (later `message/stream`) on `/api/a2a/jsonrpc`; a real `HarnessExecutor` (per-agent adapter, as sketched in apps/ui/README.md) replaces `EchoExecutor` and drives the learner's configured agent, which in turn runs `dojo kata` commands and emits protocol tags. The executor parses `<dojo:sensei>`/`<dojo:status>` tags out of agent output into structured A2A message parts so the UI can render them distinctly.
6. **Frontend** ports the course template into TanStack routes: `sidebar-layout.tsx` becomes the dojo shell, `lessons.ts`'s `Module/Lesson` types are replaced by manifest-derived `Dojo/Kata` view models (grouped by `tags` or numeric prefix), MDX rendering is reused for `SENSEI.md`/`DOJO.md`/journal, and `video-card.tsx`/VTT support is kept dormant for 0200's distilled courses (which will ship video + transcripts). Auth pages and placeholder content are deleted.

**Packaging:** `dojo ui` gains a production path — `apps/ui` builds to a Nitro node-server output bundled into (or downloaded by) the published `dojocho` package, so `dojo ui` works outside the monorepo. Dev mode keeps the current `pnpm dev` spawn.

## Candidate Feature Breakdown

- **0101 `project-api`** — Add `apps/ui/src/server/project/` Hono routes exposing read-only project state: resolved config, dojo list, active dojo manifest, per-kata state (done/current/locked via prerequisites), `SENSEI.md`/`DOJO.md` raw content, journal markdown, cassette index and single-cassette content. Server receives the project root via `DOJO_PROJECT_ROOT` from `dojo ui`. Depends on extracting kata-state derivation from `packages/cli/src/state.ts` into a shared package so CLI and UI compute identical state.

- **0102 `dojo-shell-ui`** — Wire the unwired course template into TanStack routes: sidebar shell from `apps/ui/src/components/sidebar-layout.tsx`, dojo overview page (DOJO.md + progress summary + kata list grouped by tag/prefix), kata detail page rendering `SENSEI.md` via the template's MDX/typography pipeline, breadcrumbs and next-kata navigation from `next-page-link.tsx`. Delete `(auth)` pages and placeholder lesson/interview data; keep video/VTT components dormant for 0200 output.

- **0103 `journal-view`** — Render `.dojos/<dojo>/JOURNAL.md` as a first-class page: parse the `## <kata>` sectioning produced by `packages/cli/src/journal.ts`, cross-link each section to its kata page, show per-kata notes inline on the kata detail page, and expose an "add note" affordance backed by the 0105 action endpoint.

- **0104 `session-history`** — Cassette browser: list `.dojo/cassettes/*.jsonl` with agent, session id, timestamp, and entry count; transcript replay view rendering normalized `{role, content}` entries (user / assistant / toolResult, tool-call chips for `toolCall` items) using the cassette schema from `packages/cli/src/tracking.ts`. Includes a "record now" action invoking `dojo track`. This is the raw-material viewer that 0300's analytics later enriches.

- **0105 `live-events-and-actions`** — SSE endpoint (`GET /api/events`) driven by a chokidar watcher on `.dojorc`, the active journal, and the cassettes dir; TanStack Query invalidation on the client. Plus the write-action allowlist (`POST /api/project/actions/{start,test,note,track}`) implemented as spawns of the `dojo` CLI with output captured and returned. Verifying SSE through Nitro here is the prerequisite for enabling A2A streaming.

- **0106 `harness-broker`** — Replace `EchoExecutor` (`apps/ui/src/server/executor.ts`) with real `AgentExecutor` adapters per harness, starting with one (opencode HTTP+SSE or claude, whichever proves simplest to attach headlessly), selected from the learner's configured agent. Parse `<dojo:sensei>`/`<dojo:status>`/`<dojo:prompt>` tags from agent output into structured A2A parts; add one skill per wired harness to `apps/ui/src/server/agent-card.ts`; flip `capabilities.streaming` once 0105 lands.

- **0107 `sensei-chat-ui`** — Browser chat pane speaking A2A JSON-RPC (`message/send`, then `message/stream`) against the 0106 broker: transcript with distinct rendering for sensei guidance vs. status vs. prompts, kata context header, and guardrails ensuring the UI offers no solution-revealing affordances. Sessions initiated here should land in cassettes like terminal sessions.

- **0108 `ui-distribution`** — Make `dojo ui` work outside the monorepo: build `apps/ui` to a Nitro node-server bundle, ship or fetch it with the published `dojocho` CLI, replace the `resolveUiDir()` monorepo walk in `packages/cli/src/commands/ui.ts` with a bundled-asset path, keep dev spawn as fallback, add `--port`/`--no-open` flags and a browser auto-open.

## CLI / Schema Surface Changes

- `dojo ui`: passes `DOJO_PROJECT_ROOT` (from `findProjectRoot()`) to the server; gains `--port`, `--no-open`; gains a built/bundled launch path (0108). No breaking changes.
- `dojo kata` / `dojo track`: no interface changes; invoked programmatically by 0105 action endpoints. Their stdout (protocol tags included) must stay machine-parseable — treat `packages/cli/src/format.ts` tags as a stable contract.
- **Shared state extraction**: kata-state functions (`findCurrentKata`, `findNextKata`, `kataState`, `completedCount` in `packages/cli/src/state.ts`) move to `packages/config` (or new `@dojocho/core`) consumed by both CLI and UI server.
- **Manifest (`dojo.json`)**: no required changes. Optional additive fields the UI can use if present: `katas[].estimatedMinutes`, dojo-level `modules` grouping (kata name → module label) so authors can control sidebar grouping instead of tag/prefix inference. Both must remain optional to avoid breaking existing dojos in `dojos/`.
- **`.dojorc`**: no schema change; UI is a reader. Timestamps on completion (`completedAt`) are desirable for progress charts but belong to 0300's telemetry decisions — flag, don't ship here.
- **Cassette format**: `{role, content}` entries per `packages/cli/src/tracking.ts` become a documented contract shared with 0300/0500; the UI renders it, must not fork it.
- New HTTP surface (localhost only): `/api/project/*`, `/api/events`, existing `/api/a2a/jsonrpc` + agent card.

## Dependencies on Other Epics

- **0200 course distillation** (downstream): distilled courses emit modules/lessons with video + VTT transcripts — exactly what the dormant `video-player.tsx`/`video-card.tsx`/VTT components render. 0102 preserves them; any `modules` manifest extension must be co-designed with 0200's output format.
- **0300 learning reviewer / telemetry** (downstream): consumes cassettes surfaced by 0104 and renders analytics *into* this web-view (progress dashboards, benchmark comparisons). 0104's cassette contract and 0105's event bus are its foundation.
- **0400 authoring toolkit** (peer): `dojo create`/`validate` authors will use the web-view as live preview; 0101's manifest rendering doubles as the validation UX target. No hard dependency either direction, but share the manifest-derived view model.
- **0500 registry & community** (downstream): local dojo pages here are the template for hosted dojo pages there; voluntary cassette submission flows start from the 0104 session browser.
- **Upstream dependency:** the tracking work (`packages/cli/src/tracking.ts`, `src/commands/track.ts`) is uncommitted; 0104/0105 need it landed first.

## Risks & Open Questions

- **SSE through Nitro is unverified** — apps/ui/README.md explicitly ships streaming disabled. If Nitro buffers responses in the `dojo ui` launch path, both 0105 live updates and 0106 streaming degrade to polling. De-risk first in 0105 with a spike.
- **Harness attachment is the hardest unknown (0106).** Driving claude/codex/pi headlessly from an executor — session lifetime, permissions prompts, auth — varies wildly per harness. Scope 0106 to one harness; the A2A abstraction exists precisely so others follow independently.
- **State duplication drift** if extraction (0101 prerequisite) is skipped and the UI reimplements kata-state logic. Treat extraction as blocking.
- **Local security**: the action endpoints spawn a CLI with fs access, and the broker can drive an agent. Bind to 127.0.0.1, require a per-launch token minted by `dojo ui` and injected into the frontend, and keep CORS off wildcard once actions land (current `app.ts` sets `Access-Control-Allow-Origin: *`).
- **Template license/provenance**: `src/app` resembles a commercial Tailwind template (Compass assets referenced in `src/data/lessons.ts`). Confirm the components in `src/components` are clean-room (apps/ui/README.md claims original work for the server; verify the same for the template) before shipping publicly.
- **Two frontends in one app**: TanStack routes (`src/routes`) vs. Next-style `src/app` tree. 0102 must fully migrate, not straddle — the `src/app` directory should be deleted at the end of 0102.
- **Open**: does the web-view become the *primary* kata surface long-term (embedding an editor, contradicting "you type in your editor"), or stay a companion? Recommendation: companion until 0300 data says otherwise.
- **Open**: multi-dojo projects — `.dojorc` has one `currentDojo`; does the UI allow switching (implies a write action mutating `.dojorc`)? Proposed: yes, via `dojo` CLI passthrough, in 0105.
- **Open**: cassette privacy in the UI — sessions may contain unrelated repo content; the session view (0104) should carry the same "review before sharing" warning `dojo track` prints.

## Success Metrics

- **Adoption:** ≥40% of active learners (repos with a `.dojorc` touched in the last 7 days) launch `dojo ui` at least once per week; measurable locally once 0300 telemetry lands, via opt-in ping before that.
- **Utility:** median time-to-answer for "what's my next kata / what did I learn last week" drops from grep-the-dotfiles to <5 seconds (qualitative, dogfooding on `dojos/effect-ts`).
- **Liveness:** UI reflects a terminal-side kata completion in <2s via 0105 events (automated e2e in `e2e/`).
- **Broker reality:** one full Socratic exchange (learner question → sensei response with `<dojo:sensei>` rendering) completes in the browser against a real harness, and the session appears in `.dojo/cassettes/`.
- **Portability:** `dojo ui` works from a globally installed `dojocho` in a repo outside the monorepo (0108 acceptance test).
- **No regression:** kata flow in the terminal is byte-identical with the UI running (protocol tags untouched; existing `packages/cli/test/smoke.test.ts` and e2e suites stay green).
