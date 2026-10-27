# 0104: Use UIX layouts for native documentation and API reference

Parent: UIX adoption (0100).
Status: in progress on `feat/0104-uix-docs` in `.worktree/uix-0104`, based on verified main `c0173fd`.

Goal: serve the real compiled Fumadocs documentation and Elysia-generated OpenAPI pages inside the shared UIX documentation frame, using the application's router and content pipeline for URLs, history, headings, search and metadata.

Use the existing catch-all route and source loader. Preserve all public documentation, authoring, developer, generated API, llms.mdx, llms.txt, Markdown, search and OG URLs. Keep server-only source/preloading imports behind server functions and retain native Fumadocs OpenAPI rendering with server-preloaded documents. Do not replace compiled MDX with the story Markdown projection.

Inspect UIX DocsSite before mounting it: it currently owns demo navigation, Markdown pre-rendering and a local current path. Production must provide the controlled current path and route actions, actual content metadata/order and compiled TOC. Native anchors must retain modified-click and pre-hydration behavior. Stories should adapt the same controlled presentation using their explicit fixture content, rather than becoming production routers.

Build navigation metadata from Fumadocs' source/page tree and its deliberate ordering. Do not ship raw MDX globs, simulated help pages or fixture APIs. The current compiled page supplies its title, description, TOC and content; current source endpoints own copied Markdown and edit links. Avoid loading every page's Markdown just to render navigation. Missing paths remain HTTP 404, rather than silently displaying the first story page.

Retain code highlighting, native request/response controls and API search. Replace legacy docs title/body/sidebar/footer presentation only as its real consumers move. Keep application-wide providers/search single-owned. Test typography, responsive tree/TOC controls, keyboard focus, deep heading links, back/forward, modified clicks and native pane transitions without duplicate transitions.

Gate: fresh frozen install; API schema/prepared-data checks; UIX and web types/unit tests; website full browser suite expanded for documentation navigation/mobile/deep links; affected Storybook navigation/API browser tests; forced workspace build and installed CLI check. Compare desktop/mobile production compositions with their stories and inspect screenshots. Run hosted Verify and protected deployed HTTP/browser probes for actual docs, generated API pages and machine-readable endpoints before merging. Main stays staged and live production remains unchanged until slice 0110.

Known prerequisite: do not reintroduce Elysia precompile:true; it caused Bun response-stream startup failures in a prior rejected implementation. The committed schema explicitly fixes lazy-validation response defaults and must remain identical before and after live route traffic.

Baseline from the clean checkout: frozen installation completed in 20.5s, UIX and web types passed, UIX 50 tests passed, website 13 browser tests passed (30.5s). Keep the root audit work untouched.

An invalid Markdown path (`/llms.mdx/docs/index.mdx`) currently returns HTTP 500 on staging; the supported Usage path (`/llms.mdx/docs/docs/index.mdx`) returns 200. Add missing-Markdown status coverage while retaining the existing supported URL. Successful marketplace/profile requests also log `[exact-mirror] TypeBox's TypeCompiler is required to use Union`; inspect the actual runtime/dependency mechanism before changing API configuration.

## Current implementation and evidence

The shared DocsSite now takes its current path from its host. Storybook owns its demonstration router and Markdown preloading; the production host uses its existing Fumadocs source, compiled MDX client loader and server-preloaded native OpenAPI props. The application maps the actual Fumadocs tree (whose root index pages are ordinary children) into UIX metadata in its existing deliberate tab order. Legacy dojo documents retain their own sidebar and pager without adding a Dojos tab to the main docs navigation. Only the current page's processed Markdown is loaded for copying.

A delayed-response regression proved that using the optimistic browser pathname could show a new heading with an old page's metadata. Display now follows the loader's canonical document URL until the next document is ready. A DOM-identity regression also proved that putting the entire frame inside the per-page MDX renderer remounted the header and sidebar; the persistent host frame now surrounds the changing compiled content. Native compiled TOC IDs and rich titles are serialized from Fumadocs' actual TOC; the library receives presentation-only heading props. Heading links update the real URL, preserve modified clicks, and support browser history. The shared frame preserves heading focus when its controlled path changes.

The missing Markdown route returns an explicit HTTP 404. The Installation component composes shared UIX command-copy, button and segment controls and retains the actual setup prompt. Native MDX heading links inherit heading typography, and compiled prose uses the same body treatment as the story projection. API methods, request controls, examples and preloading remain native Fumadocs/Elysia.

Fresh local types passed for web/UIX. UIX: 51 tests passed; API: 42 passed; OpenAPI/prepared data: 10 pages verified. Website browsers: `17 passed (24.0s)`. Storybook browsers: `77 passed (2.0m)`. Targeted docs checks also verified held-response consistency, persistent header/sidebar DOM nodes, complete copied Markdown, heading URL/history, modified-click/new tabs, desktop/mobile rendering and legacy section navigation. Forced workspace build passed: `6 successful, 6 total`, `0 cached`, `34.998s`. Packed authoring-agent readiness passed without a model call, and the installed UI returned HTTP 200. Production Storybook build completed successfully. Hosted CI and actual deployment verification remain pending.
