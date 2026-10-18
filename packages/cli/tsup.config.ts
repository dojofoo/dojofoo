import { defineConfig } from "tsup";
import { readFile } from "node:fs/promises";

export default defineConfig({
  entry: ["src/index.ts", "src/lesson-mcp.ts", "src/teaching-eval.ts"],
  format: ["esm"],
  target: "node24",
  removeNodeProtocol: false,
  external: ["node:sqlite", "yaml"],
  noExternal: ["@dojofoo/authoring/service", /^@dojofoo\/authoring\/evaluation\//],
  clean: true,
  esbuildPlugins: [{
    name: "teaching-instructions",
    setup(build) {
      build.onLoad({ filter: /\.md$/ }, async ({ path, suffix }) => suffix === "?raw" ? ({
        contents: await readFile(path, "utf8"), loader: "text",
      }) : undefined);
    },
  }],
  banner: {
    // Official harness adapters include CommonJS dependencies (e.g. ws).
    // Their Node built-in requires must also work in the ESM worker bundle.
    js: '#!/usr/bin/env node\nimport { createRequire as __createNodeRequire } from "node:module";\nconst require = __createNodeRequire(import.meta.url);',
  },
});
