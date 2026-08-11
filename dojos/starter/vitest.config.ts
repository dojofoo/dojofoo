import { existsSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

const installedKatas = fileURLToPath(new URL("../../katas", import.meta.url));
const bundledKatas = fileURLToPath(new URL("./katas", import.meta.url));
const katas = existsSync(installedKatas) ? installedKatas : bundledKatas;

export default defineConfig({
  resolve: {
    alias: {
      "@/katas": katas,
    },
  },
  test: {
    coverage: {
      provider: "v8",
    },
  },
});
