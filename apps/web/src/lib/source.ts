import { type InferPageType, loader } from 'fumadocs-core/source';
import { lucideIconsPlugin } from 'fumadocs-core/source/lucide-icons';
import { docs } from 'collections/server';

export const source = loader({
  source: docs.toFumadocsSource(),
  baseUrl: '/',
  plugins: [lucideIconsPlugin()],
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
