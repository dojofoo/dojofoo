import { createFileRoute } from '@tanstack/react-router'
import khand from '@fontsource/khand/files/khand-latin-500-normal.woff2?inline'
import hind from '@fontsource/hind/files/hind-latin-400-normal.woff2?inline'
import { Grid } from '@/components/og/grid'
import { getLogoWordmarkDataUrl } from '@/lib/og-assets'

export const Route = createFileRoute('/og.webp')({
  server: {
    handlers: {
      GET: async () => {
        // Native bindings are loaded only for image requests, not unrelated SSR.
        const [{ Renderer }, { default: ImageResponse }] = await Promise.all([
          import('@takumi-rs/core'),
          import('takumi-js/response'),
        ])
        const renderer = new Renderer()
        await Promise.all([
          renderer.registerFont({ name: 'Khand', weight: 500, data: Buffer.from(khand.split(',')[1], 'base64') }),
          renderer.registerFont({ name: 'Hind', weight: 400, data: Buffer.from(hind.split(',')[1], 'base64') }),
        ])
        return new ImageResponse(
          <Grid
            title="Agentic teaching built around your learning"
            description="Practice with katas. Save your progress. Author your own course."
            brand=""
            logo={await getLogoWordmarkDataUrl()}
          />,
          { width: 1200, height: 630, format: 'webp', renderer,
            headers: { 'Cache-Control': 'public, max-age=0, s-maxage=3600' },
          },
        )
      },
    },
  },
})
