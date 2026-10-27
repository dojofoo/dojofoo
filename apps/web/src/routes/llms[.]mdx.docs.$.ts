import { createFileRoute } from '@tanstack/react-router';
import { getLLMText, source } from '@/lib/source';

export const Route = createFileRoute('/llms.mdx/docs/$')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const slugs = (params._splat ?? '').split('/');
        // remove the appended "index.mdx" to avoid build issues
        slugs.pop();
        const page = source.getPage(slugs);
        if (!page) return new Response("Page not found", { status: 404 });

        return new Response(await getLLMText(page), {
          headers: {
            'Content-Type': 'text/markdown',
          },
        });
      },
    },
  },
});
