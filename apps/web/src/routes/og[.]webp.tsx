import { createFileRoute } from '@tanstack/react-router'

// The site's card; every page's own is at its address + /og.webp
export const Route = createFileRoute('/og.webp')({
  server: {
    handlers: {
      GET: async () => (await import('@/lib/og-pages')).siteCard(),
    },
  },
})
