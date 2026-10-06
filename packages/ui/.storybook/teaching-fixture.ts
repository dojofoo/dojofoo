import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { compileTeachingDocument } from "../src/server/teaching-markdown.ts";

/** Compile the story with the production renderer, also for static Storybook. */
export function teachingFixture(): Plugin {
  const id = "virtual:dojo-teaching-fixture";
  const path = fileURLToPath(new URL("../src/components/teaching-markdown.fixture.md", import.meta.url));
  return {
    name: "dojo-teaching-fixture",
    resolveId(source) { if (source === id) return `\0${id}`; },
    async load(source) {
      if (source !== `\0${id}`) return;
      this.addWatchFile(path);
      const blocks = await compileTeachingDocument(await readFile(path, "utf8"));
      const second = await compileTeachingDocument("# Second file\n\nA different lesson.");
      return `export default ${JSON.stringify(blocks)}; export const second = ${JSON.stringify(second)};`;
    },
  };
}
