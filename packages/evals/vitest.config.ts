import { defineConfig } from "vitest/config";

export default defineConfig({
  // Authored course fixtures contain intentionally failing learner exercises.
  // Their checks run in isolated teaching trials, not the evaluator unit suite.
  test: { include: ["src/**/*.test.ts"] },
});
