import { createFileRoute, notFound } from '@tanstack/react-router'
import DocumentationTemplate from '@/components/og/documentation-template'

const SECTIONS: Record<string, string> = {
  docs: 'Docs',
  dojos: 'Dojos',
}

export const Route = createFileRoute('/og/$')({
  server: {
    handlers: {
      GET: async ({ params }: { params: { _splat?: string } }) => {
        const raw = params._splat?.split('/') ?? []
        const last = raw[raw.length - 1]
        if (!last || !last.startsWith('image.')) throw notFound()
        const slugs = raw.slice(0, -1)

        // Lazy import — keeps `lib/source` (with its server-only fumadocs-mdx
        // runtime that uses node:path) out of any client bundles.
        const { source } = await import('@/lib/source')
        const { getOgBackgroundDataUrl, getLogoWordmarkDataUrl } = await import(
          '@/lib/og-assets'
        )
        const page = source.getPage(slugs)
        if (!page) throw notFound()

        // A native image dependency must never initialize unrelated page routes.
        const { default: ImageResponse } = await import('takumi-js/response')

        const section = SECTIONS[slugs[0]] ?? ''
        const [backgroundUrl, logoUrl] = await Promise.all([
          getOgBackgroundDataUrl(),
          getLogoWordmarkDataUrl(),
        ])

        return new ImageResponse(
          <DocumentationTemplate
            title={page.data.title}
            description={page.data.description}
            section={section}
            backgroundUrl={backgroundUrl}
            logoUrl={logoUrl}
          />,
          { width: 1200, height: 630, format: 'webp' },
        )
      },
    },
  },
})
