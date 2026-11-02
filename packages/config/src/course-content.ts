import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, relative, resolve } from "node:path";
import { chapterCurriculum, courseRelativePath } from "./curriculum";
import { courseChapters } from "./chapters";

export type CourseIntroduction = { path: string; content: string; format: "markdown" | "mdx" };

/** Course prose is README.md; chapter/lesson prose is INTRO.md or INTRO.mdx. */
export function readIntroduction(root: string, directory = root, scope: "course" | "content" = resolve(directory) === resolve(root) ? "course" : "content"): CourseIntroduction | null {
  const folder = relative(resolve(root), resolve(directory));
  if (folder && !courseRelativePath(folder)) throw new Error("Introduction must stay inside the course");
  const names = scope === "course" ? ["README.md"] : ["INTRO.mdx", "INTRO.md"];
  const name = names.find(name => existsSync(resolve(directory, name)));
  if (!name) return null;
  return { path: relative(root, resolve(directory, name)).replaceAll("\\", "/"), content: readFileSync(resolve(directory, name), "utf8"), format: name.endsWith(".mdx") ? "mdx" : "markdown" };
}

export function ensureIntroduction(root: string, directory: string, title: string, scope: "course" | "content" = resolve(directory) === resolve(root) ? "course" : "content", description = "", kind: "course" | "chapter" | "lesson" = scope === "course" ? "course" : "chapter"): void {
  if (readIntroduction(root, directory, scope)) return;
  mkdirSync(directory, { recursive: true });
  const name = scope === "course" ? "README.md" : "INTRO.md";
  const template = readFileSync(createRequire(import.meta.url).resolve(`@dojofoo/config/templates/${kind}/${name}`), "utf8");
  const values: Record<string, string> = { title, description: description.trim() };
  writeFileSync(resolve(directory, name), template.replace(/\{\{(title|description)\}\}/g, (_, key: string) => values[key]!), { flag: "wx" });
}

export function courseContent(root: string, manifest: Record<string, unknown>) {
  const entries = Array.isArray(manifest.chapters) && manifest.chapters.length ? chapterCurriculum(manifest).katas
    : Array.isArray(manifest.katas) ? manifest.katas as Record<string, unknown>[] : [];
  const chapters = courseChapters(manifest).map(chapter => {
    if (!courseRelativePath(chapter.path)) throw new Error(`Chapter path must stay inside the course: ${chapter.id}`);
    return { ...chapter, intro: readIntroduction(root, resolve(root, chapter.path)) };
  });
  const lessons = entries.map(entry => {
    if (!courseRelativePath(entry.template)) throw new Error(`Lesson path must stay inside the course: ${String(entry.name ?? entry.id)}`);
    return { id: String(entry.name ?? entry.id), title: String(entry.title ?? entry.name ?? entry.id), directory: dirname(entry.template),
      intro: readIntroduction(root, resolve(root, dirname(entry.template))) };
  });
  const intro = readIntroduction(root, root, "course");
  const issues = [
    ...(!intro?.content.trim() ? ["Add learner-facing course content in README.md."] : []),
    ...chapters.filter(chapter => !chapter.intro?.content.trim()).map(chapter => `Add the ${chapter.title} chapter introduction in ${chapter.path}/INTRO.md or INTRO.mdx.`),
    ...lessons.filter(lesson => !lesson.intro?.content.trim()).map(lesson => `Add the ${lesson.title} lesson introduction in ${lesson.directory}/INTRO.md or INTRO.mdx.`),
  ];
  return { intro, chapters, lessons, issues };
}

/** Called by creation paths, never by a read; existing prose and MDX are preserved. */
export function ensureCourseContent(root: string, manifest: Record<string, unknown>): void {
  const content = courseContent(root, manifest);
  ensureIntroduction(root, root, String(manifest.title ?? manifest.name ?? "Course"), "course", typeof manifest.description === "string" ? manifest.description : "");
  for (const chapter of content.chapters) ensureIntroduction(root, resolve(root, chapter.path), chapter.title);
  for (const lesson of content.lessons) ensureIntroduction(root, resolve(root, lesson.directory), lesson.title, "content", "", "lesson");
}
