import react from '@vitejs/plugin-react';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import mdx from 'fumadocs-mdx/vite';
import { nitro } from 'nitro/vite';

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 3000,
    host: process.env.HOST || 'localhost',
    allowedHosts: ['dojofoo.td', 'host.docker.internal', 'localhost', '127.0.0.1'],
    proxy: {
      '/api/v1': process.env.DOJO_API_ORIGIN ?? 'http://127.0.0.1:4311',
    },
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    mdx(await import('./source.config.js')),
    tailwindcss(),
    tanstackStart(),
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
      minify: true,
      routeRules: {
        '/assets/**': {
          headers: { 'cache-control': 'public, max-age=31536000, immutable' },
        },
      },
    }),
  ],
});
