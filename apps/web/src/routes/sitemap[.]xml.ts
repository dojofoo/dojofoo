import { source } from '@/lib/source';
import { getMarketplaceCourses } from '@/lib/courses';
import { SITE_URL } from '@/lib/site';
import { createFileRoute } from '@tanstack/react-router';

// The pages to index: the landing, the dojos and each one's page, and the docs
async function coursePaths() {
  // Where loadMarketplaceCourses finds the courses
  const origin = process.env.DOJO_API_ORIGIN ?? (process.env.NODE_ENV !== 'production' ? 'https://dojo.foo' : null);
  if (!origin) return [];
  // The API down: the sitemap still lists the rest
  try {
    return (await getMarketplaceCourses(origin)).map((course) => `/courses/${course.source}/${course.slug}`);
  } catch {
    return [];
  }
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      async GET() {
        const paths = ['/', '/dojos', ...(await coursePaths()), ...source.getPages().map((page) => page.url)];
        const urls = paths.map((path) => `  <url><loc>${escape(SITE_URL + path)}</loc></url>`).join('\n');
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
          headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600' },
        });
      },
    },
  },
});
