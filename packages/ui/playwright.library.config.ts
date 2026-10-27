import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "local-library.spec.ts",
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { headless: true, viewport: { width: 1440, height: 900 }, trace: "retain-on-failure", screenshot: "only-on-failure" },
});
