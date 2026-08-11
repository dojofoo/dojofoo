import { defineConfig } from "@playwright/test";

const webPort = process.env.DOJO_WEB_TEST_PORT ?? "4310";
const apiPort = process.env.DOJO_API_TEST_PORT ?? "4311";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["line"]],
  webServer: [
    {
      command: `PORT=${apiPort} bun test/server.ts`,
      cwd: "../api",
      url: `http://127.0.0.1:${apiPort}/health`,
      reuseExistingServer: false,
    },
    {
      command: `DOJO_API_ORIGIN=http://127.0.0.1:${apiPort} pnpm exec vite dev --host 127.0.0.1 --port ${webPort}`,
      url: `http://127.0.0.1:${webPort}`,
      reuseExistingServer: false,
    },
  ],
});
