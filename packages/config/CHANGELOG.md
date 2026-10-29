# @dojofoo/config

## 0.2.0

### Minor Changes

- b55d1a4: Relicense under the Functional Source License 1.1 with an Apache 2.0 future license (FSL-1.1-ALv2). Each release may be used for any purpose except a competing commercial product or service, and becomes available under Apache 2.0 two years after its release. Versions released before this change remain available under MIT.

### Patch Changes

- 9b85745: New courses start in trial: installable by their repository, left out of the catalog until they're enabled (`bun scripts/enable-course.ts owner/repository` in apps/api). Each registered version gets Dojo's security checks, and a scheduled workflow adds Cisco's skill-scanner; `add` reads them before installing – a failed check stops it, a warning asks first (`--yes` answers). Manifests can say `private: true` to stay unlisted (`marketplace: false` still works).

## 0.1.0

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

## 0.0.7

### Patch Changes

- cd3289f: Add first-class author, language, framework, and topical tag metadata to dojo manifests.

  Move the first-party courses into independent GitHub repositories and document their canonical repository install sources.

## 0.0.6

### Patch Changes

- 34f6429: Move all first-party packages, dojos, registry metadata, and telemetry course IDs from the legacy `@dojocho` scope to `@dojofoo`.

  Fix the packed CLI release gate so it verifies the current package version instead of a hard-coded historical version.

- abd5be2: Add concise npm package documentation and complete package metadata for the dojofoo CLI and first-party dojos.

## 0.0.5

### Patch Changes

- d87d2e2: Publish the CLI as `dojofoo`, move first-party URLs to `dojo.foo`, and standardize project setup and generated agent commands on `npx dojofoo`.

## 0.0.4

### Patch Changes

- 4e20588: Ship the production Dojo web UI inside the installable CLI, launch it without a monorepo checkout, and include machine-readable lesson checks with coverage support.

## 0.0.3

### Patch Changes

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

## 0.0.2

### Patch Changes

- f5f3b51: Fix workspace protocol in published package
