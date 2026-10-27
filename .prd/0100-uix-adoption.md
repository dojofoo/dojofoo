# UIX production adoption and first-party starter courses

Status: local execution blocked pending the manual production preview and UI review; 0101–0105 merged (0105 through PR #197, `510502c`). Local review is in `.worktree/uix-0105` on `chore/local-review`; 0106 is unmerged, 0107 remains open, and 0108 has source-content preparation only. Do not promote a release before 0110.
Date: 2026-10-26.
Baseline: `main` after PR #181, merge commit `4f31a76116d23c8d9613f77d80698b5dc766096b`.

Current user constraint (2026-10-27): finish UI presentation against the current Storybook Pages before further agent integration. Do not modify Eve, agent execution, session ownership, or core services. Use the existing agent-package interfaces. Runtime gaps are deferred work, not reasons to change core during the UI migration. Uncommitted authoring runtime/model experiments were removed from the review tree into the stash named `Deferred authoring core experiments; UI-only work requested`.

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

## Local layout review, 2026-10-27

User-requested landing/docs grid adjustment on `chore/local-review`: shared header, footer, page window, landing content and docs tabs use a 1280px maximum. The landing preview uses 1380px, extending 50px on each side at roomy desktop widths while retaining 16:9. Responsive gutter breakpoints move with the wider container. This is shared UIX CSS only; routing, content and application services are unchanged.

Fresh browser measurements at https://dojo.td and /docs passed at 1600, 1440, 1304, 1303, 1024 and 390px: desktop header/content/tabs 1280px, preview 1380px, ratio 1.7777777777777777, no horizontal page overflow and no page errors. The screenshot probe waits for the real preview editor before capture. Desktop landing/docs and mobile landing screenshots were inspected. Evidence: `/tmp/dojo-1280-layout-probe.{mjs,log}` and `/tmp/dojo-1280-{landing,docs}-{1600,390}.png`. UIX tests passed 63 tests (6.46s), diff check passed. Local review only; not merged or deployed.

The course explorer's inner container now also matches the 1280px outer container. Fresh actual https://dojo.td/dojos measurements at 1600/1440/1024/390px showed identical inner/outer width and x position, without horizontal page overflow.

The landing modes carousel now fills its active pill from left to right using the same elapsed motion value that advances the slide, with the brand color. Its optional horizontal edge mask and 16px resting text inset soften slide entry/exit. Existing eight-second autoplay, hover behavior, keyboard/focus/visibility/drag pauses and reduced-motion behavior are preserved. The new browser regression failed on the missing mask before implementation; all three carousel checks then passed (21.0s). Actual https://dojo.td verification passed timed growth/reset, switching, the mask, mobile resting text geometry, manual selection, reduced motion and no overflow/page errors. Evidence: `/tmp/dojo-carousel-progress{,-red}.log`, `/tmp/dojo-carousel-live-probe.{mjs,log}`, `/tmp/dojo-carousel-progress-{desktop,mobile}.png` (inspected). UIX 63 tests passed (7.15s), type check and diff check passed. Local and unmerged.

## Course–Learner review requirements, 2026-10-27 (pending)

The user reaffirmed current Course–Learner Pages as the source of truth and requested the following connected surfaces. Preserve these requirements across slices; do not describe them as completed by the website adjustments above.

- Inside courses, omit dashboard navigation items such as Courses; use the arrow Dashboard breadcrumb. Match the turning CourseCard, actual installed version and available update control.
- The composer's first picker selects the coding agent (Pi, Codex, OpenCode, etc.), and the second selects one of that agent's models across any provider families it supports. Do not label Sensei/Kyoshi as the selected coding agent. Pi currently has authoring support but is rejected by the ACP learner registry; represent capability limits explicitly rather than claiming it works. Preserve existing sessions and errors through agent/model changes.
- Keep the composer's plus control and support image/file attachments. Current Composer only remembers filenames and native lesson services extract text; sending real attachments still needs a deliberate host capability seam.
- Restore the shared account dropdown with profile, settings and login/logout entries. The user explicitly permits unfinished account actions, but requires a real local /settings page and the Pages settings appearance. Do not claim prototype profile/key writes are persisted or authenticated.
- Explore is a local page using the same presentation as Pages/Explore, not just an external marketplace link. A temporary marketplace list is permitted. Always show empty shells for Create your own dojo and How to run a dojo; preserve the prepared draft course sources for their later real installation/integration.
- Make authoring reachable from the main view. Existing resumable drafts already have native workspace links; new draft creation must remain independent of tutorial/course sources.

Authoring evaluation report migration is unfinished. Its red-first test changes were safely stashed as `pending evaluation report tests before learner review` while prioritizing these user requests; restore them deliberately when resuming that slice. No report implementation or runtime changes were made by those tests.


## Current UI review gates, 2026-10-27 (local and unmerged)

At dad2a6d plus the preserved pending UI work, the canonical native UI passed 27 browser checks in 14 files (1.1m): learner/starter discovery, account/profile/appearance, agent/model controls against mocked responses, authoring editor/search/preview/queue, retained dirty files and conversations, chat questions/output, material video/assets, and legacy briefing recovery. Shared Storybook passed 63 checks in eight files (5.7m): all current Pages in dark/light, composer choices, settings/preferences, profile/cropping, fixed sidebar and resized chat/settings, phone drawers, normal/reduced pane motion, steady segmented controls, 16:9 slides/navigation, code/JSDoc/save/undo, menus and search. The authoring/account and API-phone screenshots were inspected. No models or live agent sessions were invoked.

Canonical website docs checks at https://dojo.td: six passed, including real content/history/Markdown, installation controls, three-mode theme persistence/fades, and mobile page navigation. The seventh check failed before reaching its UI assertions: GET /api/v1/openapi/json returned HTTP 200 with content-encoding: br, but Playwright reported failed to decompress 'br' encoding. This is an open transport failure, not a passing API acceptance gate; no proxy or API implementation was changed. A separate browser probe at the actual docs URL verified List courses → List course profiles navigation, Fumadocs request/examples, the desktop title-to-request gap (84px), 350px phone article width, zero document overflow and no page errors. It does not replace the failed raw-spec check.

The read-only generation gate passed: Verified Elysia OpenAPI document; Verified 10 Fumadocs OpenAPI pages and their prepared data. Source inspection confirms Elysia's openapi plugin, the host createOpenAPI/preloadOpenAPIPage loader, and the shared Fumadocs page renderer. Epicat's generator and docs consumption were read for comparison; no files there were changed. Evidence: /tmp/dojo-ui-native-acceptance.log and -results/, /tmp/dojo-uix-pages-acceptance.log and -results/, /tmp/dojo-web-canonical-review.log and -results/, /tmp/dojo-ui-api-spec-check.log, /tmp/dojo-api-ui-render.json and /tmp/dojo-api-ui-{desktop,phone}.png.

All 18 root audit hashes are unchanged. Working diffs for agent/authoring/UI-server source remain empty. No source changes were made while these browser gates ran. Earlier branch history still contains 22 service/core paths (+915/-49); it remains unmerged and cannot be presented as a UI-only merge. Current local UI acceptance is broader than the preceding individual checkpoints, but starter installation/teaching, unsupported native profile/attachment capabilities, clean-package/CI, staging and released-artifact acceptance remain unproven or deferred under the user's core freeze. The original full objective remains open; do not mark the migration complete from these UI gates.

The raw-spec decoding failure above is closed locally by the website forwarding-header correction documented in [0104](0104-uix-docs.md#canonical-api-documentation-response-decoding-local-review): the original canonical API browser gate passed (9.3s), web types passed, and origin/direct/canonical probes now return identical decoded schemas without decoding errors. No core implementation changed. This does not promote the overall migration or release status.


## Remaining UIX browser coverage (local review)

The 13 browser files outside the preceding 63-case Pages review contain 40 cases. Their first run passed 38 cases (3.1m) and failed the two catalog-wide corner audits before checking their final results. Passing coverage includes controlled composer history/multiline/IME/send/cancel/model scrolling; dark/light conversation results and tool disclosures; native docs menus/theme persistence; editor atomic grouping, edit/undo/highlights/results, built-in JSDoc and TypeScript diagnostics/completion; interactive answer feedback; landing carousel click/keyboard/autoplay/progress/fades; lesson navigation capabilities; phone queue wrapping/removal; settings alignment/motion; round switches across themes; and running/passed/failed terminal text/status/wrapping.

The corner audit's labeled trace identified Components/Molecules/Message Queue/Empty, whose correct rendering is an empty decorated surface. Its old universal visibility assertion rejected that intended state. The audit now waits for that story's decorator and verifies it is empty; nonempty stories retain their original visibility assertions, and every story still undergoes the unchanged corner inspection. Named steps identify future failures. The next run reached 56 of 59 stories before the original 60-second aggregate budget expired. The final per-catalog budget is 59 × 2 seconds + 30 seconds startup (148s); individual assertions retain their original five-second budget. An exploratory longer-wait run was stopped after the trace proved it was waiting for intentionally absent content; no product changes resulted from that experiment.

Final focused audits: 2 passed (2.3m), inspecting all 59 active Pages/Components/Templates in both dark and light mode. A TypeScript syntax-tree comparison proves catalog selection and the complete corner-inspection rules unchanged. This closes all 40 remaining cases across the initial 38 passing cases and focused two-case rerun, for 103 unique UIX browser cases together with the earlier 63. It is not a claim of a single new 103-case invocation, a clean CI install or native runtime/service acceptance. Evidence: /tmp/dojo-uix-remaining-{list,browser}.log and browser-results/, /tmp/dojo-uix-corner-{audit,corrected,final}.log with their result directories, /tmp/dojo-corner-assertion-proof.json. No component styles, agent, authoring, API or native-server implementation changed in this round; all 18 root audit hashes are retained.

The UI presentation is verified locally more broadly; original starter-course installation/teaching, clean-package/CI, staged/released-artifact acceptance and user visual review remain outstanding. Older core-containing branch history remains excluded from a UI-only merge. The full migration objective remains open.


## Isolated current-UI production artifacts (local review)

A new source snapshot at /tmp/dojo-web-ui-build-lsmk_cuw contains 1,304 hashed build-source/public-asset files from 17d6097 plus the preserved pending UI work. It began without node_modules or previous build outputs. A file-type allowlist limited copying to build inputs; credentials were not needed. pnpm 10.28.0 under Node 24.22.1 installed existing dependencies offline with the frozen current manifest/lock. The first web-only filtered install completed in 24.5s; the build's API generator also required the existing API workspace selection, added in 3.2s. The initial build stopped at that missing Elysia dependency after one second, before bundling. The corrected spec preflight verified Elysia and all ten Fumadocs pages; no dependency or application-source edits were needed.

Fresh isolated final gates: production web build exited 0 (33.58s), prerendering all 22 docs pages; web types passed; UIX Storybook static build exited 0 (64.96s); UIX types passed; UIX 19 test files / 69 tests passed (10.63s). The static Storybook catalog has 80 stories and exactly matches the tested development catalog. Read-only web artifact validation resolved all 484 HTML and 18 CSS local-asset references with zero missing files, found 16 font files plus the Monaco runtime assets, and confirmed actual Usage and native API HTML. All 1,304 copied source hashes, root manifest/lock hashes, original working-source hashes and 18 unrelated root audit hashes remain unchanged after install/build/type/unit gates. Generated outputs stay in the temporary snapshot.

The temporary production-preview launch was rejected by automatic approval review because command analysis failed unexpectedly. It was not retried through another execution path. The user was asked to launch the built preview manually; production browser hydration/assets remain unverified until that occurs. Read-only artifact checks do not replace a production-browser gate. The canonical existing native review still returned HTTP 200.

Evidence: /tmp/dojo-ui-clean-build-evidence.json, /tmp/dojo-web-ui-build-{source-hashes.json,install.log,install-final.log,spec-preflight.log,production.log,production-final.log,types.log}, /tmp/dojo-web-built-assets.json, /tmp/dojo-uix-clean-current-{build,types,tests}.log. This is isolated local acceptance of the current combined UI source, including uncommitted user work, not committed-only CI or a released artifact. No agent/Eve/authoring/native-server source changed; the older core-containing branch history stays unmerged and excluded from a UI-only merge. Starter-course integration, production-browser verification, user review, CI/package/staging/release acceptance and the full original objective remain open.


## Packed UI asset audit, 2026-10-28 (local review)

The actual local CLI pack completed in 9.41s using existing compiled outputs: /tmp/dojo-ui-cli-package-asua9_r2/dojofoo-0.2.1.tgz (27,992,998 bytes), SHA-256 a22409f81978e69eac130283398ef6649f231e9308415139b337752ceb25bd27. The private runtime packages have no prepack build hooks; no engine rebuild, agent readiness or model invocation was performed. The shipped manifest exposes the expected binary, contains no lifecycle scripts or workspace dependency references, and includes the UI server entry.

All 300 public UI files were extracted outside the workspace and matched the current compiled files byte for byte. Seventeen read-only responses at https://dojo.localhost matched those archive bytes. Critical probes included Inter and Iosevka WOFF2, Monaco editor-core.mjs/editor-worker.mjs/editor-worker-main.mjs, the Monaco runtime loader and current CSS/JavaScript; their MIME types were correct. Evidence: /tmp/dojo-ui-cli-package-pack.log, /tmp/dojo-ui-cli-package-assets.json and /tmp/dojo-installed-ui-assets-jx4a5a67/. This validates the UI asset portion of the existing packed output, not a fresh isolated CLI build/install/boot, runtime readiness, hosted CI or release. The full package test starts an Eve runtime and remains outside the current UI-first scope. No publication occurred.

The required production preview is still absent at 127.0.0.1:4600 (connection refused / HTTP 000). The same manual-launch dependency has persisted through three consecutive goal turns while independent source/build/assets/handoff work was completed. The automatic approval review rejection was not bypassed. Remaining production-browser verification requires the requested manual launch; integration/publication also requires the user's UI review and must exclude the older core changes. Unsupported service capabilities remain deferred under the user's core freeze. Local execution is blocked on those inputs, not complete; the original full objective and acceptance criteria remain unchanged.
