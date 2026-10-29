import type { ReactElement } from 'react'
import { OG } from '@/components/og/dojo-og'
import { ogFonts } from './og-assets'

// One renderer per server, its fonts registered once; native bindings load only for image requests
let renderer: Promise<import('@takumi-rs/core').Renderer> | undefined
const getRenderer = () => renderer ??= (async () => {
  const { Renderer } = await import('@takumi-rs/core')
  const created = new Renderer()
  await Promise.all(ogFonts.map((font) => created.registerFont(font)))
  return created
})()

/** A social card as WebP, cached an hour at the edge */
export async function ogImage(node: ReactElement) {
  const [{ default: ImageResponse }, takumi] = await Promise.all([import('takumi-js/response'), getRenderer()])
  return new ImageResponse(node, {
    // Lossless, and dithered (on top of the ground's own dither), so the card's gradient and the type's edges don't band
    ...OG, format: 'webp', lossless: true, dithering: 'floyd-steinberg', renderer: takumi,
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=3600' },
  })
}
