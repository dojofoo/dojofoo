import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: process.env.STORYBOOK_URL ?? "https://ui.dojofoo.td",
    ignoreHTTPSErrors: true,
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
  },
});
