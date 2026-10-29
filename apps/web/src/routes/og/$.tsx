import { createFileRoute } from '@tanstack/react-router'
import { DojoOg, OgCourseCard } from '@/components/og/dojo-og'
import { teachingModes } from '@dojofoo/uix/web/catalog'
import { toUIXCourse } from '@/lib/uix-course'
import { SITE_NAME } from '@/lib/social-metadata'

// A page's own social card, at /og/<its path>/og.webp: a docs page's title and description, the dojos', or a course's
// with its card beside them

// A plain 404 (a thrown notFound() leaves a server handler as a 500)
const missing = () => new Response('Not found', { status: 404 })
export const Route = createFileRoute('/og/$')({
  server: {
    handlers: {
      GET: async ({ params }: { params: { _splat?: string } }) => {
        const parts = params._splat?.split('/').filter(Boolean) ?? []
        if (parts.pop() !== 'og.webp') return missing()
        const path = `/${parts.join('/')}`

        // Lazy imports keep `lib/source` (its fumadocs-mdx runtime uses node:path) and the image natives out of every
        // other route
        const [{ getLogoWordmarkDataUrl, getOgGroundDataUrl, OG_GROUND_COLOR, cardLines }, { ogImage }] = await Promise.all([
          import('@/lib/og-assets'),
          import('@/lib/og-image'),
        ])
        const frame = { logo: await getLogoWordmarkDataUrl(), ground: await getOgGroundDataUrl(), groundColor: OG_GROUND_COLOR }

        if (path === '/dojos') {
          return ogImage(<DojoOg {...frame} title="Find your dojo" description="Free coding courses, each with its own sensei: katas, interactive lessons, projects and interviews." />)
        }

        if (parts[0] === 'courses' && parts.length === 3) {
          const { getMarketplaceCourses } = await import('@/lib/courses')
          const origin = process.env.DOJO_API_ORIGIN ?? (process.env.NODE_ENV !== 'production' ? 'https://dojo.foo' : null)
          const listed = origin ? (await getMarketplaceCourses(origin)).find((item) => item.source === parts[1] && item.slug === parts[2]) : undefined
          if (!listed) return missing()
          const course = toUIXCourse(listed)
          const lines = cardLines[course.shader]
          return ogImage(
            <DojoOg {...frame} title={course.name} description={course.description}
              card={<OgCourseCard hue={course.art.hue} lines={lines.src} linesOpacity={lines.opacity}
                mark={course.author === SITE_NAME ? <img alt="" src={frame.logo} height={26} width={92} style={{ objectFit: 'contain', objectPosition: 'left' }} /> : course.author}
                figure={course.version.startsWith('v') ? course.version : `v${course.version}`} kicker={course.repository} title={course.name}
                // As the course page's card: when it was last published, and how it teaches
                label={course.publishedAt ? 'Updated' : undefined} value={course.publishedAt ? new Date(course.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : undefined}
                tag={teachingModes.find((mode) => mode.value === course.mode)?.label} />} />,
          )
        }

        const { source } = await import('@/lib/source')
        const page = source.getPages().find((item) => item.url === path)
        if (!page) return missing()
        return ogImage(<DojoOg {...frame} title={page.data.title} description={page.data.description} />)
      },
    },
  },
})
