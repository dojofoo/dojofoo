import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const sourceFile = ".dojo-source.json";
const githubRepository = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export interface InstalledSource {
  version: 1;
  type: "github" | "npm" | "url" | "local";
  locator: string;
  integrity?: string;
}

export function parseGithubSource(source: string): { repository: string } | null {
  if (source.startsWith("@") || !githubRepository.test(source)) return null;
  return { repository: source };
}

export function githubArchiveUrl(repository: string) {
  if (!githubRepository.test(repository)) {
    throw new Error(`Invalid GitHub repository: ${repository}`);
  }
  return `https://codeload.github.com/${repository}/tar.gz/HEAD`;
}

export function writeInstalledSource(dojoPath: string, source: InstalledSource) {
  writeFileSync(resolve(dojoPath, sourceFile), `${JSON.stringify(source, null, 2)}\n`);
}

export function readInstalledSource(dojoPath: string): InstalledSource | null {
  const path = resolve(dojoPath, sourceFile);
  if (!existsSync(path)) return null;
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<InstalledSource>;
    if (
      value.version !== 1
      || !["github", "npm", "url", "local"].includes(value.type ?? "")
      || typeof value.locator !== "string"
      || value.locator.length === 0
      || (value.integrity !== undefined && typeof value.integrity !== "string")
    ) return null;
    return value as InstalledSource;
  } catch {
    return null;
  }
}
