import { readFileSync } from "node:fs";
import { cp } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { defineConfig } from "tsup";

const manifest = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const sources = Object.values(manifest.exports)
  .flatMap(value => typeof value === "object" && value !== null && "development" in value ? [String(value.development)] : [])
  .filter(source => source.endsWith(".ts"));

export default defineConfig({
  entry: Object.fromEntries(sources.map(source => [source.replace(/^\.\/src\//u, "").replace(/\.ts$/u, ""), source])),
  format: ["esm"],
  target: "node24",
  splitting: true,
  clean: true,
  // Keep the tested OpenCode compatibility fix in published installations too.
  noExternal: ["@ai-sdk/harness-opencode"],
  onSuccess: async () => {
    const adapter = dirname(createRequire(import.meta.url).resolve("@ai-sdk/harness-opencode"));
    await cp(resolve(adapter, "bridge"), resolve("dist/bridge"), { recursive: true });
  },
});
