import { readFileSync } from "node:fs";
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
});
