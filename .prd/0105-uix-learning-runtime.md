# 0105: Connect the local learning application to UIX

Parent: UIX adoption (0100).
Status: in progress on `feat/0105-uix-learning-runtime` in `.worktree/uix-0105`. Initial baseline is verified main `c0173fd`; integrate verified 0104 before shipping this slice.

Goal: replace the local dashboard, kata workspace, editor, tests and chat presentation with the approved shared UIX components while retaining the real services, files, checks, progress, canonical lesson/session URLs and agent conversations.

The existing host remains responsible for course discovery, workspace/session selection, snapshots, SSE messages, saves/resets/checks, progression, tools/permissions/questions and model capabilities. Production must not import fixture learner pages or invent course metrics, agents, model names or profile identities. Preserve the mounted editor across test/chat changes, native file lifecycle, undo, references, language APIs and JSDoc. Account/content settings keep their distinct contexts and shared panel behavior.

First bounded step: restore the local host's type gate before changing its runtime UI. A fresh frozen installation completed in 21s. The config and agent packages require their declared build outputs before host types can resolve; after those builds, the clean baseline reproduces six errors: authoring learner-fixtures/learner-response each have provider-utils SchemaSymbol identity differences across Zod 4.6.5/4.6.7 peers; teaching-markdown has three HAST ElementContent incompatibilities; UIX native OpenAPI has a Shiki 4.4.3/4.5.0 highlighter incompatibility. Do not cast away these mismatches or suppress checks. Align compatible existing dependencies and validate actual teaching Markdown output.

The remaining steps are controlled production shell/dashboard, actual lesson/editor/results adapters, actual chat/composer adapters, and isolated runtime/browser/installed-package acceptance. A type repair alone does not complete 0105.

References: `docs/architecture/uix-production-adoption.md`, `docs/architecture/course-layout-production.md`, `docs/architecture/stable-agent-journey.md`; `packages/ui/src/routes/index.tsx`, `components/code-editor.tsx`, `server/lesson/service.ts`; UIX `components/app-shell.tsx`, `containers/agent-chat.tsx`, `containers/editor.tsx`, `components/editor-test-results.tsx` and `containers/assistant-home.tsx`.

Initial gate: frozen installation; config/agent builds; UI/UIX types; teaching-markdown and relevant service/authoring tests; UIX units; affected application builds and native OpenAPI/browser checks if their dependency graph changes. Runtime acceptance must use an isolated real course/server, actual file/check/session calls and the production UI, with local scripted inference distinguished from live teaching quality. Existing main Playwright tests often assume a mutable dojo.td session and skip if absent; they are not sufficient isolated evidence. Reuse the existing authoring/OpenCode browser fixture and installed CLI lifecycle where applicable. No paid model call is needed for the dependency repair.

Observe results directly through test output, browser probes, file contents and installed artifacts. Preserve all concurrent root audit changes and retain legacy installations/readers until parity is proven.

## Type prerequisite checkpoint

Aligned the UI/UIX Shiki 4.5 integrations and deduplicated compatible Zod 4 peer contexts to 4.6.7 in the lockfile. Existing Zod manifest ranges are retained; no new library was added. Parsed HTML fragments now admit only actual element/text/comment children instead of root-only MDX declarations. UI/UIX types pass, all 11 teaching Markdown tests pass, and UIX units pass (50 at the pre-0104 base).

A broader host unit probe found prerequisites that were not satisfied by config/agent builds alone: authoring-handoff requires built CLI output, and Nitro close requires built authoring output. It also found the old MynaUI policy test banning every Lucide import across UIX, which already intentionally includes the approved copied avatar/control components. Verify that failure against the unchanged baseline and resolve the obsolete ownership policy during presentation adoption/retirement rather than changing the approved icon design to satisfy it. Do not claim the whole host suite passes yet. Full builds and isolated runtime gates remain required before 0105 is complete.
