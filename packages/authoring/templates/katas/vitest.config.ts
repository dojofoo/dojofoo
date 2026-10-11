import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@/katas": process.env.DOJO_PROJECT_ROOT
        ? resolve(process.env.DOJO_PROJECT_ROOT, "katas")
        : fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
