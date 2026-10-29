import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { editorSchemes } from '@dojofoo/uix/lib/code-editor-theme';

export const docs = defineDocs({
  dir: 'content',
  docs: {
    postprocess: {
      includeProcessedMarkdown: true,
    },
  },
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
