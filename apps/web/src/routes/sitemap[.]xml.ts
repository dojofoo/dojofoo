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
    return (await getMarketplaceCourses(origin)).map((course) => ({ path: `/courses/${course.source}/${course.slug}`, lastmod: course.publishedAt }));
  } catch {
    return [];
  }
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      async GET() {
        // Most important first (Google ignores order, priority and change frequency – it reads lastmod when it's
        // accurate, so only a course, by its latest version, carries one); each once: the docs have a page at /dojos too
        const pages = [{ path: '/' }, { path: '/dojos' }, ...(await coursePaths()), ...source.getPages().map((page) => ({ path: page.url }))];
        const seen = new Set<string>();
        const urls = pages.filter(({ path }) => !seen.has(path) && seen.add(path)).map(({ path, lastmod }: { path: string; lastmod?: string }) =>
          `  <url><loc>${escape(SITE_URL + path)}</loc>${lastmod ? `<lastmod>${escape(lastmod)}</lastmod>` : ''}</url>`).join('\n');
        return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, {
          headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=0, s-maxage=3600' },
        });
      },
    },
  },
});
