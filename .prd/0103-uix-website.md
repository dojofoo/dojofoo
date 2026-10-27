# 0103: Use UIX for the public website

Parent: [UIX adoption](0100-uix-adoption.md).
Status: ready after 0102; implementation has not started.

## Goal

Render the homepage, course catalog, course details and shared search with the approved UIX compositions, using the website's real server data, TanStack routes and metadata. Retain the supported URLs and browser history. Documentation keeps its native content pipeline and adopts the shared header deliberately before the full docs-layout slice.

## Implementation boundaries

- Preserve `/`, `/dojos`, `/courses/$source/$slug`, the `dojocho` source alias, server loading/cache headers, missing-course behavior and social metadata.
- Map `MarketplaceCourse` into UIX display props in the application. Make unsupported ratings, hours, GitHub stars, first-seen dates, security audits and chapter titles optional in presentation and omit unavailable facts. Real metrics remain real; never invent a value to satisfy a fixture-oriented prop.
- Supply real hrefs and intercept only unmodified primary clicks for TanStack navigation. Cards, brand, sections, footer, quickstart and documentation links support deep linking, modifier clicks and new tabs. Keep the story adapter using the same contract.
- Give global search one owner. Reuse the existing Fumadocs/marketplace search adapter and shared UIX palette. Do not register a competing Ctrl/Cmd-K handler in the header. Test course/docs scope, result navigation, escape and reopening.
- Preserve query/filter/sort behavior. UIX owns the controls and layout; route state belongs to the host. Keep browser back/forward and copied install commands meaningful.
- Import the shared UIX fonts/styles and native view-transition primitives. Keep actual route transitions in the router. Verify docs and public pages together so styles do not accidentally break the next migration surface.
- Extract the landing illustration into a focused UIX presentation export if needed; its sample identity/course/conversation/model remain an explicit marketing illustration. Do not import the simulated learner controller into application runtime code.
- Preserve responsive 16:9 preview sizing, mode carousel selection/autoplay, brand halo, Kata badge, and approved Start learning/Get started destinations.

## Gate

Start with the existing website browser suite on 0102, then reproduce new requirements with targeted assertions. Adapt presentation selectors to the approved UIX wording while retaining functional checks for real data, sort/filter/search/install, metrics, SSR and navigation. Add modifier-click/href and no-fabricated-metadata coverage where it tests missing behavior rather than implementation details.

```sh
CI=true pnpm install --frozen-lockfile
pnpm --filter @dojofoo/uix types:check
pnpm --filter @dojofoo/uix test
pnpm --filter @dojofoo/web types:check
pnpm --filter @dojofoo/api openapi:check
DOJO_WEB_TEST_PORT=4410 DOJO_API_TEST_PORT=4411 DOJO_API_TEST_ORIGIN=http://127.0.0.1:4411 pnpm --filter @dojofoo/web test:e2e
pnpm build
pnpm --filter dojofoo test:package
```

Run the affected Storybook browser cases against an isolated server, including website search and landing modes. Inspect desktop/mobile renders. Verify the actual PR/staged deployment, including native API pages and machine-readable docs affected by shared styles. Main builds stay staged; leave the live production alias unchanged until a verified version release.
