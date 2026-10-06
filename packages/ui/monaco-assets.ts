import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { grammars } from "tm-grammars";

/** Ship modern-monaco's relative worker imports intact, without a runtime CDN. */
export function monacoAssets(): Plugin {
  const directory = dirname(fileURLToPath(import.meta.resolve("modern-monaco/editor-core")));
  const files = ["editor-core.mjs", "editor-worker-main.mjs", "editor-worker.mjs"];
  const version = JSON.parse(readFileSync(join(directory, "../package.json"), "utf8")).version;
  const prefix = `assets/monaco-${version}/`;
  const grammarDirectory = dirname(fileURLToPath(import.meta.resolve("tm-grammars")));
  const grammarVersion = JSON.parse(readFileSync(join(grammarDirectory, "package.json"), "utf8")).version;
  const assets = new Map(files.map((name) => [prefix + name, join(directory, name)]));
  const includeGrammar = (name: string) => {
    const path = `tm-grammars@${grammarVersion}/grammars/${name}.json`;
    if (assets.has(path)) return;
    assets.set(path, join(grammarDirectory, "grammars", name + ".json"));
    for (const embedded of grammars.find((grammar) => grammar.name === name)?.embedded ?? []) includeGrammar(embedded);
  };
  for (const name of ["typescript", "javascript", "json", "markdown", "python", "yaml"]) includeGrammar(name);
  let base = "/";
  return {
    name: "dojo-monaco-assets",
    configResolved(config) { base = config.base; },
    resolveId(id) { if (id === "virtual:dojo-monaco-url") return "\0dojo-monaco-url"; },
    load(id) {
      if (id === "\0dojo-monaco-url") return `export default ${JSON.stringify(`${base}${prefix}editor-core.mjs`)};`;
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = request.url?.split("?")[0] ?? "";
        const file = assets.get(pathname.startsWith(base) ? pathname.slice(base.length) : pathname.slice(1));
        if (!file) return next();
        response.setHeader("Content-Type", file.endsWith(".json") ? "application/json" : "text/javascript");
        response.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [fileName, source] of assets) this.emitFile({ type: "asset", fileName, source: readFileSync(source) });
    },
  };
}
