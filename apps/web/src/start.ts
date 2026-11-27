import { redirect } from '@tanstack/react-router';
import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start';
import { isMarkdownPreferred } from 'fumadocs-core/negotiation';

// Start's own default, which a start instance replaces: server functions only answer this site
const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' });

// An agent that asks for Markdown (Accept: text/markdown) gets a docs page's .md, as in Fumadocs' TanStack Start example.
// The prerendered pages bypass the server, so vite.config.ts sends such requests here
const markdownMiddleware = createMiddleware().server(async ({ next, request }) => {
  const url = new URL(request.url);
  // /dojos is the catalog (routes/dojos.tsx), not the docs page of that address
  if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname !== '/dojos' && !/\.(md|txt)$/.test(url.pathname) && isMarkdownPreferred(request)) {
    const { source } = await import('@/lib/source');
    const page = source.getPageByUrl(url.pathname.replace(/(.)\/$/, '$1'));
    if (page) throw redirect({ href: `${page.url}.md`, headers: { Vary: 'Accept' } });
  }
  return next();
});

export const startInstance = createStart(() => ({ requestMiddleware: [csrfMiddleware, markdownMiddleware] }));
