import { createFileRoute } from '@tanstack/react-router';
import { docsLlms } from '@/lib/source';

// A docs page's Markdown at its address + .md (llmstxt.org), as Fumadocs serves it; it names the llms.txt that covers it
export const Route = createFileRoute('/{$}.md')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const response = await docsLlms.serve(new URL(request.url).pathname);
        if (!response) return new Response('Page not found', { status: 404 });
        response.headers.set('link', '</llms.txt>; rel="describedby"');
        return response;
      },
    },
  },
});
