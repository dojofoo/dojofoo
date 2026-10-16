import { isDeepStrictEqual } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { parse } from "yaml";

/** Restore captured course files into a caller-owned temporary directory. */
export async function restoreMaterial(root: string, files: Record<string, string>) {
  const base = resolve(root);
  const entries = Object.entries(files).map(([path, content]) => {
    const target = resolve(base, path);
    if (!target.startsWith(`${base}${sep}`)) throw new Error(`Snapshot path escapes the replay: ${path}`);
    return { target, content };
  });
  for (const { target, content } of entries) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

/** Compare lesson-scoped snapshots. Adding curriculum entries does not change
 * an accepted lesson; changing its entry or any shared guidance/setup does. */
export function preservesAcceptedMaterial(previous: Record<string, string>, current: Record<string, string>, lessonIds: string[]): boolean {
  function normalize(files: Record<string, string>) {
    const result: Record<string, unknown> = { ...files };
    for (const path of ["dojo.yaml", "dojo.json"]) {
      if (!(path in files)) continue;
      const manifest = parse(files[path]!);
      if (!manifest || !Array.isArray(manifest.katas)) throw new Error("Accepted material needs a kata manifest");
      result[path] = { ...manifest, katas: manifest.katas.filter((entry: { name?: string }) => lessonIds.includes(entry.name ?? "")) };
    }
    return result;
  }
  return isDeepStrictEqual(normalize(previous), normalize(current));
}
