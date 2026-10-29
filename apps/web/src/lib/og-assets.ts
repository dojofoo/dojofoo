// Server-only asset loading for OG image generation.
//
// Takumi runs server-side and dereferences any `url(...)` it sees by HTTP
// fetch. In dev that means hitting our own dojofoo.td via TLS, where the
// portless self-signed cert handshake is brittle. We sidestep the network
// entirely by embedding assets at build time as `data:` URIs. Deployed
// functions do not contain the source project's public directory.

import ground from '../../public/og-ground.png?inline'
import topography from '../../public/og-cards/topography.jpg?inline'
import network from '../../public/og-cards/network.jpg?inline'
import waves from '../../public/og-cards/waves.jpg?inline'
import opal from '../../public/og-cards/opal.jpg?inline'
import logoWordmark from '../../../../assets/brand/dojofoo-dark.svg?raw'
import iosevka from '@fontsource/iosevka/files/iosevka-latin-400-normal.woff2?inline'
import inter from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?inline'

/** The footer's contour map, blurred and fading up (scripts/og-ground.mjs), and its color */
export const getOgGroundDataUrl = () => Promise.resolve(ground)
export const OG_GROUND_COLOR = '#171717'

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
