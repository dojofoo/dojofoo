# UIX production route and capability inventory

Baseline: `4f31a76116d23c8d9613f77d80698b5dc766096b`, inspected during slice 0101.
Execution plan: [UIX adoption](../../.prd/0100-uix-adoption.md).

UIX compositions are the presentation target. Existing application loaders and runtime services retain ownership of real data and behavior. The entries below identify integration work; listing a target does not mean the route has been migrated.

## Website and documentation

| Surface | Current owner | UIX target / integration contract |
| --- | --- | --- |
| `/` | `apps/web/src/routes/index.tsx`; `loadMarketplaceCourses` and learning-count loader | `packages/uix/src/web/landing.tsx`; retain SSR, actual learning/catalog data, metadata and working entry points. The embedded learning preview remains an illustration. |
| `/dojos` | `apps/web/src/routes/dojos.tsx`; `apps/web/src/lib/courses.functions.ts` | `packages/uix/src/web/courses.tsx` and `course-tile.tsx`; connect real DTOs, filters, search, sorting and install commands. Do not import the synthetic UIX catalog. |
| `/courses/$source/$slug` | `apps/web/src/routes/courses.$source.$slug.tsx`; real course loader and activity charts | `packages/uix/src/web/course.tsx`; retain valid source aliases, real course/version/metrics, copy install action and missing-course handling. |
| Shared header/footer | `apps/web/src/components/layout/site-navigation.tsx`, `site-footer.tsx` | `packages/uix/src/web/site.tsx`; adapt to actual TanStack links rather than local demo navigation. |
| `/docs`, `/authoring`, `/developers` and descendants | `apps/web/src/routes/$.tsx`; `apps/web/src/lib/source.ts`; generated MDX collections | UIX docs layout/compositions in `packages/uix/src/docs/docs-site.tsx`; application supplies compiled MDX, tree, TOC, metadata and document selection. Do not adopt `docs/content.ts` raw-source projection as the production loader. |
| `/docs/api/*` | Catchall route, `apps/web/src/lib/openapi.server.ts`, generated API MDX | Native Fumadocs renderer styled by UIX; application provides prepared document. Remove the renderer's application snapshot import/fallback during 0102. |
| `/api/search` and shared palette | `apps/web/src/routes/api/search.ts`, `apps/web/src/components/search.tsx` | Shared `site-search-palette.tsx`; retain real Fumadocs static index, marketplace search, scope selection, keyboard activation and route navigation. |
| `/api/v1/*` | Website proxy route and `apps/api/src/app.ts` | Preserve Course API behavior and Elysia OpenAPI middleware. UIX is not an API backend. |
| `/llms.txt`, `/llms-full.txt`, `/llms.mdx/docs/*` | Website server routes and processed MDX | Preserve machine-readable docs and canonical page relationships. |
| `/og.webp`, `/og/landing.webp`, `/og/*` | Website server routes and social metadata helpers | Preserve valid images/content types, URLs and SSR metadata during presentation replacement. |

`packages/uix/src/web/website.tsx` is a demo router; do not mount it in place of the production route tree. `packages/uix/src/web/catalog.ts` owns preview data, not the live marketplace contract. The existing website cache policy is `s-maxage=300` with stale revalidation/error handling; its route `staleTime` is a separate client cache setting.

## Local application

| Surface | Current owner | UIX target / integration contract |
| --- | --- | --- |
| Root provider and error boundary | `packages/ui/src/routes/__root.tsx` | Shared UIX provider/theme/styles with SSR-safe startup and reduced-motion behavior; retain router, scripts and actionable error handling. |
| Dashboard `/` and workspace routes | `packages/ui/src/routes/index.tsx`, `course.$workspaceId.tsx`, `course.$workspaceId.index.tsx` | Learner dashboard/sidebar composition in `packages/uix/src/pages/learner.tsx`; real workspace discovery, installed courses, progress and session selection. |
| `/course/$workspaceId/$courseId/lesson/$lessonId` | Canonical route and `LessonPage` in `index.tsx`; `server/lesson/routes.ts`, `server/lesson/service.ts` | UIX AppShell/CourseWorkspace with adapters for actual files, checks, materials, configuration, messages and sessions. Preserve route identity and storage boundaries. |
| `/session/$sessionId`, `/kata/$name` | Existing wrappers / legacy entry points | Continue resolving to the same working lesson and conversation. Do not lose history or create a new session just to render UIX. |
| `/interactive` | `packages/ui/src/routes/interactive.tsx`, `server/interactive/routes.ts`, `server/interactive/service.ts` | Real present/question progression and course assets inside UIX; a missing interactive-to-Sensei adapter is required for the starter courses. |
| `/authoring` | `packages/ui/src/routes/authoring.tsx`, authoring file/watch hooks, server authoring services | `packages/uix/src/pages/course-authoring.tsx`; real draft edit/save/conflict, Kyoshi conversation, scoped evaluation/report and independent learner trial. Keep simulation in stories. |
| `/avatar` and onboarding/profile controls | Existing avatar route and supported local preferences | Shared UIX avatar/forms, with explicit storage/persistence behavior. Do not show preview-only profile changes as stored account changes. |
| Account and learning settings | Existing route/context preferences and runtime capabilities | Shared UIX settings compositions; account settings and content-window settings remain distinct. Persist supported widths/preferences; show only functional settings. |
| Server entry points | `packages/ui/src/server/app.ts` | Preserve `/api/project`, `/api/workspaces`, `/api/run-command`, `/api/control`, `/api/interactive`, `/api/authoring`, `/api/teaching` and agent-facing integrations. Reuse their real controllers. |

Protect file buffers/dirty state, real check results, local material URLs, streaming/tool/approval/question events, cancellation, model capability selection and session resume. Runtime migration proposals in other architecture documents remain separate; check current service behavior before modifying agent execution.

## Distribution and gates

`packages/cli/src/commands/ui.ts` launches the local application. `packages/cli/scripts/test-packed-ui.mjs` installs the actual tarball in a fresh temporary directory and boots its bundled runtime. Retain that boundary and extend it when bundled starter assets or UIX asset ownership change.

The proposed starter directories `courses/create-your-own-dojo/` and `courses/how-to-run-a-dojo/` do not exist at this baseline. Their required real interactive conversation and independent authoring handoff are tracked by slices 0106–0108, not implied by the existing preview stories.

Slice 0101 adds a PR verification workflow with declared Node/Bun setup, generated-contract checks, types, API/UIX unit tests, a full build, installed-package verification, and website browser journeys. Main's Release workflow must use the same declared Bun version. A green local check is not proof that the hosted workflow or deployed website passed; attach those results separately.


## 0102 library boundary and deployment update

The website demo router, raw-MDX projection, preview catalog and simulated search now live in `packages/uix/src/stories/fixtures/`. Public website/docs entry points take explicit content and navigation inputs. Native API rendering requires application-preloaded Fumadocs data; only the story adapter looks up the generated website snapshot. Library assets resolve within UIX. Storybook and both runtime hosts use `UIXProvider`, with host-owned theme persistence retained during the route migration.

The route tables above still identify work to do. A provider import or prepared-document adapter does not mean those routes have adopted UIX page presentation. The next website brief is [0103](../../.prd/0103-uix-website.md).

Vercel's `dojofoo` project builds main with automatic custom-domain assignment disabled (`autoAssignCustomDomains: false`). This uses staged production builds while keeping the current live alias unchanged. A version-tag promotion step still needs implementation and hosted verification before release: resolve the ready artifact by exact commit, promote that artifact only for the released version, and retain the tag/deployment mapping for rollback. Release PR 184 must remain unmerged until the migration's release gates are met. The project setting is remote configuration, not implied by this source file.
