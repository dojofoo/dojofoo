# dojofoo

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
  - Remove prompt injection logic (`!`dojo intro`` , `!`dojo kata intro ``) from `kata.ts` smart mode — CLI is now pure data
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
