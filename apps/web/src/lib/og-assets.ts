// Server-only asset loading for OG image generation.
//
// Takumi runs server-side and dereferences any `url(...)` it sees by HTTP
// fetch. In dev that means hitting our own dojofoo.td via TLS, where the
// portless self-signed cert handshake is brittle. We sidestep the network
// entirely by reading static assets from disk at module init and inlining
// them as `data:` URIs.

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const cache = new Map<string, string>()

async function dataUrl(relPath: string, mime: string): Promise<string> {
  const cached = cache.get(relPath)
  if (cached) return cached
  const filePath = resolve(process.cwd(), relPath)
  const bytes = await readFile(filePath)
  const url = `data:${mime};base64,${bytes.toString('base64')}`
  cache.set(relPath, url)
  return url
}

/** Cherry-blossom OG background. */
export const getOgBackgroundDataUrl = () =>
  dataUrl('public/og-bg.png', 'image/png')

/** Wide "DOJO.FOO" wordmark — the single brand mark. */
export const getLogoWordmarkDataUrl = () =>
  dataUrl('public/dojofoo.svg', 'image/svg+xml')
