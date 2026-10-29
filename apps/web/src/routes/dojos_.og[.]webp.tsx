import { createFileRoute } from '@tanstack/react-router'

// The dojos page's card, beside the page: /dojos/og.webp
export const Route = createFileRoute('/dojos_/og.webp')({
  server: {
    handlers: {
      GET: async () => (await import('@/lib/og-pages')).dojosCard(),
    },
  },
})
