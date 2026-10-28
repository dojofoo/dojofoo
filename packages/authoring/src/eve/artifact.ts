import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { globby } from "globby";

const require = createRequire(import.meta.url);
export const authoringPackageRoot = dirname(require.resolve("@dojofoo/authoring/package.json"));

export const courseAgentOutput = (sourceRoot: string, hash: string) => join(dirname(sourceRoot), "kyoshi-builds", hash);

/** Hash definitions and their installed implementation, never private runtime bindings. */
export async function agentSourceHash(agentRoot: string): Promise<string> {
  const hash = createHash("sha256");
  const { name, version } = JSON.parse(await readFile(require.resolve("@dojofoo/agent/package.json"), "utf8"));
  hash.update(JSON.stringify({ name, version }));
  hash.update(await readFile(join(authoringPackageRoot, "scripts/build-agent.mjs")));
  for (const directory of [agentRoot, join(authoringPackageRoot, "dist")]) {
    const files = await globby("**/*", {
      cwd: directory, dot: true, onlyFiles: true, followSymbolicLinks: false,
      ignore: ["**/.eve/**", "**/.output/**", "**/node_modules/**", "**/.git/**", "**/runtime.json", "prepared/**"],
    });
    for (const file of files.sort()) {
      const content = await readFile(join(directory, file));
      hash.update(JSON.stringify([file, content.length]));
      hash.update(content);
    }
  }
  return hash.digest("hex");
}
