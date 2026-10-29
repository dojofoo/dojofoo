# dojofoo

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
