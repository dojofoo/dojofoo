import { createRequire, isBuiltin } from "node:module";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const installation = createRequire(import.meta.url);

export function managedModuleCache(path: string): string | undefined {
  if (managedAgentRoot(path)) {
    return join(process.env.DOJOFOO_HOME || join(homedir(), ".dojo"), "cache", "authored-modules");
  }
}

/** Experimental project convention; ordinary Eve projects remain unchanged. */
export function managedAgentRoot(path: string): string | undefined {
  let directory = resolve(path);
  for (;;) {
    const parent = dirname(directory);
    if (basename(parent) === ".dojo" && ["kyoshi", "sensei"].includes(basename(directory))) {
      return directory;
    }
    if (parent === directory) return;
    directory = parent;
  }
}

/** Resolve shipped packages from the installation, never the course's deps. */
export function managedAgentImport(source: string, importer?: string, managedPackage = false) {
  if (!importer || importer.startsWith("\0") || (!managedPackage && !managedAgentRoot(importer))) return;
  if (source.startsWith(".") || source.startsWith("#") || isAbsolute(source)
    || /^(?:node|file|data):/u.test(source) || isBuiltin(source)) return;
  const specifier = source === "eve" || source.startsWith("eve/")
    ? `@dojofoo/agent${source.slice(3)}` : source;
  return { external: true, id: pathToFileURL(installation.resolve(specifier)).href };
}
