import { deflateSync, inflateSync } from 'node:zlib'
import topography from '../../public/og-map-topography.bin?inline'
import waves from '../../public/og-map-waves.bin?inline'

/*
 * A social card's ground, per page: its window of the footer's map (scripts/og-ground.mjs: 2400 wide, each level kept
 * to 1/64), the glass fade over it and, under a course's card, the card's shadow – shaded in full precision and
 * dithered straight after, then handed to Takumi as an 8-bit image. Takumi composites in 8 bits, so a fade or a shadow
 * it drew would step into bands, and grain under it would round away.
 */

export const OG_GROUND = 23
const W = 1200, H = 630, STRIP = 2400
const maps = { topography, waves } as const
export type OgMap = keyof typeof maps

// The maps, decoded once per server: each level in 64ths
const decoded = new Map<OgMap, Uint16Array>()
const mapOf = (kind: OgMap) => {
  let sums = decoded.get(kind)
  if (!sums) {
    const bytes = inflateSync(Buffer.from(maps[kind].split(',')[1], 'base64'))
    sums = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2)
    decoded.set(kind, sums)
  }
  return sums
}

/** Which 1200 of a map's 2400 a page shows, and whether mirrored: seeded by its path (FNV-1a), its own for good */
export function mapWindow(path: string) {
  let hash = 0x811c9dc5
  for (const character of path) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193) >>> 0
  return { x: hash % (STRIP - W + 1), flip: (hash >>> 16) % 2 === 1 }
}

// The glass fade, how much of the ground covers the map: linear-gradient(100deg) from 0.7 to clear (CSS: 0deg points
// up, turning clockwise)
const fade = (() => {
  const angle = (100 * Math.PI) / 180, dx = Math.sin(angle), dy = -Math.cos(angle)
  const length = Math.abs(W * dx) + Math.abs(H * dy)
  const stops = [[0, 0.702], [0.35, 0.502], [0.65, 0.102], [1, 0]] as const
  const out = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = Math.min(1, Math.max(0, ((x + 0.5 - W / 2) * dx + (y + 0.5 - H / 2) * dy) / length + 0.5))
    const i = stops.findIndex(([at]) => at >= t)
    const [a, va] = stops[Math.max(0, i - 1)], [b, vb] = stops[Math.max(1, i)]
    out[y * W + x] = i <= 0 ? stops[0][1] : va + ((t - a) / (b - a)) * (vb - va)
  }
  return out
})()

// A course card's shadow, what's left of the light under it: the card as components/og/dojo-og lays it out (420px, 96px
// from the right, centered; its edge 3px right and 5px down casts it), each box shadow its rectangle blurred by a
// Gaussian of σ = blur / 2 – separable, so a column's and a row's cover multiply
const shadow = (() => {
  const card = { left: W - 96 - 420 + 3, top: (H - 420) / 2 + 5, size: 420 }
  const layers = [{ y: 56, blur: 90, spread: -16, alpha: 0.75 }, { y: 22, blur: 36, spread: -8, alpha: 0.5 }]
  const erf = (x: number) => { const s = Math.sign(x), t = 1 / (1 + 0.3275911 * Math.abs(x)); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)) }
  const cover = (v: number, from: number, to: number, sigma: number) => 0.5 * (erf((to - v) / (sigma * Math.SQRT2)) - erf((from - v) / (sigma * Math.SQRT2)))
  const out = new Float32Array(W * H).fill(1)
  for (const { y: offset, blur, spread, alpha } of layers) {
    const sigma = blur / 2
    const columns = Float32Array.from({ length: W }, (_, x) => cover(x + 0.5, card.left - spread, card.left + card.size + spread, sigma))
    const rows = Float32Array.from({ length: H }, (_, y) => cover(y + 0.5, card.top + offset - spread, card.top + card.size + offset + spread, sigma))
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) out[y * W + x] *= 1 - alpha * columns[x] * rows[y]
  }
  return out
})()

/** A page's ground as a PNG data URL: its window of the map, faded, with a card its shadow, dithered */
export function ogGround(kind: OgMap, path: string, withShadow = false) {
  const sums = mapOf(kind)
  const { x: offset, flip } = mapWindow(path)
  const gray = Buffer.alloc((W + 1) * H)
  for (let y = 0; y < H; y++) {
    gray[y * (W + 1)] = 0
    for (let x = 0; x < W; x++) {
      const column = flip ? offset + W - 1 - x : offset + x
      const at = y * W + x
      let level = sums[y * STRIP + column] / 64
      level = level * (1 - fade[at]) + OG_GROUND * fade[at]
      if (withShadow) level *= shadow[at]
      // Triangular noise of a level either way, then rounded: the shade's slow ramps grain instead of banding
      gray[y * (W + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(level + Math.random() + Math.random() - 1)))
    }
  }
  return `data:image/png;base64,${png(gray).toString('base64')}`
}

/** An 8-bit gray PNG from its filtered rows (each a 0 filter byte, then its levels) */
function png(rows: Buffer) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([size, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(W, 0); header.writeUInt32BE(H, 4); header.set([8, 0, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 1 })), chunk('IEND', Buffer.alloc(0))])
}

const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
function crc32(buffer: Buffer) {
  let crc = ~0
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return ~crc >>> 0
}
