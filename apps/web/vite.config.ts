import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { globSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import { nitro } from 'nitro/vite';
import { wgslVitePlugin } from 'vgpu/client';
import { monacoAssets } from '../../packages/ui/monaco-assets';

const appRoot = dirname(fileURLToPath(import.meta.url));
const docsRoot = resolve(appRoot, 'content/docs');
const docsPaths = globSync('**/*.mdx', { cwd: docsRoot }).map((file) => {
  const slug = relative(docsRoot, resolve(docsRoot, file))
    .replace(/(?:^|\/)index\.mdx$/, '')
    .replace(/\.mdx$/, '');
  return `/docs${slug ? `/${slug}` : ''}`;
});

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || 'localhost',
    allowedHosts: ['dojofoo.td', 'host.docker.internal', 'localhost', '127.0.0.1'],
    proxy: {
      '/api/v1': process.env.DOJO_API_ORIGIN ?? 'https://dojo.foo',
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    monacoAssets(),
    wgslVitePlugin(),
    mdx(await import('./source.config.js')),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
        failOnError: true,
      },
      pages: docsPaths.map((path) => ({ path })),
    }),
    react(),
    nitro({
      preset: 'vercel',
      vercel: {
        functions: {
          runtime: 'nodejs22.x',
          architecture: 'arm64',
          supportsResponseStreaming: true,
        },
      },
      compressPublicAssets: {
        brotli: true,
        gzip: true,
      },
      traceDeps: ['react'],
      minify: true,
      routeRules: {
        '/assets/**': {
          headers: { 'cache-control': 'public, max-age=31536000, immutable' },
        },
      },
    }),
  ],
});
