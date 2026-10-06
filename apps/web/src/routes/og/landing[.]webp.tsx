import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/og/landing.webp')({
  server: {
    handlers: {
      GET: () => new Response(null, { status: 302, headers: { Location: '/og.webp' } }),
    },
  },
})
