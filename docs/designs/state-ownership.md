# State ownership

*   **Author:** tomsiwik
*   **Status:** Brief
*   **Date:** 2026-11-07

A survey of the repository on 2026-11-07 found about 130 implicit state machines: values that move through a few states, with their transitions spread over handlers, effects, files and flags. Only a few are explicit: the session lifecycle reducer `transition()` (`packages/ui/src/server/agent-session/lifecycle.ts:32`), the editor tabs reducer `updateTabs` (`packages/uix/src/lib/workspace-tabs.ts:7`), the video scrub switch and some decision tables (`decidePanel`, `verdict`, `chatFailure`).

Most of the bugs the survey confirmed come from four habits, and a fifth makes the browser a source of truth. The fixes for the worst of them are separate pull requests (#235, #236 and the follow-ups for the install check, stuck sessions, the lesson page and the CLI). This brief proposes rules so the habits stop producing new ones.

## Problem

### 1. One fact, several copies that drift

*   **Turn status.** Eve owns a session's turn state. The UI server keeps a copy as `lifecycle.status` in `.dojo/agent-sessions.json` and updates it from hooks that report once (`packages/harness/src/lifecycle.ts:29-75`). A lost report left a record "working" forever, which also kept its agent host from ever stopping.
*   **Selected coding agent.** It is resolved from `runtimes.json`, `$DOJOFOO_HOME/settings.json` and the installed executables (`packages/config/src/runtime.ts:30-77`). The client then keeps its own copies: the agent list hook, `AgentChat`'s selected agent and the history rows. Running hosts keep the agent they started with.
*   **Model and effort.** These are stored in four places: `runtimes.json` (`models`, `efforts`), the session record, Kyoshi's `runtime.json` and the agent's native default. The model menu kept a fifth copy, which showed a level the new model doesn't offer after a switch (fixed in #235).
*   **Learner progress.** It lives in `.dojorc`, or in `.dojo/config.yaml` plus each course manifest's `progress`. Both hold `currentKata` and `lastActive`, and both hold `completed[]` and `lessons.status` (`packages/config/src/index.ts:103-115`, `:438-471`).
*   **Controlled components.** Several uix components write their inner copy even when a prop controls the value: `model-picker.tsx`, `app-shell.tsx` and `command-menu.tsx`. `size-context.tsx` shows the safe rule: a controlled component never writes its inner copy.

### 2. Shared files rewritten without a lock

*   Learner progress is rewritten with plain `writeFileSync` and no lock (`packages/config/src/index.ts:438-471`). Four processes write it: the CLI, the CLI run by a coding agent, the UI server itself, and CLI processes the UI server spawns. A stale writer reverts the others' changes.
*   `runtimes.json`, `web.json` and `.dojo/interactive.json` are also read, modified and rewritten by more than one writer.
*   The session records' write queue is a module variable (`packages/ui/src/server/agent-session/records.ts:19-25`). Its temp file is named after the process id only (`:28`). The server's own comments say route modules can be loaded twice, and the other registries are process-global for that reason; this queue is not.

### 3. Notifications sent once, with no catch-up

*   The turn hooks above reported once and swallowed errors.
*   Page notifications (`packages/ui/src/server/agent-session/notify.ts:18-24`) are sent only to sockets that are open at that moment. A page that reconnects (`packages/ui/src/hooks/use-page-socket.ts`) doesn't ask what it missed, so "Running lesson checks…" could stay on screen.
*   The CLI sends ordinary telemetry events once, with a 1.5 s timeout. Course registrations go through an outbox that retries on every command (`packages/cli/src/telemetry.ts:29-185`).

### 4. One busy and error slot for unrelated actions

*   **Lesson page.** One `busy` string and one `error` hold about 13 different failures (`packages/ui/src/routes/index.tsx:240-241`). Unrelated successes clear the error.
*   **Authoring page.** `busy` holds 11 labels and acts as a lock that only the buttons' `disabled` props enforce (`packages/ui/src/routes/authoring_.$draftId.tsx:88-89`). A long evaluation blocks saving.
*   **Onboarding wizard.** One `error` holds polling, course loading and finishing failures (`packages/ui/src/components/local-onboarding.tsx:58-63`).

### 5. Browser storage as a source of truth

`localStorage` holds state the app treats as its own. Every copy is per browser, invisible to the server, and can disagree with the others:

*   **Theme mode.** The `dojofoo.theme` key, written from three places (`packages/ui/src/routes/__root.tsx:23-27`, `packages/ui/src/routes/avatar.tsx:65`, `packages/ui/src/components/ui/theme-toggle.tsx:24`).
*   **Sidebar fold.** `packages/ui/src/hooks/sidebar-state.tsx:10-13`, read in an effect, so the sidebar shows open before it folds.
*   **Interface and content preferences.** `packages/uix/src/lib/ui-preferences.ts:47-79` and `packages/uix/src/lib/content-preferences.ts:35-42`.
*   **Video position.** `packages/uix/src/containers/video-stage.tsx:163-175`.
*   **Selected workspace.** `dojofoo.workspace` is read (`packages/ui/src/routes/index.tsx:299`) but nothing writes it.

## Goals

*   Every piece of state has one owner that writes it. Everything else reads it or derives from it. The declaration names the owner in a comment.
*   What a page shows (the course, lesson, conversation, settings section or panel) lives in its URL and is read through the router. Addresses are paths, not query parameters, where the state names a place.
*   Client state that several components share lives in one store per concern, for example a Zustand store, instead of copies in each component.
*   Nothing is kept in `localStorage` or IndexedDB. Preferences are saved by the UI server (for example in `$DOJOFOO_HOME/settings.json`) and read through its API, so every tab and every launch sees the same value.
*   Each shared file on disk is written through one function. That function locks across processes and writes atomically (a temp file, then a rename).
*   Any copy of another system's state can be rebuilt from the source, not only from one-time notifications. That covers Eve's turns and the page's view of checks, held reports and guard notices. The copy is rebuilt when a page reconnects, when a host starts, and periodically.
*   Each action owns its own pending state and error. A page keeps a shared error only for loading the page.

## Non-goals

*   No state-machine framework. The agent runtime design kept the earlier decision not to add one (`docs/designs/agent-runtime.md:133`). Where a machine is worth making explicit, a plain reducer like `transition()` is enough. A small store library such as Zustand is a store, not a machine framework, and is in scope.
*   No rewrite of the uix components. A component's controlled and uncontrolled copies are fixed when that component is next changed.

## Approach

1.  **One owner per fact.**
    *   **Turn status.** Eve is the source. The record is a cache that a periodic check repairs. Idle stop decides "busy" from Eve rather than from the record.
    *   **Selected agent.** One resolver in `@dojofoo/config`, read through one API. The client's extra copies go away. An agent change reaches running hosts only through the switch protocol.
    *   **Model and effort.** The session record owns a conversation's choice. `runtimes.json` holds only the defaults for new conversations, and the same patch writes them.
    *   **Progress.** One store per workspace layout. The second copy is derived from it, or removed.
    *   **uix components.** Follow the `size-context.tsx` rule.
2.  **Locked writes.** Add `withFileLock(path, change)` to `@dojofoo/config`, with stale-lock detection like `packages/ui/src/server/server-lock.ts`. Every writer of the progress files, the manifests' progress, `runtimes.json`, `web.json` and `interactive.json` goes through it. Make the records queue process-global like the other registries.
3.  **Catch-up after a gap.** A page that reconnects asks the server for its current state: a check in progress, held or sent reports, and guard notices. Notifications carry ids, so a repeated one changes nothing.
4.  **Per-action state.** Replace page-wide `busy` and `error` with per-action pending and error state, held for example in a small `useAction` hook.
5.  **URL first, then stores.** Move navigational state into routes: the open conversation and the authoring view become path segments rather than `?session=` and component state. Shared client state that isn't a place (the lesson page's checks, the selected agent and its models, the sidebar fold) moves into Zustand stores, one per concern, fed by the server's API and socket.
6.  **Preferences on the server.** Add a preferences endpoint to the UI server backed by `$DOJOFOO_HOME/settings.json`. Theme mode, interface and content preferences, the sidebar fold and video positions move there; the server renders the saved theme, so no page loads in the wrong mode. Remove the unused `dojofoo.workspace` read.

## Open questions

*   In the YAML layout, which progress store is the source: `.dojo/config.yaml` or the course manifests?
*   Advisory lock files are enough for the CLI and the UI server on one machine. Do any writers run where advisory locks don't hold?
*   Should the host port's idempotency store survive a restart?
*   Once accounts exist, which preferences follow the person (cloud) and which stay with the machine?
*   Video positions are per lesson video: should they live with the workspace's progress instead of the global settings?

## Next step

Write the design for locked writes first. It is the smallest change with the widest effect: learner progress has four writers today, and a lost write there loses a learner's progress. Preferences on the server come next, since they remove every use of browser storage at once.
