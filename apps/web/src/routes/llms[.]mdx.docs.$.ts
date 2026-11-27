import { createFileRoute } from '@tanstack/react-router';
import { source } from '@/lib/source';

// The page's Markdown moved to its address + .md ({$}[.]md.ts); links to the former address still land there
export const Route = createFileRoute('/llms.mdx/docs/$')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const slugs = (params._splat ?? '').split('/');
        // remove the appended "index.mdx"
        slugs.pop();
        const page = source.getPage(slugs);
        if (!page) return new Response("Page not found", { status: 404 });
        return Response.redirect(new URL(`${page.url}.md`, request.url), 301);
      },
    },
  },
});
