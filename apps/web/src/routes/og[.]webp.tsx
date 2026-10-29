import { createFileRoute } from '@tanstack/react-router'
import { DojoOg } from '@/components/og/dojo-og'
import { getLogoWordmarkDataUrl, getOgGroundDataUrl, OG_GROUND_COLOR } from '@/lib/og-assets'
import { ogImage } from '@/lib/og-image'

// The site's card; each page's own is /og/<its path>/og.webp
export const Route = createFileRoute('/og.webp')({
  server: {
    handlers: {
      GET: async () => ogImage(
        <DojoOg
          title="Free courses with agentic tutors"
          description="Take any course, rehearse for your next interview, or build a dojo of your own."
          logo={await getLogoWordmarkDataUrl()}
          ground={await getOgGroundDataUrl()}
          groundColor={OG_GROUND_COLOR}
        />,
      ),
    },
  },
})
