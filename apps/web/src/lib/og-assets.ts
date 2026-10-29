// Server-only asset loading for OG image generation.
//
// Takumi runs server-side and dereferences any `url(...)` it sees by HTTP
// fetch. In dev that means hitting our own dojofoo.td via TLS, where the
// portless self-signed cert handshake is brittle. We sidestep the network
// entirely by embedding assets at build time as `data:` URIs. Deployed
// functions do not contain the source project's public directory.

import topographyMap from '../../public/og-map-topography.png?inline'
import wavesMap from '../../public/og-map-waves.png?inline'
import fade from '../../public/og-fade.png?inline'
import shadow from '../../public/og-shadow.png?inline'
import topography from '../../public/og-cards/topography.jpg?inline'
import network from '../../public/og-cards/network.jpg?inline'
import waves from '../../public/og-cards/waves.jpg?inline'
import opal from '../../public/og-cards/opal.jpg?inline'
import logoWordmark from '../../../../assets/brand/dojofoo-dark.svg?raw'
import iosevka from '@fontsource/iosevka/files/iosevka-latin-400-normal.woff2?inline'
import inter from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline'

/** The cards' ground (scripts/og-ground.mjs): the footer's map, 2400 wide – the contour map, or the waves for the
    docs – the glass fade over it and a course card's shadow, each shade dithered; and its color */
export const ogMaps = { topography: topographyMap, waves: wavesMap } as const
export const ogFade = fade
export const ogShadow = shadow
export const OG_GROUND_COLOR = '#171717'

/** Which 1200 of a map's 2400 a page shows, and whether mirrored: seeded by its path, so each page has its own and
    keeps it */
export function mapWindow(path: string) {
  // FNV-1a
  let hash = 0x811c9dc5
  for (const character of path) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0
  return { x: hash % 1201, flip: (hash >>> 16) % 2 === 1 }
}

/** What drifts over a course card, white on black (scripts/og-textures.mjs), at the strength ColorCard screens it */
export const cardLines = {
  // The capture's soft contour lines need full strength to read as the live card's
  topography: { src: topography, opacity: 1 },
  network: { src: network, opacity: 0.45 },
  waves: { src: waves, opacity: 0.4 },
  opal: { src: opal, opacity: 0.6 },
} as const

/** Wide "DOJO.FOO" wordmark — the single brand mark. */
export const getLogoWordmarkDataUrl = () =>
  Promise.resolve(`data:image/svg+xml;base64,${Buffer.from(logoWordmark).toString('base64')}`)

/** The cards' fonts, the site's: Inter, and Iosevka for a course's repository */
export const ogFonts = [
  { name: 'Inter', data: inter },
  { name: 'Iosevka', weight: 400, data: iosevka },
].map(({ data, ...font }) => ({ ...font, data: Buffer.from(data.split(',')[1], 'base64') }))
