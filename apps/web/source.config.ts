import { defineCollections, defineConfig, defineDocs, frontmatterSchema } from 'fumadocs-mdx/config';
import { z } from 'zod';
import { editorSchemes } from '@dojofoo/uix/lib/code-editor-theme';

export const docs = defineDocs({
  dir: 'content',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
});

// Dojo.foo next to another way to learn, one page each at /vs/<file name> (routes/vs.$rival.tsx): its title and
// description are the page's headline and lead, its website and sources what the page's aside says of the other
export const comparisons = defineCollections({
  type: 'doc',
  dir: 'comparisons',
  schema: frontmatterSchema.extend({
    description: z.string(),
    name: z.string(),
    website: z.url(),
    sources: z.array(z.object({ label: z.string(), url: z.url() })),
  }),
});

// The docs' code in the editor's own colors – its default scheme (Vercel), dark and light with the page – and the
// languages the docs and lessons show loaded up front; any other fence still loads its grammar when it's met. The page
// shows it in the editor's window (components/mdx), recolored there to the reader's own scheme
const [scheme] = editorSchemes;

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      themes: { light: scheme.light!.theme, dark: scheme.theme },
      // Its language on the code (language-*), for the window's tab and the editor's own highlighting
      addLanguageClass: true,
      langs: ['shellscript', 'yaml', 'json', 'toml', 'markdown', 'mdx', 'typescript', 'tsx', 'javascript', 'jsx', 'python'],
    },
  },
});
