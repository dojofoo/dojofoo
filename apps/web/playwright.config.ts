import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:4310",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["line"]],
  webServer: [
    {
      command: "PORT=4311 bun src/index.ts",
      cwd: "../api",
      url: "http://127.0.0.1:4311/health",
      reuseExistingServer: false,
    },
    {
      command: "DOJO_API_ORIGIN=http://127.0.0.1:4311 pnpm exec vite dev --host 127.0.0.1 --port 4310",
      url: "http://127.0.0.1:4310",
      reuseExistingServer: false,
    },
  ],
});
