import { createFileRoute } from '@tanstack/react-router';
import { source, getLLMText } from '@/lib/source';
import { DEFAULT_SOCIAL_DESCRIPTION } from '@/lib/social-metadata';

export const Route = createFileRoute('/llms-full.txt')({
  server: {
    handlers: {
      GET: async () => {
        const scan = source.getPages().map(getLLMText);
        const scanned = await Promise.all(scan);
        // Headed like llms.txt: the site's name and summary, then every page
        return new Response(`# Dojo.foo docs\n\n> ${DEFAULT_SOCIAL_DESCRIPTION}\n\n${scanned.join('\n\n')}`, {
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      },
    },
  },
});
