import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: {
    command: 'pnpm vite dev --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/docs',
    reuseExistingServer: false,
  },
})
