// Universal helpers safe to import from both server and client bundles.
// IMPORTANT: do NOT import from `collections/server` or any module that
// transitively pulls in `fumadocs-mdx/runtime/server` — those use `node:path`
// and Vite browser-shims them, breaking client hydration. Server-only
// pieces live in `./source.ts`.

export const SITE_URL =
  process.env.SITE_URL?.replace(/\/$/, '') ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
    : 'https://dojo.foo')

/**
 * Absolute OG-image URL for a doc page, served by `routes/og/$.tsx`.
 *
 * `slugs` should be the same array fumadocs gives us (e.g. ['docs','installation']).
 * We append `image.webp` so the route's catch-all matches the
 * "ends with image.<ext>" sentinel.
 */
export function getPageImage(slugs: string[]) {
  const segments = [...slugs, 'image.webp']
  const path = '/og/' + segments.join('/')
  return {
    segments,
    url: SITE_URL + path,
  }
}
