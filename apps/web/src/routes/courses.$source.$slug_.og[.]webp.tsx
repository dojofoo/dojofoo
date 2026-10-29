import { createFileRoute } from '@tanstack/react-router'

// A course's card, beside its page: /courses/<source>/<slug>/og.webp
export const Route = createFileRoute('/courses/$source/$slug_/og.webp')({
  server: {
    handlers: {
      GET: async ({ params }) => (await import('@/lib/og-pages')).courseCard(params.source, params.slug),
    },
  },
})
