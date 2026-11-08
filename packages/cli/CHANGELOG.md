# dojofoo

## 0.6.1

### Patch Changes

- 48af084: Sign a coding agent in from the composer. Pi and Codex list the accounts they can use and sign in to one: a browser sign-in shows its page (or a code to enter), an API key is asked for in a password field. The agent saves the login where it keeps its own and renews it itself. An agent signed in to nothing shows "Sign in to <agent>" where the model menu would be, the model menu has a "Sign in…" row, and a failed turn that needs a login offers the same sign-in. A lapsed Pi login now reads "Sign in to GitHub Copilot again".

  The harness's sign-in is Pi's interface: `agentAccess(agent)` from `@dojofoo/harness/adapters` lists providers as Pi's model runtime does and logs in through Pi's `AuthInteraction` (events to show, questions to answer). Pi runs its own login; Codex runs its app-server's (`account/read`, `account/login/start`). The session API serves it under `/agents/{id}/providers` and `/logins`, with the page's launch token. Protocol carries Pi's sign-in types in their JSON form, and the harness build fails if they stop matching Pi's.
- bf7cd76: OpenCode signs in from the composer too, through Sensei's OpenCode server: any of its providers takes an API key, and the ones with a sign-in of their own (ChatGPT, GitHub Copilot, GitLab, xAI, …) open it in the browser after their questions (GitHub.com or Enterprise, say), pasting back a code where the page shows one. OpenCode saves the login in the user's data folder, which Sensei's OpenCode reads. A provider whose key needs more than the key (Azure's resource name) points to OpenCode's own terminal. The sign-in dialog's fields get an outline outside the onboarding.
- Updated dependencies [f68cf54]
  - @dojofoo/agents@0.2.2
  - @dojofoo/config@0.3.3

## 0.6.0

### Minor Changes

- f08214c: The account menu opens pages of their own: Settings at /settings/theme and /settings/profile, Profile at /me, which shows the learner's courses with their progress and the courses they finished as certificates. A check card no longer says "Sensei saw this".

### Patch Changes

- 1af0002: Every coding agent gets the same model menu. A long model list can be searched, and a model the agent can't run now is listed last, muted, with what to do ("Sign in to GitHub Copilot again: run pi, then /login", "Not in your GitHub Copilot plan"). A conversation without a model no longer shows the first model as chosen, and a model without a default effort of its own shows Default until a level is picked.
  
  Pi starts a new conversation on the default model in its settings.json while that model can run, else on the first one that can, instead of on a model whose expired sign-in Sensei can't renew. OpenCode lists its models by name with their reasoning variants as efforts, from the copy Sensei runs, and a new conversation names the model OpenCode picks itself. Kyoshi's conversations start on the same configured model as Sensei's.
  
  Onboarding shows an agent found on this machine that Dojo can't teach through yet (Cursor, Antigravity) as not supported instead of offering it.
- c33d2eb: Setting up Claude Code adds dojofoo's permissions to `.claude/settings.json` instead of replacing the file, so your own settings stay.
- 55cf41b: Lesson checks now run without blocking the local UI server, so other requests, sockets and agent streams keep answering while a check runs.
- f08214c: The authoring footer drops Evaluation settings and its dialog; Trial is its main button.
- 3e499bf: A lesson checked in the UI counts for its own course, a finished course stays finished when it is checked or opened again, and starting it over after a reinstall begins a new run.
- f08214c: The model menu shows only an effort the chosen model takes, so a level picked for another model no longer sticks after a switch, and the effort row shows no selection when none applies. A conversation whose effort is cleared by a model change also clears the workspace's saved effort, so the next conversation starts at its model's default.
- 6458235: `add` reads the security checks of the exact version it downloaded, which the course API now runs first when it hasn't checked that version, asks before installing a version no check is for, checks with telemetry off too, and says so when the checks are unavailable.
- f08214c: Kyoshi's composer has the same model and effort menu as Sensei's: Kyoshi runs on the conversation's model and effort from the next turn, and a new conversation starts on the workspace's last choice.
- 68d9304: On a kata lesson, only the learner's own Check becomes a check card, and unsaved code is no longer lost: leaving the lesson asks first, and a refreshed lesson keeps it.
- f08214c: Sensei's model menu shows each Claude Code model's default effort, picks the effort with the shared segmented control, drops the keyboard hints and Claude Code's "(recommended)" label; a cancelled question says so in the brand color and mutes its options.
- 37b5b50: A conversation no longer stays busy forever when the end of its turn goes unreported, and a lesson's opening turn that already ran isn't sent again.
- c978a09: `dojofoo ui` always opens at dojo.localhost. When the Portless proxy was started without .localhost it stops and prints the command that restarts the proxy with it, instead of taking a dojo.<tld> name another project may use. `dojofoo ui --help` prints its flags instead of starting the UI.
- 941607e: `dojofoo ui` comes up when the shared Portless proxy serves other TLDs (e.g. `PORTLESS_TLD=td`): a proxy it starts also serves `.localhost`, and on a running HTTPS proxy without `.localhost` it uses `dojo.<tld>`, instead of timing out on a certificate the proxy refuses.
- 881c61f: Opening the UI while the same build of dojofoo already runs it, as `/kata` does, opens the running UI instead of replacing it, so its agent turns and evaluations keep going. A rebuilt or other version of the UI still replaces it, and a running UI started in another folder is named.
- Updated dependencies [1af0002]
- Updated dependencies [f08214c]
- Updated dependencies [3e499bf]
- Updated dependencies [f08214c]
- Updated dependencies [f08214c]
- Updated dependencies [f08214c]
  - @dojofoo/agents@0.2.1
  - @dojofoo/config@0.3.2

## 0.5.0

### Minor Changes

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
- ef7bae5: Sensei's model menu lists each model with its version and description, as the coding agent does (Claude Code through its Agent SDK), and lets the learner choose the model's effort.

### Patch Changes

- e9f028f: A question the agent cancelled says "× Cancelled" in its own footer instead of an error line under it.
- f52a74f: A kata course's sidebar lists its lessons like any other course: no expanding description, and titles without the folder's number.
  
  A lesson's address is its path, `/learn/<run>/<lesson>`; `/learn/<run>` opens the course's current lesson, and the old `?lesson=` address redirects.
- Updated dependencies [ea5f1db]
- Updated dependencies [ea5f1db]
- Updated dependencies [ef7bae5]
  - @dojofoo/agents@0.2.0
  - @dojofoo/config@0.3.1

## 0.4.0

### Minor Changes

- 6207895: Run the local dashboard through the bundled Portless dependency, guide first-time setup with automatic agent discovery, and retain workspace and course progress through stable course and session routes.
  
  Share the authoring sidebar with Storybook, support chapters and lesson renaming, scaffold course README.md and chapter/lesson INTRO files from templates, and add dashboard course deletion menus. Reuse the shared navigation, scrolling, card editor, slide presentation, and error-page components across the local UI and website.
  
  Collapsed sidebars hide full-size cards and custom file trees while retaining their expanded state; authoring keeps the shared icon rail.

### Patch Changes

- Updated dependencies [6207895]
- Updated dependencies [af900ba]
  - @dojofoo/config@0.3.0
  - @dojofoo/authoring@0.1.2

## 0.3.0

### Minor Changes

- f1942cd: Run `npx dojofoo` in a terminal to start learning: it sets the folder up first when needed, then opens the local lesson UI, and takes the same options as `ui` (`--no-open`, `--background`, `--port`, `--authoring` and the others). Without a terminal – in scripts, CI or pipes – it still prints the help. `npx dojofoo ui` keeps working for scripts and agents, including `ui prompt` and `ui --skill`.
- b55d1a4: Relicense under the Functional Source License 1.1 with an Apache 2.0 future license (FSL-1.1-ALv2). Each release may be used for any purpose except a competing commercial product or service, and becomes available under Apache 2.0 two years after its release. Versions released before this change remain available under MIT.

### Patch Changes

- 9394f74: Align shared highlighter and schema dependency types before adopting UIX in the local learning application, and preserve valid HTML fragments in teaching Markdown hovers.
- f31107e: Allow release packaging to fetch locked agent dependencies missing from the build cache.
- 9b85745: New courses start in trial: installable by their repository, left out of the catalog until they're enabled (`bun scripts/enable-course.ts owner/repository` in apps/api). Each registered version gets Dojo's security checks, and a scheduled workflow adds Cisco's skill-scanner; `add` reads them before installing – a failed check stops it, a warning asks first (`--yes` answers). Manifests can say `private: true` to stay unlisted (`marketplace: false` still works).
- bf60239: Restore the audited Eve 0.81.1 runtime build, preserve upstream sign-in parking,
  and reduce the bundled Eve patch surface without changing the Dojofoo agent API.
- bed2241: Use the shared UIX workspace for interactive courses with persistent native Sensei conversations, current-step context and model selection while retaining saved answers and course materials.
- d5c1c90: Show real lesson check results in the shared UIX table, including failure output and source references. Collect fresh Vitest JSON reports across reporter versions and launch OpenCode ACP without the removed directory flag.
- 510502c: Use shared UIX conversation and tool presentation. Preserve authored question answers in native tool results and honor native approval choices and rejected-tool outcomes.
- e653da4: Use the shared UIX editor, tabs and actions for local lessons. Preserve native file models and undo history across test views, and save the focused editor's current value once per keyboard shortcut.
- b73e8c7: Color the lesson editor's visible lines right away, even when a busy page postpones Monaco's idle-time highlighting.
- 422048a: Install kata courses whose lessons have no explicit `name` or `id`: each lesson takes its folder's name, as the rest of the CLI already does, instead of failing with "Each installed lesson needs a stable ID".
- f19a55f: Use the shared UIX lesson workspace, material settings, navigation and composer with real agent sessions and native model selection. Keep large model catalogs reachable within scrollable dropdowns.
- 2e98a34: Show Log in and Log out in the account menu only when the host provides them. The local UI has no accounts, so its menu now ends at the theme row instead of offering both placeholder actions.
- b6e09a7: Render the local course library through shared UIX presentation while preserving real installation discovery, workspace/session choices, native links and empty/error states.
- bed2241: Render local lesson materials and authoring documentation through Portless by preserving the forwarded browser origin. Pre-bundle the lazy diagram renderer for stable development navigation.
- bed2241: Keep the local UI at dojo.localhost when a shared Portless proxy uses another domain, without replacing the website's route. The repository UI script uses the same launcher. Follow the proxy's configured HTTP or HTTPS transport without a package-install certificate-trust step.
- bf44267: Render native Fumadocs documentation inside the shared UIX frame, preserve host navigation and compiled heading metadata, and align documentation stories with the same controlled presentation.
- c0173fd: Use shared UIX presentation for the public website, preserve real navigation and course data, and isolate the illustrative learning preview from learner controllers. Add native button links and handle document transition interruptions through the shared document bootstrap.
- bed2241: Show saved authoring findings in the shared Pages Evals view, with filtering, evidence, next steps and judge limitations. Keep the existing evaluation action available and retain editor drafts and undo history when switching views.
- bed2241: Use the Pages sidebar for authoring files, nested folders and evaluation status. Keep file filtering, course and lesson renames, and new-lesson actions connected to the existing authoring handlers.
- bed2241: Use the shared Pages lesson checklist for authoring readiness, preserving real preflight findings and omitting empty sections.
- bed2241: Use the shared UIX workspace, editor tabs and Pages composer for authoring. Keep the editor mounted when conversation history reloads and send queued requests through the existing native queue.
- bed2241: Use coding-agent and agent-owned model controls in the shared Pages composer and local kata workspace. Preserve unsaved code and questions through agent changes, retain the previous conversation on failure, and avoid an automatic model turn when selecting a different agent.
- bed2241: Create independent course drafts from the local dashboard and resume their native authoring conversations. Keep each locally managed draft on its own Eve runtime while preserving explicitly configured fixed-owner hosts.
- bed2241: Use the shared Storybook avatar and profile fields in local General settings. Account editing stays disabled until an account integration is available.
- bed2241: Connect interactive courses to the shared coding-agent and model pickers. Retain each agent's native conversation and model, preserve course progress and typed questions, recover unused selections without automatic turns, and ignore stale refreshes after a switch.
- bed2241: Restore the Pages learner course card and Dashboard breadcrumb, show installed course metadata, and add the local account menu and Settings route with shared appearance controls.
- bed2241: Use the shared Pages Explore view locally and keep the two draft starter-course shells available from the dashboard without creating installations or agent sessions.
- bf6314c: Share UIX providers and library-owned assets across application hosts and Storybook. Require application-supplied prepared OpenAPI data and keep preview content behind story adapters so the bundled local UI can adopt the shared presentation safely.
- bed2241: Use the shared account-menu dropdown for trial and evaluation selections, preserve manual model IDs, and theme the evaluation dialog with UIX surfaces. Keep the composer's attachment control visible but disabled when its connection cannot accept files.
- Updated dependencies [9b85745]
- Updated dependencies [b55d1a4]
  - @dojofoo/config@0.2.0
  - @dojofoo/authoring@0.1.1

## 0.2.1

### Patch Changes

- Include the private agent, authoring runtime and config in the single CLI artifact.
  Install and verify the CLI without unpublished workspace packages or local links.

## 0.2.0

### Minor Changes

- 5067020: Serve the durable local workspace, dojo run, harness session, and event index
  through the bundled lesson UI's ephemeral Hono control plane. List unfinished
  courses across indexed workspaces and continue any of them from the lesson UI.
  Prefer a stable Portless URL when available, recover automatically through a
  direct localhost server when Portless fails, and expose explicit fallback and
  port controls with installation and troubleshooting documentation.
- Publish the agent and authoring runtime required by CLI installations. Support
  editable master courses, portable Kyoshi definitions, chapter-based course
  material, isolated lesson trials, and durable authoring question/queue recovery.

### Patch Changes

- Updated dependencies [5067020]
- Updated dependencies
  - @dojofoo/config@0.1.0
  - @dojofoo/authoring@0.1.0

## 0.1.0

### Minor Changes

- f0a8bc7: Add a local SQLite index for workspaces, dojo runs, harness sessions, and lifecycle events.

## 0.0.5

### Patch Changes

- cd3289f: Add first-class author, language, framework, and topical tag metadata to dojo manifests.

  Move the first-party courses into independent GitHub repositories and document their canonical repository install sources.

- Updated dependencies [cd3289f]
  - @dojofoo/config@0.0.7

## 0.0.4

### Patch Changes

- 06c3ffa: Persist external dojo registration attempts and retry them on later CLI commands until the registry acknowledges them.

## 0.0.3

### Patch Changes

- 34f6429: Move all first-party packages, dojos, registry metadata, and telemetry course IDs from the legacy `@dojocho` scope to `@dojofoo`.

  Fix the packed CLI release gate so it verifies the current package version instead of a hard-coded historical version.

- 68d6cdb: Install public GitHub dojos with `npx dojofoo add owner/repository` and update them from their recorded source with `npx dojofoo update owner/repository`.
- abd5be2: Add concise npm package documentation and complete package metadata for the dojofoo CLI and first-party dojos.
- Updated dependencies [34f6429]
- Updated dependencies [abd5be2]
  - @dojofoo/config@0.0.6

## 0.0.2

### Patch Changes

- d87d2e2: Publish the CLI as `dojofoo`, move first-party URLs to `dojo.foo`, and standardize project setup and generated agent commands on `npx dojofoo`.
- d87d2e2: Add the shared Fluid Functionalism UI package, course marketplace integration, and privacy-preserving course lifecycle metrics.
- 6007c56: Add project-aware TypeScript completions and diagnostics to the dojo web editor.
- Updated dependencies [d87d2e2]
  - @dojofoo/config@0.0.5

## 1.1.0

### Minor Changes

- 4e20588: Ship the production Dojo web UI inside the installable CLI, launch it without a monorepo checkout, and include machine-readable lesson checks with coverage support.

### Patch Changes

- Updated dependencies [4e20588]
  - @dojocho/config@0.0.4

## 1.0.1

### Patch Changes

- 5370f88: Fix `npm install -g dojocho` failing with `EUNSUPPORTEDPROTOCOL Unsupported URL Type "workspace:": workspace:*`. The 1.0.0 tarball on the npm registry contained the raw `workspace:*` dep specifier instead of the resolved version. Republishing via `pnpm publish` (auto-detected by `changeset publish` in this pnpm workspace) rewrites the protocol before upload.

## 1.0.0

### Major Changes

- Renamed package from `@dojocho/cli` to `dojocho`. The binary command is unchanged (still `dojo`). To migrate: `npm uninstall -g @dojocho/cli && npm install -g dojocho`.

## 0.1.1

### Patch Changes

- b94c97f: Deeper cli + agent connection, example cross-language pydantic project and hooks implementation
- 03a4b17: Add `dojo status` command and move orchestration to command files

  - `dojo status` outputs structured state (`no-dojo`, `intro`, `no-kata`, `kata-intro`, `practicing`, `complete`) with dojo, kata, progress, and a `run:` directive for the next command
  - `kata.md` command file reads `dojo status` and follows the `run:` line — replaces verbose routing table with a 3-line file
  - Remove prompt injection logic (`!`dojo intro``, `!`dojo kata intro``) from `kata.ts` smart mode — CLI is now pure data
  - Remove `!`dojo intro``from`dojos/effect-ts/DOJO.md` — content files are pure content

## 0.1.0

### Minor Changes

- a339acf: Add `dojo intro`, `dojo kata intro`, and `dojo setup` commands

  - `dojo setup [--agent]` replaces `dojo --start` — scaffolds the project and configures coding agent integrations (claude, opencode, codex, gemini) with flag-based selection
  - `dojo intro` shows the active dojo's DOJO.md, offers switching when multiple dojos are installed, and marks the dojo as introduced
  - `dojo kata intro` shows the current kata's SENSEI.md briefing and marks the kata as introduced
  - `dojo kata` smart mode auto-chains intros: outputs `!\`dojo intro\``when dojo not yet introduced,`!\`dojo kata intro\`` when kata not yet introduced
  - Add `introduced` and `kataIntros` fields to `KataProgress` for tracking introduction state
  - Extract agent config into shared `AGENTS` map and `configuredAgents()` helper
  - `dojo add` and `dojo remove` now use `configuredAgents()` instead of hardcoded agent list, supporting gemini
  - Add smoke tests for CLI (21 tests, vitest)
  - effect-ts DOJO.md: embed `!\`dojo intro\`` for inline agent invocation

### Patch Changes

- Updated dependencies [a339acf]
  - @dojocho/config@0.0.3

## 0.0.3

### Patch Changes

- a7f8d35: fix: rollback on failed `dojo add` and respect user's package manager

  - Stage installs in a temp directory before writing to `.dojos/`. If dependency install fails, `.dojos/` is never touched.
  - Detect the user's package manager from `packageManager` field or lockfiles instead of hardcoding pnpm.
  - Use `pnpm pack` / `npm pack` (based on source PM) for local adds to natively resolve `workspace:*` deps.
  - Remove manual workspace dependency linking (`linkWorkspaceDeps`).

## 0.0.2

### Patch Changes

- f5f3b51: Fix workspace protocol in published package
- Updated dependencies [f5f3b51]
  - @dojocho/config@0.0.2
