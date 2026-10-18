import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    runtime: "src/runtime.ts",
    vitest: "src/vitest.ts",
    "local-state": "src/local-state.ts",
    "project-preparation": "src/project-preparation.ts",
  },
  format: ["esm"],
  target: "node20",
  removeNodeProtocol: false,
  clean: true,
  dts: true,
  external: ["vitest", "vitest/config", "jiti", "node:sqlite"],
});
