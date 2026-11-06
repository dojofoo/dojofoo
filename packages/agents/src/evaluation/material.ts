import { lstat, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, posix } from "node:path";
import { parse } from "yaml";
import { chapterCurriculum } from "@dojofoo/config";

// Inspect authored evidence, not claims in the final response. Never follow links.
export async function readMaterial(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const name of ["dojo.yaml", "dojo.json", "README.md", "DOJO.md", "mise.toml", "package.json", "pnpm-lock.yaml", "tsconfig.json", "vitest.config.ts"]) {
    try {
      if ((await lstat(join(root, name))).isFile()) files[name] = await readFile(join(root, name), "utf8");
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  }
  async function visit(folder: string): Promise<void> {
    for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const path = `${folder}/${entry.name}`;
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && /\.(?:mdx?|[cm]?[jt]sx?|ya?ml|json)$/u.test(entry.name)) {
        files[path] = await readFile(join(root, path), "utf8");
      }
    }
  }
  if ((await lstat(join(root, "src"))).isDirectory()) await visit("src");
  return files;
}

/** Course-wide files plus only the requested lessons' folders, so an unfinished
 * neighbouring lesson cannot block (or invalidate) a lesson-scoped evaluation. */
export async function readLessonMaterial(root: string, lessonIds: string[]): Promise<Record<string, string>> {
  const files = await readMaterial(root);
  const manifest = parse(files["dojo.yaml"] ?? "") as Record<string, unknown> | null;
  const lessons = manifest?.chapters ? chapterCurriculum(manifest).katas : Array.isArray(manifest?.katas) ? manifest.katas as Array<{ name?: string; template?: string }> : [];
  const chapterIntroPaths = new Set(lessons.filter(entry => lessonIds.includes(String(entry.name))).flatMap(entry => {
    const chapter = "chapter" in entry ? entry.chapter as { path: string } : undefined;
    return chapter ? [`${chapter.path}/INTRO.md`, `${chapter.path}/INTRO.mdx`] : ["src/INTRO.md", "src/INTRO.mdx"];
  }));
  const folders = lessonIds.map(id => {
    const template = lessons.find(entry => entry?.name === id)?.template;
    if (!template) throw new Error(`Evaluation lesson is not in this course: ${id}`);
    return `${posix.dirname(String(template))}/`;
  });
  return Object.fromEntries(Object.entries(files).filter(([path]) => !path.startsWith("src/") || chapterIntroPaths.has(path) || folders.some(folder => path.startsWith(folder))));
}

export function materialHash(files: Record<string, string>): string {
  return createHash("sha256").update(JSON.stringify(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
}
