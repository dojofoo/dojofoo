# 0102: Make UIX a production library with explicit application inputs

Parent: [UIX adoption](0100-uix-adoption.md).
Status: library merged in PR 186; OpenAPI stability follow-through in progress on `fix/openapi-schema-stability` in `.worktree/uix-0103`.

## Goal

Make the approved UIX presentation consumable by the website and local application without Storybook-only aliases, application-source imports, implicit generated schema fallbacks, or duplicated provider behavior. Preserve the reviewed appearance and interactions while moving fixtures behind story adapters.

## Starting evidence and files

- `packages/uix/package.json` exports components/containers/pages/styles, but not focused web/docs/provider entry points.
- UIX source uses package-local `~/` and `@/` aliases configured by Storybook. Slice 0101 fixed the small dependency graph already consumed by the website; other production entry points still need self-contained imports.
- `packages/uix/.storybook/preview.tsx` currently owns Inter/Iosevka loading, icon context, MotionConfig, theme application and scrollbar initialization.
- `packages/uix/src/components/api-reference.tsx` imports the website's prepared document and silently falls back to it. The website catchall already supplies preloaded Fumadocs data.
- `packages/uix/src/components/harness-icons.tsx`, `web/landing.tsx`, `web/site.tsx`, and `pages/learner.tsx` import images from `apps/web/public`.
- `packages/uix/src/docs/content.ts` eagerly reads application MDX/meta files. `docs/docs-site.tsx` and `web/search.tsx` consume this fixture projection directly.
- `web/website.tsx`, `web/catalog.ts`, `pages/learner.tsx` and `pages/course-authoring.tsx` contain demonstration routing, catalog data or simulated behavior. Production routes must not adopt those controllers.

## Implementation

1. Branch from updated `main` in an isolated worktree after 0101 is integrated. Read its final evidence and keep concurrent root changes untouched.
2. Make imports in public production dependency graphs package-local, retaining valid style/asset resolution in both host builds. Add focused exports rather than a broad eager barrel. Keep archive/story/fixture modules out of production entry graphs.
3. Extract the shared UIX provider from Storybook's framework-neutral behavior: icon context, MotionConfig/reduced motion, scrollbar lifecycle and supported theme application. Keep router and application persistence adapters outside the provider. Make effects safe across SSR, remounts and development StrictMode. Storybook must consume the same provider; toolbar controls remain adapters. Host integration must respect existing theme ownership until the corresponding root migration, avoiding competing theme controllers or an unrequested intermediate visual redesign.
4. Make required fonts and shared brand/agent graphics available through library-owned asset/style entry points. Keep demonstration identities/photos in fixtures or the explicit marketing illustration. Preserve appearance and accessible labels. Do not copy application content into production library modules to bypass the ownership problem.
5. Require application-supplied prepared props in the native API renderer. Put page-name-to-snapshot lookup in a story adapter. Update the website and legacy re-export consumers deliberately; missing document data must fail clearly rather than render a stale embedded snapshot. Keep Elysia generation and native Fumadocs rendering.
6. Separate docs content-model types and presentational layout from Storybook raw-MDX loading. Let the fixture adapter read the website's canonical sources; production owns compiled MDX and Fumadocs data. Preserve the stories' navigation, code blocks, API operations and search.
7. Define the smallest data/slot/event contracts needed for the following website and local route slices. Do not build a generic controller abstraction or connect preview simulations to production. Existing routes/services retain persistence and agent execution.
8. Update README/export guidance and add a dependency-boundary gate with meaningful coverage of the public production graphs. Stories may consume application fixtures; production graphs may not. Distinguish those inputs explicitly rather than allowing all `apps/web` imports.

## Gate and acceptance

First reproduce the missing-input/import boundary in a targeted existing test or small consumer build. After each focused fix, run its relevant checks before the broad release set. Reuse existing tests; add coverage for actual missing behavior, especially document injection and provider lifecycle.

Required checks:

```sh
CI=true pnpm install --frozen-lockfile
pnpm --filter @dojofoo/uix types:check
pnpm --filter @dojofoo/uix test
pnpm --filter @dojofoo/api openapi:check
pnpm --filter @dojofoo/web types:check
pnpm --filter @dojofoo/uix storybook:build
pnpm --filter @dojofoo/uix test:browser
pnpm --filter @dojofoo/web test:e2e
pnpm build
pnpm --filter dojofoo test:package
```

The browser gate must use this checkout's isolated Storybook via `STORYBOOK_URL`; website test/API ports and origins must align. Do not generate files or rebuild in the same worktree while its browser tests are running. Use the declared Node/Bun versions, not the nested worktree's machine defaults.

Acceptance requires no application-source dependency in a public production graph; explicit schema injection in both docs and story adapters; matching reviewed stories; working host builds and installed CLI assets; provider behavior shared by Storybook and production consumers; no changed files/progress/session formats or fake production conversations. Verify deployed docs again because this slice changes their renderer inputs. Attach actual hosted CI and deployment evidence before completion.

Website route replacement, full Fumadocs layout integration, local runtime wiring, starter courses and legacy removal remain the following slices. They must use these production entry points rather than copying the UIX designs.


## Execution notes

Production import graphs now use package-local imports and library-owned assets. Story adapters own raw document projection, catalog fixtures, simulated search/routing, and prepared OpenAPI lookup. Applications must provide API page data explicitly. Both hosts and Storybook consume the same provider; existing hosts retain their theme ownership until their route migration.

The cleanup request removed obsolete root Storybook/Turbo artifacts, finished worktrees and package Turbo logs. Future shared build cache uses `node_modules/.cache/turbo`; Storybook static output uses each package's `node_modules/.cache/storybook-static`. Active development work and required configuration remain.

The native API story exposed a cold-start dependency waterfall, reproduced on a fresh isolated Storybook. Vite warmup now prepares the two shared docs/website entries. The original test timeouts and assertions remain unchanged.

Additional local UI typing reproduced six diagnostics on committed HEAD as well as this branch: two nominal provider-utils identities from distinct Zod peers; three teaching-Markdown HAST callback types; and distinct Shiki identities in native API highlighting. These are existing local-host prerequisites for 0105, not waived completion criteria for the full migration. No casts, skipped checks, or broad dependency updates were introduced to hide them.

Deployment safeguard: Vercel project `dojofoo` had main configured for automatic live-domain assignment. `autoAssignCustomDomains` was changed to false using the project API and read back; the live `dojo.foo` alias still pointed to the same deployment. Main remains the build branch and now stages its builds without automatic live promotion. Version-tag promotion automation and production verification remain required before 0110; do not merge release PR 184 prematurely.


Fresh local gates (2026-10-27, Node 24.22.1 / pnpm 10.28.0 / Bun 1.4.3):

```text
Frozen installation: exit 0.
UIX types and website types: exit 0.
UIX unit: Test Files 10 passed (10); Tests 42 passed (42).
API unit: Test Files 6 passed (6); Tests 41 passed (41).
Local root error boundary: Test Files 1 passed (1); Tests 1 passed (1).
Verified Elysia OpenAPI document.
Verified 10 Fumadocs OpenAPI pages and their prepared data.
Forced build: Tasks 6 successful, 6 total; Cached 0 cached; Time 32.477s.
Packed master authoring agent passed readiness without a model call.
Packed dojo UI responded with HTTP 200.
Storybook build completed successfully in the package cache directory.
Isolated Storybook browser suite: 77 passed (2.0m).
PASS: copied brand and profile assets match their original bytes.
PASS: staging safeguard active; live alias unchanged.
```

Website browser: 11 passed (20.8s). Hosted CI, PR deployment and post-merge staged deployment evidence must be attached before this slice is considered done. The full migration remains active through 0110.


Hosted library follow-through: [PR 186](https://github.com/dojofoo/dojofoo/pull/186) merged as `bf6314c`. [Verify 40425810346](https://github.com/dojofoo/dojofoo/actions/runs/40425810346) passed in 4m44s; [main Release 40426353146](https://github.com/dojofoo/dojofoo/actions/runs/40426353146) passed. Its staged native API page responds with HTTP 200 and the live alias remains unchanged.

The staged live OpenAPI comparison exposed request-order drift: after marketplace traffic Elysia added `additionalProperties: false` to that response schema. A two-app local probe reproduced the difference, and exercising the other endpoints exposed the same mutation in their response boundaries. The follow-through branch declares Elysia's response object defaults explicitly before its OpenAPI plugin observes their schemas and regenerates both Elysia/Fumadocs artifacts. The regression test compares cold and used API documents across all documented GET endpoints and the event route. Fresh API gates: 42 passed; ten Fumadocs documents verified. Acceptance still requires deployed equality after ordinary API traffic, not only a cold preview response.


Initial follow-through local gates: API 42 passed; UIX 42 passed; website types exit 0; ten generated Fumadocs documents verified; forced build six tasks successful, zero cached (31.359s); website browser 11 passed (19.1s). Hosted and warm-deployment checks remain pending for the follow-through commit.


Hosted verification caught a flaw in the first attempted fix: eager compilation passed local gates but caused a Bun startup `ReadableStream is locked` error in Elysia's OpenAPI explorer response cloning. That configuration change was removed before merge. The final implementation keeps the existing lazy runtime and declares only the response-root defaults that Elysia already applies during validation. Its generated document is identical to the fully normalized snapshot, and the same cold-versus-used regression test passes.

Final explicit-default gates: API 42 passed; OpenAPI/Fumadocs check passed; forced build six tasks successful, zero cached (31.678s); website browser 11 passed (19.2s). The final diff preserves the original Elysia runtime configuration. Warm deployed verification must be rerun on the corrected commit.
