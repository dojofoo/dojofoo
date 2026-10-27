The Course API runs on Elysia. Route schemas and descriptions in `src/api-schema.ts`
power the live OpenAPI document at `/api/v1/openapi/json` and the Scalar explorer at
`/api/v1/openapi`.

Run `pnpm --filter @dojofoo/api openapi:generate` after changing a documented route.
It writes the spec and endpoint MDX pages to `apps/web/content/docs/api`. The website
build runs this step automatically. `openapi:check` verifies the checked-in spec and
pages; the API test suite also checks that its live spec matches the generated file.

The website uses `fumadocs-openapi` to generate operation MDX and prepare the Elysia
document. UIX Storybook consumes that same prepared document and native Fumadocs
renderer and generated examples. The current design disables the playground,
TypeScript definitions, and response-schema panel.
Examples sit beside the endpoint on wide screens and below it on smaller screens.

The root Elysia app precompiles its validators before exporting OpenAPI. Elysia's
lazy compilation otherwise adds response schema metadata after endpoints are
first used, causing the live document to drift from the build-time snapshot.
The cold-versus-used API regression check covers all documented GET routes and
the event route. Generation still calls the in-process handler without a
listening server or a database request.
