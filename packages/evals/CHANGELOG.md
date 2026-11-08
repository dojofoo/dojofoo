# @dojofoo/evals

## 0.0.6

### Patch Changes

- Updated dependencies [1af0002]
- Updated dependencies [f08214c]
- Updated dependencies [3e499bf]
- Updated dependencies [f08214c]
- Updated dependencies [f08214c]
- Updated dependencies [f08214c]
- Updated dependencies [37b5b50]
  - @dojofoo/agents@0.2.1
  - @dojofoo/harness@0.2.1
  - @dojofoo/protocol@0.1.1
  - @dojofoo/config@0.3.2

## 0.0.5

### Patch Changes

- ea5f1db: Sensei runs on Eve like Kyoshi, and every coding agent dojofoo offers runs both, after passing conformance. Each workspace has one coding agent, chosen in the composer.
  
  Sensei cannot write the solution file, and a change made while Sensei works is restored and named.
  
  Pages are addressed by draft and by course run, open their conversation by themselves, and list earlier ones in a history menu.
  
  Course evaluation runs in the UI on the draft's coding agent, with one consent switch, and `dojofoo kyoshi evaluate` is gone.
  
  The internal packages are `@dojofoo/harness` (formerly `@dojofoo/agent` and `@dojofoo/agent-api`) and `@dojofoo/agents` (formerly `@dojofoo/authoring`).
- ea5f1db: Kyoshi runs on Eve 1.0 (`1.0.0-rc.1`), and its chat is Eve's own. `@dojofoo/agent` embeds the new release with its native compaction, terminal-stop, distribution and managed-project patches ported, and exports Eve's 1.0 entry points (`events`, `sessions`, `workflow`, `tanstack`, …) directly instead of through one-line wrappers.
  
  The agent API keeps its coding agents and sessions, and a session's conversation is now Eve's: `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/eve/…` forwards that session's own Eve routes to its host, and the authoring chat uses `useEveAgent` against it. Eve resumes the conversation, streams it, takes answers and cancels turns, so the AG-UI translation (`/runs`, `/events`, `/messages`), the resume logic and the legacy `/api/authoring/eve` routes are gone. A message sent while Kyoshi works steers the turn, as in Eve, instead of waiting in a queue. Page context travels as Eve's `clientContext`.
  
  A conversation Eve 1.0 can't continue (one an older Eve built, one that ended, or one on a coding agent that's no longer selected) is replaced by a new conversation instead of leaving the chat on an error. The old conversation stays on disk; the read-only viewer for pre-0.69 archives is removed, since Eve 1.0 no longer reads that format. Selecting another coding agent restarts the course's Kyoshi server, and a Kyoshi server that exits on its own starts again on the next request.
  
  Native harness processes stop with their server: a parked question resumes in the sandbox that owns its processes, and a local sandbox kills every process group its commands started, also when the server exits. Harnesses that only compact on their own (Codex, Cursor, Grok, FX) no longer fail a turn when Eve asks to compact. The retired ACP Kyoshi chat routes (`/api/authoring/workspace`, `/session`, `/introduction`, `/messages`, `/answers`) and the experimental local process host (`registerLocalProcessHost`, `requestLocalProcessHost`) are removed.
  
  Kyoshi runs on Claude Code through the official `@ai-sdk/harness-claude-code` adapter and its native login. FX runs on macOS without GNU coreutils: its adapter's one GNU-only `chmod` call is patched instead of requiring coreutils.
  
  A coding agent installs itself even when an earlier dojofoo left its shared install built by another pnpm version, which used to fail every Kyoshi turn on OpenCode with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Kyoshi shows a conversation it found or started itself even when the page doesn't put it in the URL. A dojofoo or Kyoshi server whose output is gone (its terminal closed, or the UI that started it died) stops on SIGTERM instead of running at full CPU forever.
- Updated dependencies [ea5f1db]
- Updated dependencies [e9f028f]
- Updated dependencies [ea5f1db]
- Updated dependencies [ef7bae5]
  - @dojofoo/harness@0.2.0
  - @dojofoo/agents@0.2.0
  - @dojofoo/protocol@0.1.0
  - @dojofoo/config@0.3.1

## 0.0.4

### Patch Changes

- af900ba: Prerender the landing, course catalog, and public documentation with cached documentation loader data and preload the primary navigation. Refresh the initial catalog snapshot from the API while retaining router view transitions and browser history. Rename the landing action to Start learning.
  
  Normalize sitemap URLs, let crawlers read authentication pages' noindex directives, and distinguish the SEO sandbox's next-build metadata from its deployment audit. Keep unpublished courses private.
  
  Regenerate the API reference after the dependency update and restore build compatibility with the updated React and Base UI types. Restore the SDK versions compatible with the existing chat and agent adapters and retain the audited runtime dependency pin.
- Updated dependencies [6207895]
- Updated dependencies [af900ba]
  - @dojofoo/config@0.3.0
  - @dojofoo/authoring@0.1.2
  - @dojofoo/agent@0.1.1

## 0.0.3

### Patch Changes

- Updated dependencies [9b85745]
- Updated dependencies [b55d1a4]
  - @dojofoo/config@0.2.0
  - @dojofoo/authoring@0.1.1

## 0.0.2

### Patch Changes

- Updated dependencies [5067020]
- Updated dependencies
  - @dojofoo/config@0.1.0
  - @dojofoo/agent@0.1.0
  - @dojofoo/authoring@0.1.0
