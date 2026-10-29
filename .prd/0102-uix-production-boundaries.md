# 0102: Make UIX a production library with explicit application inputs

Parent: [UIX adoption](0100-uix-adoption.md).
Status: done; library PR 186 and OpenAPI follow-through PR 187 merged and verified on staging.

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


Final hosted acceptance: [PR 187](https://github.com/dojofoo/dojofoo/pull/187) merged as `3d40648`. [Verify 40428513155](https://github.com/dojofoo/dojofoo/actions/runs/40428513155) passed in 4m30s. [Main Release 40429199488](https://github.com/dojofoo/dojofoo/actions/runs/40429199488) passed. The [merged staging deployment](https://dojofoo-au9jw886z-tomsiwiks-projects.vercel.app) is ready with STAGED status. OpenAPI, marketplace, profiles, OpenAPI again and the native Fumadocs reference all returned HTTP 200. The spec equaled the committed generated snapshot both before and after ordinary API traffic. The `dojo.foo` alias remained on `dpl_DrTmJCAgt3oLbgrm8xJt3CJa29yB`; no production promotion occurred.

## Isolated UIX artifact follow-through (local review, 2026-10-27)

A fresh source archive of a6694fb began without node_modules. The committed manifests/lockfile passed a UIX-filtered frozen offline installation with scripts disabled: 1,250 packages, no downloads, pnpm 10.28.0, 15.5s. Its own dependency tree is separate from the review worktree. This isolates the UIX check from pending local branding/composer/auth files; it is not a full-workspace or installed-CLI release gate.

The static build initially failed while evaluating Storybook configuration: its development-only language fixture eagerly imported the local app's TypeScript service, whose dependencies are intentionally absent from this UIX-only installation. The fixture now imports that same unchanged service inside Vite's development-server hook. The resulting static build completed, but browser acceptance then exposed an actual editor failure: /assets/assets/monaco-0.4.2/editor-core.mjs. modern-monaco reads the import-map value itself and dynamically imports it from its JavaScript module. UIX now resolves the configured asset URL against document.baseURI before supplying that value, preserving absolute application bases and fixing the relative Storybook build base. No service, endpoint, agent or compiler implementation changed.

Final isolated gates: UIX types passed, 69 unit tests passed (9.55s), and the complete Slidev/Storybook build passed (74.15s). All 20 static Pages checks passed in light/dark (11.2s), including both formerly failing learner editors. The built artifact loaded Inter and Iosevka and spawned its local Monaco worker; editor core, both worker modules, TypeScript grammar and both font assets returned HTTP 200 with appropriate MIME types. No external script/font requests or page errors occurred, and phone layout settled without document overflow. Desktop/phone screenshots inspected. The first phone probe checked immediately after resize; waiting for the responsive layout to settle required no product change.

The restarted development Storybook passed both diagnostics/completion and JSDoc/reference checks (14.5s). Its initial checks timed out during startup; the same server recovered without another restart or further code changes, and a direct diagnostic request returned TypeScript 2322 with HTTP 200 in 0.001745s. The final two checks passed again after the import-map fix. Native host types and UI/CLI build passed; five canonical native checks passed (24.1s), covering file-model/save/undo retention, agent switching and account-settings drafts. https://dojo.localhost returned HTTP 200.

Evidence: /tmp/dojo-uix-clean-{meta,source-proof}.json; /tmp/dojo-uix-clean-{install,build,fixed-build,final-types,final-tests,final-build,static-pages,static-final-pages,assets-final}.log; /tmp/dojo-uix-relative-monaco-{native-build,native-browser,host-types,language-browser}.log; /tmp/dojo-uix-clean-static-learner-{desktop,phone}.png. The snapshot's 339 tracked UIX files matched the preceding commit except the two verified candidate files; root manifests and lockfile remained identical. No dependencies or permanent implementation-mirroring tests were added.

Only the Storybook fixture import and UIX browser asset binding are changed. Agent, authoring-service and UI-server source diffs are empty; all 18 root audit hashes remain intact. The owned development Storybook now runs as pueue task 2092 on port 6025; user Storybooks and website tasks are preserved, and native review remains task 2091. The temporary static server was stopped after verification. Local and unmerged; older core-containing branch history, pending user UI changes, full migration/CLI-package/CI and release acceptance remain outside this checkpoint.


## Pending marketing components compile within UIX (working review)

The combined working tree, including the pending marketing/auth/branding work, failed UIX typing with eight errors: five next/link imports and three missing buttonVariants exports in the pricing/header/footer templates. Those five files now use native anchors and the already-present UIX ButtonLink, mapping outline styling to secondary. The next combined unit gate found eleven production-boundary violations from host aliases. Twenty-four aliases in ten pending component/template files now resolve relatively to existing UIX sources; this import normalization leaves component bodies byte-identical. No dependencies, framework configuration, service or core implementation changed.

Final combined working-tree gates: UIX types passed; 19 test files / 69 tests passed (12.27s), including production boundaries. Header, Footer, Pricing, Comparator and FAQs each rendered successfully with native links in a fresh SSR probe. A source comparison preserved all navigation/action attributes and JSX copy, and all 18 root audit file hashes remain unchanged. Agent/authoring/UI-server diffs and the Git index are empty. Evidence: /tmp/dojo-ui-combined-review-{types.log,types-final.log,tests.log,tests-fixed.log}, /tmp/dojo-uix-template-{render-final.log,preservation.json,imports.patch}.

These repairs stay with the user's pending untracked components; they are not staged or committed as an unrelated new pricing/auth feature. They establish combined local source health, not a clean-install, CI, browser-layout or release claim. Full UI adoption and hosted/package acceptance remain open; Eve/core remain frozen.
