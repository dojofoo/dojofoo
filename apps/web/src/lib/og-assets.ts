// Server-only asset loading for OG image generation.
//
// Takumi runs server-side and dereferences any `url(...)` it sees by HTTP
// fetch. In dev that means hitting our own dojofoo.td via TLS, where the
// portless self-signed cert handshake is brittle. We sidestep the network
// entirely by embedding assets at build time as `data:` URIs. Deployed
// functions do not contain the source project's public directory.

import background from '../../public/og-bg.png?inline'
import ground from '../../public/og-ground.png?inline'
import logoWordmark from '../../../../assets/brand/dojofoo-dark.svg?raw'

/** Cherry-blossom OG background. */
export const getOgBackgroundDataUrl = () =>
  Promise.resolve(background)

/** The footer's contour map, blurred and fading up (scripts/og-ground.mjs), and its color */
export const getOgGroundDataUrl = () => Promise.resolve(ground)
export const OG_GROUND_COLOR = '#171717'

/** Wide "DOJO.FOO" wordmark — the single brand mark. */
export const getLogoWordmarkDataUrl = () =>
  Promise.resolve(`data:image/svg+xml;base64,${Buffer.from(logoWordmark).toString('base64')}`)
