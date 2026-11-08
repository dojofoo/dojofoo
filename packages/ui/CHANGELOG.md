# @dojofoo/ui

## 0.2.0

### Minor Changes

- f08214c: The account menu opens pages of their own: Settings at /settings/theme and /settings/profile, Profile at /me, which shows the learner's courses with their progress and the courses they finished as certificates. A check card no longer says "Sensei saw this".

### Patch Changes

- 1af0002: Every coding agent gets the same model menu. A long model list can be searched, and a model the agent can't run now is listed last, muted, with what to do ("Sign in to GitHub Copilot again: run pi, then /login", "Not in your GitHub Copilot plan"). A conversation without a model no longer shows the first model as chosen, and a model without a default effort of its own shows Default until a level is picked.
  
  Pi starts a new conversation on the default model in its settings.json while that model can run, else on the first one that can, instead of on a model whose expired sign-in Sensei can't renew. OpenCode lists its models by name with their reasoning variants as efforts, from the copy Sensei runs, and a new conversation names the model OpenCode picks itself. Kyoshi's conversations start on the same configured model as Sensei's.
  
  Onboarding shows an agent found on this machine that Dojo can't teach through yet (Cursor, Antigravity) as not supported instead of offering it.
- 55cf41b: Lesson checks now run without blocking the local UI server, so other requests, sockets and agent streams keep answering while a check runs.
- f08214c: The authoring footer drops Evaluation settings and its dialog; Trial is its main button.
- f08214c: The model menu shows only an effort the chosen model takes, so a level picked for another model no longer sticks after a switch, and the effort row shows no selection when none applies. A conversation whose effort is cleared by a model change also clears the workspace's saved effort, so the next conversation starts at its model's default.
- f08214c: Kyoshi's composer has the same model and effort menu as Sensei's: Kyoshi runs on the conversation's model and effort from the next turn, and a new conversation starts on the workspace's last choice.
- 68d9304: On a kata lesson, only the learner's own Check becomes a check card, and unsaved code is no longer lost: leaving the lesson asks first, and a refreshed lesson keeps it.
- 37b5b50: A conversation no longer stays busy forever when the end of its turn goes unreported, and a lesson's opening turn that already ran isn't sent again.
- 881c61f: Opening the UI while the same build of dojofoo already runs it, as `/kata` does, opens the running UI instead of replacing it, so its agent turns and evaluations keep going. A rebuilt or other version of the UI still replaces it, and a running UI started in another folder is named.
- Updated dependencies [f08214c]
- Updated dependencies [1af0002]
- Updated dependencies [f08214c]
- Updated dependencies [3e499bf]
- Updated dependencies [f08214c]
- Updated dependencies [f08214c]
- Updated dependencies [6458235]
- Updated dependencies [f08214c]
- Updated dependencies [f08214c]
- Updated dependencies [37b5b50]
- Updated dependencies [b374515]
  - @dojofoo/uix@0.2.0
  - @dojofoo/agents@0.2.1
  - @dojofoo/harness@0.2.1
  - @dojofoo/protocol@0.1.1
  - @dojofoo/config@0.3.2

## 0.1.1

### Patch Changes

- Updated dependencies [abe8e5f]
  - @dojofoo/uix@0.1.1

## 0.1.0

### Minor Changes

- ea5f1db: Sensei runs on Eve like Kyoshi, and every coding agent dojofoo offers runs both, after passing conformance. Each workspace has one coding agent, chosen in the composer.
  
  Sensei cannot write the solution file, and a change made while Sensei works is restored and named.
  
  Pages are addressed by draft and by course run, open their conversation by themselves, and list earlier ones in a history menu.
  
  Course evaluation runs in the UI on the draft's coding agent, with one consent switch, and `dojofoo kyoshi evaluate` is gone.
  
  The internal packages are `@dojofoo/harness` (formerly `@dojofoo/agent` and `@dojofoo/agent-api`) and `@dojofoo/agents` (formerly `@dojofoo/authoring`).
- ef7bae5: Sensei's model menu lists each model with its version and description, as the coding agent does (Claude Code through its Agent SDK), and lets the learner choose the model's effort.

### Patch Changes

- e9f028f: A question the agent cancelled says "× Cancelled" in its own footer instead of an error line under it.
- ea5f1db: Kyoshi runs on Eve 1.0 (`1.0.0-rc.1`), and its chat is Eve's own. `@dojofoo/agent` embeds the new release with its native compaction, terminal-stop, distribution and managed-project patches ported, and exports Eve's 1.0 entry points (`events`, `sessions`, `workflow`, `tanstack`, …) directly instead of through one-line wrappers.
  
  The agent API keeps its coding agents and sessions, and a session's conversation is now Eve's: `/api/v1/workspaces/{workspaceId}/sessions/{sessionId}/eve/…` forwards that session's own Eve routes to its host, and the authoring chat uses `useEveAgent` against it. Eve resumes the conversation, streams it, takes answers and cancels turns, so the AG-UI translation (`/runs`, `/events`, `/messages`), the resume logic and the legacy `/api/authoring/eve` routes are gone. A message sent while Kyoshi works steers the turn, as in Eve, instead of waiting in a queue. Page context travels as Eve's `clientContext`.
  
  A conversation Eve 1.0 can't continue (one an older Eve built, one that ended, or one on a coding agent that's no longer selected) is replaced by a new conversation instead of leaving the chat on an error. The old conversation stays on disk; the read-only viewer for pre-0.69 archives is removed, since Eve 1.0 no longer reads that format. Selecting another coding agent restarts the course's Kyoshi server, and a Kyoshi server that exits on its own starts again on the next request.
  
  Native harness processes stop with their server: a parked question resumes in the sandbox that owns its processes, and a local sandbox kills every process group its commands started, also when the server exits. Harnesses that only compact on their own (Codex, Cursor, Grok, FX) no longer fail a turn when Eve asks to compact. The retired ACP Kyoshi chat routes (`/api/authoring/workspace`, `/session`, `/introduction`, `/messages`, `/answers`) and the experimental local process host (`registerLocalProcessHost`, `requestLocalProcessHost`) are removed.
  
  Kyoshi runs on Claude Code through the official `@ai-sdk/harness-claude-code` adapter and its native login. FX runs on macOS without GNU coreutils: its adapter's one GNU-only `chmod` call is patched instead of requiring coreutils.
  
  A coding agent installs itself even when an earlier dojofoo left its shared install built by another pnpm version, which used to fail every Kyoshi turn on OpenCode with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. Kyoshi shows a conversation it found or started itself even when the page doesn't put it in the URL. A dojofoo or Kyoshi server whose output is gone (its terminal closed, or the UI that started it died) stops on SIGTERM instead of running at full CPU forever.
- f52a74f: A kata course's sidebar lists its lessons like any other course: no expanding description, and titles without the folder's number.
  
  A lesson's address is its path, `/learn/<run>/<lesson>`; `/learn/<run>` opens the course's current lesson, and the old `?lesson=` address redirects.
- Updated dependencies [ea5f1db]
- Updated dependencies [e9f028f]
- Updated dependencies [ea5f1db]
- Updated dependencies [ef7bae5]
- Updated dependencies [7f58b64]
  - @dojofoo/harness@0.2.0
  - @dojofoo/agents@0.2.0
  - @dojofoo/protocol@0.1.0
  - @dojofoo/config@0.3.1
  - @dojofoo/uix@0.1.0

## 0.0.5

### Patch Changes

- 6207895: Run the local dashboard through the bundled Portless dependency, guide first-time setup with automatic agent discovery, and retain workspace and course progress through stable course and session routes.
  
  Share the authoring sidebar with Storybook, support chapters and lesson renaming, scaffold course README.md and chapter/lesson INTRO files from templates, and add dashboard course deletion menus. Reuse the shared navigation, scrolling, card editor, slide presentation, and error-page components across the local UI and website.
  
  Collapsed sidebars hide full-size cards and custom file trees while retaining their expanded state; authoring keeps the shared icon rail.
- 01317a9: The Sensei's chat renders in uix: `components/streamed-message` (its activity panel, questions, checks and attachments), `components/chat-transcript`, `components/agent-question` and `components/ask-user-questions` moved from packages/ui, which keeps only what the app knows – Eve's tool calls and questions, its own lesson messages, the authored fragments it shows.
  
  Its Markdown is Streamdown (`components/chat-markdown`): headings, nested and task lists, quotes, tables, links, rules, emphasis and strikethrough in the chat's own type, fenced code in a CodeBlock, and `[highlight:L3-5]` as a chip that highlights those lines in the editor. Turns in the chat pane keep the column's spacing (`ui-as-chat__turns`), and ask-user tools keep `multiSelect`.
  
  Storybook's Components/Organisms/Sensei Chat shows the chat on the right of a lesson, as the app does: thinking, working, waiting, testing, checks that fail and pass, tool calls, questions with one answer, several, an open one and an answered one, line highlights, Markdown and a streaming reply. The Conversation story and Chat/Activity's stories of components the app doesn't use are gone; the Interactive lesson and the demo pages' chats (Pages/Dojo and others) render through the same renderer.
- af900ba: Prerender the landing, course catalog, and public documentation with cached documentation loader data and preload the primary navigation. Refresh the initial catalog snapshot from the API while retaining router view transitions and browser history. Rename the landing action to Start learning.
  
  Normalize sitemap URLs, let crawlers read authentication pages' noindex directives, and distinguish the SEO sandbox's next-build metadata from its deployment audit. Keep unpublished courses private.
  
  Regenerate the API reference after the dependency update and restore build compatibility with the updated React and Base UI types. Restore the SDK versions compatible with the existing chat and agent adapters and retain the audited runtime dependency pin.
- Updated dependencies [6207895]
- Updated dependencies [01317a9]
- Updated dependencies [01317a9]
- Updated dependencies [af900ba]
  - @dojofoo/config@0.3.0
  - @dojofoo/authoring@0.1.2
  - @dojofoo/uix@0.0.4
  - @dojofoo/agent@0.1.1
  - @dojofoo/agent-api@0.0.2

## 0.0.4

### Patch Changes

- Updated dependencies [d093333]
  - @dojofoo/uix@0.0.3

## 0.0.3

### Patch Changes

- 9394f74: Align shared highlighter and schema dependency types before adopting UIX in the local learning application, and preserve valid HTML fragments in teaching Markdown hovers.
- 2e98a34: Show Log in and Log out in the account menu only when the host provides them. The local UI has no accounts, so its menu now ends at the theme row instead of offering both placeholder actions.
- b6e09a7: Render the local course library through shared UIX presentation while preserving real installation discovery, workspace/session choices, native links and empty/error states.
- bf44267: Render native Fumadocs documentation inside the shared UIX frame, preserve host navigation and compiled heading metadata, and align documentation stories with the same controlled presentation.
- c0173fd: Use shared UIX presentation for the public website, preserve real navigation and course data, and isolate the illustrative learning preview from learner controllers. Add native button links and handle document transition interruptions through the shared document bootstrap.
- bf6314c: Share UIX providers and library-owned assets across application hosts and Storybook. Require application-supplied prepared OpenAPI data and keep preview content behind story adapters so the bundled local UI can adopt the shared presentation safely.
- Updated dependencies [9394f74]
- Updated dependencies [2e98a34]
- Updated dependencies [9b85745]
- Updated dependencies [b55d1a4]
- Updated dependencies [67df541]
- Updated dependencies [2e98a34]
- Updated dependencies [b6e09a7]
- Updated dependencies [bf44267]
- Updated dependencies [c0173fd]
- Updated dependencies [bf6314c]
  - @dojofoo/uix@0.0.2
  - @dojofoo/config@0.2.0
  - @dojofoo/authoring@0.1.1
  - @dojofoo/agent-api@0.0.1

## 0.0.2

### Patch Changes

- Updated dependencies [5067020]
- Updated dependencies
  - @dojofoo/config@0.1.0
  - @dojofoo/agent@0.1.0
  - @dojofoo/authoring@0.1.0

## 0.0.5

### Patch Changes

- Updated dependencies [cd3289f]
  - @dojofoo/config@0.0.7

## 0.0.4

### Patch Changes

- Updated dependencies [34f6429]
- Updated dependencies [abd5be2]
  - @dojofoo/config@0.0.6

## 0.0.3

### Patch Changes

- Updated dependencies [d87d2e2]
  - @dojofoo/config@0.0.5

## 0.0.2

### Patch Changes

- Updated dependencies [4e20588]
  - @dojocho/config@0.0.4
