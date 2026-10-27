# UIX production adoption and first-party starter courses

Status: active; 0101–0104 merged and verified; 0105 in progress in `.worktree/uix-0105` on `feat/0105-uix-learning-runtime`.
Date: 2026-10-26.
Baseline: `main` after PR #181, merge commit `4f31a76116d23c8d9613f77d80698b5dc766096b`.

## Goal statement

Make `@dojofoo/uix` the shared production design system for the public website, documentation, API reference, local learning application, and local authoring application. Replace their existing presentation with the approved Storybook compositions, connected to real routing, content, course state, files, and agent sessions. Keep Storybook and production on the same presentation components and transition primitives so that future design work ships through UIX rather than creating another interface implementation.

Deliver two installable, editable starter courses: **Create your own dojo**, which guides a person into an independent authoring workspace, and **How to run a dojo**, which explains the application and lets a person ask the Sensei practical questions. Their initial content is a clearly identified draft that can be authored and improved separately from this migration.

The goal is complete when a new user can discover a course on the new website, read the new docs, launch the packaged local application, complete an introductory learning step with the real Sensei, create and preview an independent authored draft, and resume their work, all using UIX. Existing learners must retain their installations, files, progress, sessions, and supported workflows.

## Product and technical boundaries

- UIX owns tokens, typography, icons, controls, compositions, layout, motion, and accessible interaction. Applications own routes, server loaders, persistence, permissions, runtime capabilities, and integration with their services.
- Storybook is the visual and interaction contract. Production services and existing behavioral tests are the behavior contract. A simulated story conversation is not evidence of a working Sensei integration.
- Keep TanStack Start/Router on the website and local application. Keep Fumadocs for production MDX and OpenAPI consumption, Elysia for the Course API, and the existing local Hono services. Restyling does not require replacing these runtimes.
- Keep the existing agent execution and session ownership. Preserve native messages, tools, approvals, questions, cancellation, resume, and errors. Do not introduce another transport, agent abstraction, or chat history store to connect the UI.
- `packages/ui` may remain the local application/server host. The objective is to retire its competing visual implementation, not rename every package or reorganize every component directory.
- Preserve supported URLs, installation formats, course IDs, and storage contracts. Treat schema or agent-runtime changes as explicit separate work if integration exposes a need.
- Keep the approved Atomic Design story groups. Extract shared presentation where it has a real consumer; avoid a repository-wide taxonomy rewrite.
- Do not add accounts, billing, member management, publishing services, or fictitious model capabilities to make preview controls appear functional. Connect supported capabilities; omit unsupported actions from production.
- Keep the landing learning illustration intentionally illustrative. Its Sam Altman identity, LLM course, simulated conversation, and fictional model selection must not become real user defaults or runtime capabilities.

## Verified starting point and prerequisites

Execution inventory: [production routes, service owners, UIX targets, and distribution boundaries](../docs/architecture/uix-production-adoption.md).

The UIX checkpoint is merged, but most page designs still use fixture-backed controllers. `packages/uix/README.md` explicitly describes the package as the successor preview rather than the live learning application.

| Area | Existing implementation | Migration consequence |
| --- | --- | --- |
| Website | `apps/web/src/routes`, server course loaders, marketplace data | Replace route presentation; retain server loading, SEO, real links, and data contracts. |
| UIX website | `packages/uix/src/web/website.tsx`, `site.tsx`, `catalog.ts` | Extract production compositions from the local-state demo router and synthetic catalog. |
| Documentation | Website catchall route and Fumadocs MDX/OpenAPI loaders | Render real MDX inside UIX layouts; do not replace it with the Storybook raw-Markdown projection. |
| UIX assets/content | Some production-looking modules import `apps/web` images, generated API data, and raw docs | Separate library assets from application-owned content and inject data at the application boundary. |
| Local learner | `packages/ui/src/routes/index.tsx`, canonical lesson routes and lesson service | Preserve the real controllers while replacing legacy shells and content views. |
| UIX learner/authoring | `packages/uix/src/pages/learner.tsx`, `course-authoring.tsx` | Move fixtures and simulated responses to stories; expose presentation props and events. |
| Interactive courses | Local interactive service supports present/question steps | Add a real Sensei connection and grounded course context for the starter courses. |
| Packaging | CLI packages and boots the local server | Validate the installed tarball outside the monorepo, including fonts, Monaco workers, media, and course assets. |

Release blocker: the post-merge [Release run](https://github.com/dojofoo/dojofoo/actions/runs/40383156955) failed with `sh: 1: bun: not found`. The web build invokes Elysia OpenAPI generation through Bun; `.github/workflows/release.yml` sets up Node but does not install Bun. Resolve this before treating the baseline as releasable.

Checkpoint evidence, not fresh migration acceptance: UIX unit tests 39 passed; UIX browser tests 77 passed; API tests 41 passed; OpenAPI validation covered 10 generated pages; clean-checkout build and Storybook build passed. Website browser tests were 7 passed / 4 failed. Those failures concerned changed headings/navigation and the asserted cache lifetime. The baseline review must decide the intended behavior before updating expectations. Web type checking also needs its MDX typing and Monaco virtual-module integration resolved. Do not carry these as permanent exemptions.

There is concurrent uncommitted course-audit/API/CLI/config work in the root checkout. Isolate migration changes, record the chosen base, and coordinate integration without staging, reverting, or overwriting that work.

Read the existing architecture records before changing runtime behavior:

- [Course layout and production boundaries](../docs/architecture/course-layout-production.md)
- [Stable agent journey and prior verification](../docs/architecture/stable-agent-journey.md)
- [Agent runtime review proposal](../docs/architecture/agent-runtime-consolidation.md)

These records contain both implemented behavior and unfinished proposals. Reconcile each affected claim against current code; this plan does not authorize adopting an unfinished runtime redesign.

## Target ownership and component contracts

UIX production modules must compile without Storybook aliases or imports from `apps/web`. Its current `~/` and `@/` imports need package-local resolution that cannot accidentally bind to a consuming application's `src`. Prefer relative imports or an explicitly configured package-internal convention; do not globally redirect the host application's aliases.

Expose focused public entry points for shared providers, website/docs layouts, workspace compositions, styles, and required assets. Do not make a barrel that eagerly imports every page, fixture, editor, and API document. Verify stylesheet scanning and asset resolution in both application builds and the packaged CLI. Keep server-only and browser-only modules separated.

| Layer | UIX responsibility | Application responsibility |
| --- | --- | --- |
| Provider | Theme tokens, typography, icon defaults, shared transitions and reduced-motion handling | Load persisted preferences safely; supply framework integration and initial SSR theme. |
| Website | Header/footer, landing sections, catalog cards, course-detail layout | Real TanStack links, route loaders, course DTO mapping, install commands, metadata. |
| Docs/API | Navigation layout, typography, search/palette presentation, API styling | Fumadocs source/MDX/TOC/search, prepared OpenAPI data, endpoint configuration. |
| Learner | Shell, sidebar, materials, editor, test results, chat and composer | Workspace/course/lesson selection, file buffers, checks, sessions, persistence, runtime capabilities. |
| Authoring | Draft browser, editor, preview, evaluation/report layouts | Actual authoring files/watchers, Kyoshi session, saves/conflicts, trial lifecycle and evaluation jobs. |
| Settings | Shared fields, dropdowns, helpful right column, responsive settings layouts | Supported settings, local persistence, service calls, capability-based visibility. |

Represent meaningful domain state at these boundaries: loading/empty/error; real user/course identity; selected lesson and progress; dirty/saving/conflicted files; running/completed/failed checks; messages/tools/approval/questions; available agents/models; disabled actions and actionable errors. Do not create a generic controller framework. Extract the smallest hooks and adapters needed by each route.

Story decorators should use the same production provider. Stories supply deterministic fixture data and callback adapters around the production presentation, including failure and long-content states. Keep generated OpenAPI and MDX ownership in the website; API stories receive prepared fixture data through the same renderer input as production.

## Surface migration and parity requirements

### Public website

Replace the homepage, marketplace listing, and course-detail presentation with their approved UIX equivalents. Preserve `/`, `/dojos`, `/courses/$source/$slug`, supported source aliases, query filters, direct navigation, back/forward, 404s, and canonical metadata. Do not silently change route names to match a demo router.

Map `MarketplaceCourse` into display props. Show only supported metadata: no fabricated ratings, completion rates, security verdicts, learning hours, or version claims. Preserve working installation commands and copy feedback. Keep “Get started” connected to documentation and “Start learning” connected to the command-line entry point, as approved.

Carry over the approved landing details: responsive 16:9 learning preview, Kata badge, three-mode carousel and click selection, pause on hover, unclipped brand halo, accessible titles, and short Sensei dialogue. Closed/open beta labels describe Interview/Authoring availability truthfully; this migration does not promise a new company interview backend.

### Documentation, API reference, and search

Use UIX navigation, typography, page spacing, controls, and palette around the actual Fumadocs document tree and MDX renderer. Preserve docs/authoring/developer content, anchors, code highlighting, callouts, TOC, mobile navigation, search, LLM-facing endpoints, sitemap, and social/OG routes.

Elysia remains the Course API specification source. Generate the spec and Fumadocs preparation from that source and render the native Fumadocs OpenAPI integration inside UIX styling. Do not maintain hand-authored endpoint copies or a second API reference implementation. Preserve the approved parameters, request bodies, cURL/response examples, and heading-to-endpoint spacing. The current design disables the playground, TypeScript definitions, and response-schema panel; the migration must not silently re-enable them.

### OpenAPI decision: reuse the Elysia plugin and Epicat's ownership pattern

Reviewed the sibling Epicat implementation on 2026-10-26. Its `apps/api/src/app.ts` mounts `@elysiajs/openapi` with `.use(openapi({ path: "/api/openapi", ... }))`. Its export script calls `app.handle(new Request("http://localhost/api/openapi/json"))` and writes the resulting JSON to docs content and SDK inputs. Its web client loader passes the docs-owned schema into the shared docs renderer. The application supplies generated MDX collections; the shared docs package owns the rendering composition.

Dojo already has this middleware/export pattern: `createCoursesApp()` mounts `@elysiajs/openapi` at `/api/v1/openapi`, and `apps/api/scripts/generate-openapi.ts` calls the app's `/api/v1/openapi/json` handler directly. This requires neither a listening server nor a request to a deployed API. Keep this path rather than adding a second generator or depending on a running API during builds.

The production data flow is:

```text
Elysia routes + validation schemas + detail metadata
  -> @elysiajs/openapi -> /api/v1/openapi/json
  -> in-process export -> apps/web/content/docs/api/openapi.json
  -> Fumadocs createOpenAPI + generated MDX/operation metadata
  -> TanStack server function preloads the selected page's document
  -> application injects prepared props into the shared UIX OpenAPI renderer
```

`apps/web/src/lib/openapi.server.ts` owns Fumadocs schema loading; `apps/web/scripts/generate-api-docs.ts` owns generated pages and prepared data. The website catchall already preloads API document data in its server function. Retain these working responsibilities and remove the UIX renderer's direct import of `apps/web/src/generated/course-api.json` and implicit snapshot fallback in slice 0102. Storybook supplies the generated snapshot through a story-only adapter; production requires its application-provided prepared data. Verify that the first render and subsequent navigation both use the supplied document rather than a bundled stale fallback.

Epicat currently uses a custom schema-to-React `APIPage` renderer in `packages/docs/src/components/docs/api-page.tsx`. Reuse its application-to-shared-package injection boundary, but retain Dojo's native `fumadocs-openapi` renderer rather than copying that custom parser, example generator, or title-derived endpoint paths. Dojo already records the actual operation route in generated metadata. Keep stable operation IDs, route-derived sidebar labels, tag ordering, and the single spec source.

The middleware is already installed and does not remove the Bun dependency of the current export/doc scripts. Slice 0101 must make their execution environment explicit. Do not treat enabling the plugin as the fix for `bun: not found`, and do not upgrade or rename the pinned plugin package just because current upstream examples use a different package name.

References: [Elysia OpenAPI plugin](https://elysiajs.com/plugins/openapi), [Fumadocs OpenAPI integration](https://www.fumadocs.dev/docs/integrations/openapi), and [Fumadocs server/preloading guidance, including TanStack Start](https://www.fumadocs.dev/docs/integrations/openapi/server). Apply the APIs available in the installed versions rather than assuming every current upstream example matches them.

OpenAPI acceptance: the runtime JSON endpoint equals the exported snapshot; Fumadocs pages/prepared data match that snapshot; the production renderer receives its document from the website; Storybook receives the same shape through a fixture adapter; UIX production code imports no application schema; rendered docs hydrate and navigate without a fallback snapshot; builds need no live API or production credentials. Keep `openapi:check` and the existing API-reference browser test as gates, adding focused coverage for removing the fallback when that change ships.

Use the shared command palette presentation for website, courses, and docs, with context-appropriate placeholder text and segments. Connect real search results and real navigation. Verify keyboard opening, focus return, Escape, empty/error states, and result grouping.

### Local learning application

Move the dashboard, course navigation, canonical lesson workspace, session entry points, materials, tests, and chat to UIX. Preserve workspace and course IDs, lesson URLs, previous installations, file writes, progress, test execution, session adoption, and resume. Navigation must not create duplicate sessions or duplicate introductions.

The editor must retain real files, save/dirty state, language highlighting, JSDoc dropdowns, diagnostics, tabs, test-output switching, line references, and editor lifecycle. Tests use real results, the code font, wrapped sample output, a plain pass checkmark, right-aligned duration, and the approved table styling. Avoid making healthy editor/runtime code change solely for visual ownership.

Materials must use real course assets and Markdown/Shiki rendering. Slides remain 16:9, with top progress and Previous / page-total / Next controls; connect actual deck state rather than a story counter. Preserve video controls, resource links, local asset serving, scrollfade, and preferences supported by the runtime.

Chat must render actual streaming responses, tool activity, permissions, structured questions, failures, cancellation, and restored history. Agent/model options come from runtime capabilities. Preserve the existing agent integration and distinguish a disconnected/not-configured agent from an empty conversation.

### Authoring, onboarding, and settings

Replace the authoring presentation while retaining actual files, filesystem watching, unsaved changes, conflicts, scoped evaluations, reports, trial navigation, and isolation. Sensei teaches; the existing authoring role/Kyoshi helps create the draft. Do not substitute simulated story replies for either.

Use shared onboarding/profile controls and avatar upload where supported. The avatar flow includes validation, crop, cancel, progress, retry, removal, keyboard use, and meaningful storage feedback. Do not show demo photos or an artificial “try failure” section in production. Where no profile persistence exists, specify and implement a minimal local preference contract before exposing a successful save.

Preserve Dojo > Settings. Account settings retain their own context; learning-content settings belong to the main content window. Show the helpful right column for settings explanations, including actual API-key use. Keep credentials with the existing supported runtime storage and authentication flow.

Approved behavior is an acceptance contract: fixed-width/non-draggable left sidebar; toggleable right chat; remembered supported panel/settings widths; padding when chat is collapsed; resize handles matching text color; settings sliding from behind the main window toward the right and back without zoom; stable centered content when scrollbars appear; consistent dropdown styling; round toggle controls; scrollfade and expanding scrollbar hit areas. Retain fade transitions for page/theme changes and directional panel transitions without triggering a full-page flash on segmented control updates. Respect reduced motion and avoid double-wrapping transitions in router and component code.

## Starter courses

### Format, identity, and distribution

Proposed source directories are `courses/create-your-own-dojo/` and `courses/how-to-run-a-dojo/`. These are new paths, not existing courses. Keep content as source-controlled files with stable IDs, a manifest, learner material, teacher guidance, and validated local asset references.

Use the currently supported `mode: interactive` manifest with its `lessons` path and a JSON sequence of `present` and `question` steps. The existing interactive format points at one lesson document; start with sections/steps rather than inventing an unsupported chapter array. Authoring and interview are product purposes, not new manifest modes. A later curriculum extension needs its own compatible schema design.

Initially keep the courses discoverable locally and marked as draft starter content. Use the existing `marketplace: false` capability until content and distribution are reviewed. Validate that this metadata and the chosen interactive manifest parse in the committed schema. Do not rely on the concurrent, unmerged `private` schema work.

Use the existing local-path installer for the initial integration gate. For normal CLI users, bundle these source assets in the distributable and expose installation through the existing installation/workspace flow. Installation must be deliberate, idempotent, offline-capable for bundled content, and must not overwrite an edited installation. Do not insert duplicate courses on every launch or publish placeholder GitHub/install URLs. Public catalog registration comes after the authored content has a real distribution source.

Both courses require an actual interactive Sensei context: selected course and step, learner-facing material, teacher guidance, relevant current docs, and progress. Reuse the existing session/runtime service where appropriate, adding the missing interactive adapter without pretending there is a kata/test failure. Persist and restore the conversation and interactive step. Static FAQ text can ground answers; canned fake chat is not the product.

### Create your own dojo

Purpose: help a person turn a learning or interview idea into a first tutor-guided experience, using the real authoring application.

Initial sections:

1. Describe your audience and one concrete learning outcome.
2. Choose a learning experience or interview challenge, with a short explanation of the distinction.
3. Create an independent draft through the real authoring flow.
4. Find its files and add a first learning step, materials, and Sensei guidance with Kyoshi.
5. Open a learner trial and experience the first step with the Sensei.
6. Review feedback, return to the draft, and explain the later evaluation/publication workflow.

Initial deliverable: brief editable draft copy, a valid working step sequence, a real “open/create draft” handoff, and one demonstrated authoring-to-trial round trip. The tutorial course and authored draft must have different identities and file roots; following the tutorial must not edit the tutorial itself. Do not invent a publishing success before publication is supported and performed.

### How to run a dojo

Purpose: orient a learner to the application and let the Sensei answer practical questions in context.

Initial sections:

1. Find/install a course, open a workspace, and understand where your work is saved.
2. Find lessons, learning material, code, slides, video, and resources.
3. Ask the Sensei for a hint, an explanation, or a suggested next step.
4. Select an available agent/model and understand setup or permission prompts.
5. Run a check where the current course supports it, understand results, and recover from an error.
6. Change learning preferences, resume later, and find documentation/help.

Seed grounding with short answers to: “Where are my files?”, “Can I ask for a hint without the answer?”, “How do I change the model?”, “Why is a check failing?”, “Where are slides/resources?”, “Will my progress be saved?”, and “How do I make my own course?” Link to actual routes and docs. Content must match implemented capabilities; do not claim checks exist in every interactive course.

Initial deliverable: editable orientation copy, at least one real question/answer interaction, working help/navigation links, persistent progress, and a Sensei response grounded in the selected step. The full curriculum and teaching quality are later authoring iterations.

## Ordered execution slices

Each slice is a reviewable branch/PR based on `main`, with changed behavior, verification evidence, and rollback scope. Do not create all branches up front. The order below is the execution order; independent website/docs work can proceed after shared contracts are stable.

| ID | Deliverable and primary locations | Exit criteria |
| --- | --- | --- |
| 0101 | [Release health and migration baseline](0101-uix-production-foundation.md): workflows, API generation, web typing/tests | Fresh CI-equivalent build and actual CI pass; current routes/capabilities and remaining failures documented without silent exemptions. |
| 0102 | Production UIX boundary: exports, imports, assets, providers, fixture separation | Web and local hosts import shared UIX presentation/provider without app-source imports or Storybook globals; isolated builds resolve fonts/workers/assets. |
| 0103 | Website: root, marketplace, course detail, shared search | UIX compositions use real server data and links; SSR/deep links/filters/SEO/install flows work. |
| 0104 | Documentation/API: catchall docs route, Fumadocs loaders/layouts, palette | Real MDX and generated Elysia/Fumadocs API reference use UIX; doc links, search, TOC, anchors, LLM/OG routes verified. |
| 0105 | Local shell/dashboard and kata learner: routes, lesson adapters, editor/tests/chat | Real lesson workflow, editing, checks, session resume, tools/permissions and navigation pass in UIX; existing state retained. |
| 0106 | Interactive learning and Sensei: interactive service/routes and materials | Present/question flow has real grounded Sensei chat, persistent step/conversation, actual assets and truthful capabilities. |
| 0107 | Authoring, onboarding, settings: authoring routes/hooks and shared controls | Independent draft edit/save/watch/conflict/evaluate/trial cycle works; supported settings persist and approved panel motion/spacing is retained. |
| 0108 | Two starter courses and entry points: proposed `courses/` sources, installer/package assets | Both validate, install offline from the package, open in UIX, resume, and meet the course-specific acceptance above. |
| 0109 | Remove superseded presentation and align stories/tests | Production consumers no longer depend on competing legacy visual components; stories exercise the production compositions, including errors and responsive states. |
| 0110 | Staging, release and production verification | Merged-main staging verified at its actual URL; Changesets release/tag and installed CLI artifact verified; rollback point recorded. |

Dependencies: 0102 follows baseline repair; 0103–0107 consume 0102; 0106 and 0107 are prerequisites for 0108. Cleanup follows parity, not the other way around. Release follows all required gates. If a slice reveals a missing backend capability, record the narrow capability and implement it before exposing its UI; do not expand into the runtime proposals by default.

## Verification and completion contract

Run only the checks appropriate to each slice during implementation. Run the full release set from a clean checkout with a frozen installation before claiming the migration is complete. Capture command, commit, environment, output, and URL/artifact under test. Previous checkpoint results are reference evidence, not a substitute.

Existing commands:

```sh
CI=true pnpm install --frozen-lockfile
pnpm --filter @dojofoo/uix types:check
pnpm --filter @dojofoo/uix test
pnpm --filter @dojofoo/uix storybook:build
pnpm --filter @dojofoo/uix test:browser
pnpm --filter @dojofoo/api test
pnpm --filter @dojofoo/api openapi:check
pnpm --filter @dojofoo/web types:check
pnpm --filter @dojofoo/web test:e2e
pnpm --filter @dojofoo/ui types:check
pnpm --filter @dojofoo/ui test
pnpm --filter @dojofoo/ui test:e2e
pnpm --filter @dojofoo/ui test:editor
pnpm build
pnpm --filter dojofoo test:package
```

Browser commands need their actual isolated target servers. Use `STORYBOOK_URL` for UIX, `DOJO_UI_BASE_URL` for local UI, and aligned `DOJO_WEB_TEST_PORT`, `DOJO_API_TEST_PORT`, and `DOJO_API_TEST_ORIGIN` for website/API fixtures. Confirm each test config before launching. The legacy editor gate currently starts its own Storybook; migrate its target deliberately when the production editor composition changes. Do not run tests against an unrelated shared preview and report them as branch verification.

Add only the missing meaningful gates as their features ship:

- Course validation covering both manifests, step documents, stable IDs, references, installer behavior, and separate tutorial/draft roots. A root `courses:check` script is a proposed interface, not an existing command.
- Production route journeys for discovery → installation/opening → lesson/chat → resume, and tutorial → authoring → trial → return. Use deterministic protocol/service fixtures for repeatability; do not weaken actual file/session boundaries or replace the production adapter.
- A focused real-agent canary verifies the supported runtime path, grounded interactive context, streaming, and resume. Record the actual harness/model and result. Keep routine CI independent of paid model calls; arrange credentials and cost authorization before a live canary if needed.
- Responsive/keyboard/reduced-motion checks and targeted screenshots comparing shared production compositions with their stories. Cover theme transitions, segmented controls, panel direction, scrollbars, long results, dropdowns, slide ratio, and narrow layouts.
- Dependency-boundary checks: no app-source imports in UIX production modules, no fixture/mock conversations in production controllers, no legacy visual imports in migrated routes, and no application server modules in client bundles.
- Installed tarball boot in a fresh directory, outside the repository, with bundled starters, deep links, editor workers/fonts, local materials and real server endpoints. Test without monorepo aliases or development-only files.
- Actual staging/production HTTP and browser checks for homepage, real catalog/detail, docs/API/search and metadata; release logs must pass. Match the tested artifact to its commit/tag.

Acceptance scenarios include existing learner migration with dirty files and resumed history, first-run/no-agent setup, canceled/failed permissions, unavailable model, empty catalog, failed asset/request, draft save conflict, a failed and passing real check, and an interrupted trial. Do not mark the goal complete on screenshots alone.

## Delivery and rollback

Merge each completed slice through the normal main-to-staging workflow. Use Changesets where publishable package behavior changes. Release tags remain production deployment and rollback points. Preserve storage formats through the visual migration; version and test any necessary preference-key migration without deleting old progress or conversations.

Prefer route-sized replacements whose previous commit can be reverted. Keep compatibility shims only while a named consumer requires them, and remove them in 0109. A temporary rollout switch needs a specific removal condition; do not leave two permanent visual systems. Verify actual staging before release and the installed tagged CLI after release.

## Execution handoff

Start with slice 0101. Read repository rules and the linked architecture records, inspect the latest `main` and current failures, and use an isolated branch/check-out so concurrent audit work stays intact. Repair the release prerequisites with minimal changes, run its gates, and attach evidence. Then proceed through the slices in order, keeping this document updated with PRs, actual verification, and newly discovered gaps. Do not restyle preview fixtures again as a substitute for connecting production.

No application behavior, course installation, deployment, or runtime migration is performed by creating this plan.
