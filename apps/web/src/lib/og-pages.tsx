import { DojoOg, OgCourseCard } from '@/components/og/dojo-og'
import { teachingModes } from '@dojofoo/uix/web/catalog'
import { toUIXCourse } from '@/lib/uix-course'
import { cardLines, getLogoWordmarkDataUrl, OG_GROUND_COLOR } from './og-assets'
import { ogGround, type OgMap } from './og-ground'
import { ogImage } from './og-image'

/*
 * Each page's social card, at its own address + /og.webp (social-metadata pageImage): the site's, the dojos', a docs
 * page's and a course's. Server only: the route handlers import this lazily, so the image natives and `lib/source` stay
 * out of every other route.
 */

/** A plain 404 (a thrown notFound() leaves a server handler as a 500) */
export const missing = () => new Response('Not found', { status: 404 })

// The page's ground, seeded by its path: the contour map, or the docs' waves; under a course's card, its shadow
const frame = async (path: string, map: OgMap = 'topography', withShadow = false) => ({
  logo: await getLogoWordmarkDataUrl(),
  ground: ogGround(map, path, withShadow),
  groundColor: OG_GROUND_COLOR,
})

export const siteCard = async () => ogImage(
  <DojoOg {...await frame('/')} title="Free courses with agentic tutors"
    description="Take any course, rehearse for your next interview, or build a dojo of your own." />,
)

export const dojosCard = async () => ogImage(
  <DojoOg {...await frame('/dojos')} title="Find your dojo"
    description="Free coding courses, each with its own sensei: katas, interactive lessons, projects and interviews." />,
)

/** A docs page by its path, e.g. "/docs/quickstart": on the waves, naming where it belongs at the foot as the footer does */
export async function docsCard(path: string) {
  const { source } = await import('@/lib/source')
  const page = source.getPages().find((item) => item.url === path)
  if (!page) return missing()
  return ogImage(<DojoOg {...await frame(path, 'waves')} title={page.data.title} description={page.data.description} foot="Help & Support" />)
}

/** A course's, with its card beside the words, the card's shadow under it */
export async function courseCard(source: string, slug: string) {
  const { getMarketplaceCourses } = await import('@/lib/courses')
  const origin = process.env.DOJO_API_ORIGIN ?? (process.env.NODE_ENV !== 'production' ? 'https://dojo.foo' : null)
  const listed = origin ? (await getMarketplaceCourses(origin)).find((item) => item.source === source && item.slug === slug) : undefined
  if (!listed) return missing()
  const course = toUIXCourse(listed)
  const lines = cardLines[course.shader]
  return ogImage(
    <DojoOg {...await frame(`/courses/${source}/${slug}`, 'topography', true)} title={course.name} description={course.description} author={course.author}
      card={<OgCourseCard hue={course.art.hue} lines={lines.src} linesOpacity={lines.opacity}
        // Its version at the top, beside it its rating once someone has rated it (its language till then); its last
        // update at the foot
        mark={course.version.startsWith('v') ? course.version : `v${course.version}`} figure={course.rating === undefined ? course.language : `★ ${course.rating.toFixed(1)}`}
        kicker={course.repository} title={course.name}
        label={course.publishedAt ? 'Updated' : undefined} value={course.publishedAt ? new Date(course.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : undefined}
        tag={teachingModes.find((mode) => mode.value === course.mode)?.label} />} />,
  )
}
