import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e", testMatch: ["chat-activity.spec.ts", "monaco-editor.spec.ts", "teaching-content.spec.ts", "workspace-tabs.spec.ts", "tree-view.spec.ts"], timeout: 30_000,
  use: { baseURL: "http://localhost:6017", headless: true, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "pnpm exec storybook dev -p 6017 --ci", url: "http://localhost:6017", reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
