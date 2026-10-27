# 0101: Restore release health and establish the migration baseline

Parent: [UIX production adoption](0100-uix-adoption.md).
Status: done; merged in PRs 182, 183 and 185; hosted Verify and main Release passed. Completed worktrees removed.

## Outcome

Establish a reproducible, releasable baseline for adopting UIX in the website, docs, and local application. Resolve the verified post-merge build failure and the known web integration/type/browser failures before expanding the migration. Record the real route and runtime contracts that later visual replacements must preserve.

## Starting evidence

- Main includes UIX checkpoint PR #181 at `4f31a76116d23c8d9613f77d80698b5dc766096b`.
- [Release run 40383156955](https://github.com/dojofoo/dojofoo/actions/runs/40383156955) failed in `pnpm build`: `sh: 1: bun: not found` and `spawn ENOENT`.
- `apps/web/package.json` runs `pnpm --filter @dojofoo/api openapi:generate` before Vite build. API generation uses Bun. `.github/workflows/release.yml` installs Node 24 and pnpm; its mise action has `install: false` and no Bun setup.
- The [parent plan's Epicat review](0100-uix-adoption.md#openapi-decision-reuse-the-elysia-plugin-and-epicats-ownership-pattern) confirms that Dojo already mounts Elysia's OpenAPI plugin and exports its JSON endpoint in process, just as Epicat does. This slice fixes the generator's execution environment, not a missing OpenAPI middleware.
- The checkpoint's isolated website suite had 7 passing and 4 failing tests. Failures covered docs/home headings, a GitHub navigation link, and asserted cache lifetime. Check the assertions and intended UI before changing expectations.
- Web type checking has unresolved MDX component typing and Monaco virtual-module integration. Reproduce on the selected base rather than relying on previous logs.
- The root checkout contains concurrent audit work. Do not stage or change it as part of this slice.

## Scope and implementation order

1. Read repository/workflow instructions. Inspect the latest main, scripts, workflow, lockfile, and current runtime/toolchain declarations. Create an isolated checkout and branch from main. Record the exact base and installed tool versions.
2. Reproduce OpenAPI generation/build with a frozen install in the declared environment. Confirm the missing Bun dependency remains the failing mechanism. Trace the existing `.use(openapi(...))` -> `app.handle(...)` -> JSON snapshot -> Fumadocs generation chain; retain Elysia route/schema metadata as the authoritative source.
3. Make the toolchain explicit. Prefer declaring the required Bun version and installing it in each build environment that invokes the existing Bun generator. Use the repository's toolchain convention if present. Alternatively, make generation Node-compatible only if inspection shows that is the smaller coherent change. Choose one supported path; do not add a silent fallback or remove generation from verification. Keep generation in process: no listening API server, network fetch from staging/production, database credentials, or replacement schema generator should be necessary to export the public contract.
4. Resolve the MDX typing and UIX Monaco virtual-module boundary at their owning modules/configuration. Do not suppress errors with `any`, disable checks, or redirect the website's existing source aliases to UIX.
5. Reconcile the four website browser assertions with approved current behavior. Fix actual regressions; update stale assertions only where the expected behavior is established. Keep search, real API reference, install/navigation actions, and cache behavior covered.
6. Record a concise route/capability inventory for homepage/catalog/course detail, docs/API/search/metadata, local dashboard/lesson/session, interactive learning, authoring, onboarding/settings, and packaged CLI. For each, identify the current controller/service and intended UIX composition. Put the inventory in the parent plan or an adjacent linked technical note; do not create a new framework.
7. Run the relevant gates locally from the isolated checkout. Open the normal PR with exact verification results, then verify its actual CI. Do not declare the release blocker resolved solely from a workstation that already has Bun installed.

## Changes intentionally deferred

Route/capability inventory: [UIX production adoption](../docs/architecture/uix-production-adoption.md).

No page redesign, new course content, agent runtime replacement, auth/billing backend, public publishing, or wholesale component move. UIX public exports/provider/fixture separation are slice 0102. Preserve unrelated audit/API/schema changes.

## Gates

First run small probes to identify tool and generator failures, then the relevant suites. The full build here is a required release gate, not a performance experiment. Use a clean frozen install and declared tools; capture actual output and durations.

```sh
CI=true pnpm install --frozen-lockfile
pnpm --filter @dojofoo/api openapi:check
pnpm --filter @dojofoo/api test
pnpm --filter @dojofoo/uix types:check
pnpm --filter @dojofoo/web types:check
DOJO_WEB_TEST_PORT=4410 DOJO_API_TEST_PORT=4411 DOJO_API_TEST_ORIGIN=http://127.0.0.1:4411 pnpm --filter @dojofoo/web test:e2e
pnpm build
pnpm --filter dojofoo test:package
```

Choose different unused ports if needed, keeping the origin aligned with the fixture API port. Confirm the test configuration and process ownership before starting servers. Run additional targeted tests only where the actual patch needs them. Record any remaining failures explicitly; this slice does not pass while required gates are waived.

The workflow itself must pass on a clean hosted runner with its declared tools. After merge, inspect the actual main release job and staging deployment. Verify the deployed affected docs/API routes if the change affects their generated artifacts. No production release is implied by this slice.

## Acceptance

- OpenAPI generation and build do not depend on an undeclared globally installed Bun binary.
- Elysia remains the specification source and generated Fumadocs artifacts remain verified.
- The runtime `/api/v1/openapi/json` document equals the exported JSON snapshot; the build uses that snapshot and needs no running/deployed API. Keep the existing plugin and native Fumadocs consumption rather than copying Epicat's custom renderer. Application-to-UIX prepared-document injection remains the explicit follow-up in 0102.
- Website type checking and browser suite pass with expectations matching intended behavior.
- Clean build and packaged CLI gate pass; actual CI and the main release job pass after merge.
- Parent migration plan links the route/capability inventory and evidence for this baseline.
- The diff contains only the prerequisite repairs/inventory. Concurrent work is untouched.

Rollback is the normal PR revert; no course files, persisted sessions, installation layout, or progress formats change in this slice.


## Execution evidence (2026-10-26)

Clean worktree based on the recorded main commit; frozen installation. Final gates used Node 24.22.1, pnpm 10.28.0, and Bun 1.4.3. An earlier local pass used the machine's Node 26 inside the nested worktree; the release gates were rerun with Node 24 explicitly selected.

The unchanged baseline reproduced the four website failures and failed clean-checkout type checking. In addition to the recorded MDX/Monaco errors, fresh type checking exposed a missing generated route tree and the API renderer's UIX source aliases. The fix declares the already-installed TanStack route generator as a direct development dependency, runs it before type checking, keeps MDX override merging typed, and makes the affected UIX imports/declaration self-contained.

Both release and PR verification use `.bun-version` through the pinned official setup action. No OpenAPI generator or renderer was replaced. The route inventory is linked above. Website tests now exercise the catalog at `/dojos`, current documentation/navigation, the existing 300-second shared cache policy, and actual filter/sort/search/install/detail flows. Select tests wait for the existing selection acknowledgment to close before reopening; palette navigation waits for the destination content before reopening search.

Fresh local gate output:

```text
Verified Elysia OpenAPI document.
Verified 10 Fumadocs OpenAPI pages and their prepared data.
API: Test Files 6 passed (6); Tests 41 passed (41).
UIX: Test Files 8 passed (8); Tests 39 passed (39).
UIX types: exit 0.
Website types (including generated routes): exit 0.
Website browser: 11 passed (18.5s).
Build: Tasks 6 successful, 6 total; Cached 0 cached; Time 33.701s.
Packed master authoring agent passed readiness without a model call.
Packed dojo UI responded with HTTP 200.
```

These are local results from the isolated checkout. Attach the PR/check URLs and main release/staging evidence before marking this slice done.


Hosted follow-through: [PR 182](https://github.com/dojofoo/dojofoo/pull/182) restored the baseline. [PR 183](https://github.com/dojofoo/dojofoo/pull/183) retained bundled private packages in Changesets' version graph and fetched the comparison history. [PR 185](https://github.com/dojofoo/dojofoo/pull/185) limited registry verification to actual publication. The final [main Release run](https://github.com/dojofoo/dojofoo/actions/runs/40420797349) succeeded. Release PR 184 remains separate; no version release was merged for this prerequisite.

The PR deployment's native API reference and exported ten-operation document were verified through authenticated Vercel requests. Deployment review also exposed automatic production-domain promotion on main. Slice 0102 records its reversible correction and the remaining version-tag promotion work; a successful main build alone is not production release acceptance.
