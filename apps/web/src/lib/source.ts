import { type InferPageType, loader, type LoaderPlugin } from 'fumadocs-core/source';
import { docs } from 'collections/server';
import { createElement, Fragment } from 'react';

// Fumadocs' method colors (its MethodLabel, on the API page)
const methodColors: Record<string, string> = {
  GET: 'text-green-600 dark:text-green-400',
  POST: 'text-blue-600 dark:text-blue-400',
  PUT: 'text-yellow-600 dark:text-yellow-400',
  PATCH: 'text-orange-600 dark:text-orange-400',
  DELETE: 'text-red-600 dark:text-red-400',
};

// An API page in the sidebar as its method and path, "GET /health" (the route scripts/generate-api-docs.ts records)
const apiRoutes: LoaderPlugin = {
  name: 'dojo:api-routes',
  transformPageTree: {
    file(node, filePath) {
      const file = filePath ? this.storage.read(filePath) : undefined;
      const api = file?.format === 'page' ? (file.data as { _openapi?: { method?: string; route?: string } })._openapi : undefined;
      if (!api?.method || !api.route) return node;
      return {
        ...node,
        name: createElement(Fragment, null,
          createElement('span', { className: `w-9 shrink-0 font-mono text-[0.6875rem] font-semibold ${methodColors[api.method] ?? ''}` }, api.method),
          // A long path wraps at its slashes
          createElement('code', { className: 'min-w-0 font-mono text-[0.8125rem]' }, ...api.route.split(/(?=\/)/).flatMap((part, index) => index > 0 ? [createElement('wbr', { key: `w${index}` }), part] : [part]))),
      };
    },
  },
};

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: '/',
  plugins: [apiRoutes],
});

export async function getLLMText(page: InferPageType<typeof source>) {
  const processed = await page.data.getText('processed');

  return `# ${page.data.title}

${processed}`;
}

// Canonical site URL for absolute meta tags. Override with SITE_URL env var
// for non-Vercel hosts; otherwise fall back to the production hostname.
export const SITE_URL =
  process.env.SITE_URL?.replace(/\/$/, '') ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
    : 'https://dojo.foo');
