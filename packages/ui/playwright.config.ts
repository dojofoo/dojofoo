import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["monaco-editor.spec.ts", "teaching-content.spec.ts", "workspace-tabs.spec.ts"],
  timeout: 300_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: process.env.DOJO_UI_BASE_URL ?? "https://dojo.td",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["line"]],
});
