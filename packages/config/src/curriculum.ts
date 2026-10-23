import { isAbsolute } from "node:path";

export interface ChapterReference {
  id: string;
  title: string;
  path: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const STABLE_ID = /^[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/u;

function stableId(value: unknown): value is string {
  return typeof value === "string" && STABLE_ID.test(value);
}

export function courseRelativePath(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !isAbsolute(value)
    && !value.includes("\\") && !value.includes("\0")
    && !value.split("/").some(part => !part || part === "." || part === "..");
}

/** One derived curriculum for CLI, authoring and learning; never persisted twice. */
export function chapterCurriculum(manifest: Record<string, unknown>) {
  const errors: string[] = [];
  const katas: Record<string, unknown>[] = [];
  const chapterIds = new Set<string>();
  const lessonIds = new Set<string>();
  if (!Array.isArray(manifest.chapters)) return { katas, errors: ["chapters must be an array"] };
  if ("katas" in manifest) errors.push("Use chapters or katas, not both");
  for (const chapter of manifest.chapters) {
    if (!record(chapter) || !stableId(chapter.id)
      || typeof chapter.title !== "string" || !chapter.title.trim()
      || !courseRelativePath(chapter.path) || !Array.isArray(chapter.lessons)) {
      errors.push("Each chapter needs an id, title, course-relative path and lessons array");
      continue;
    }
    if (chapterIds.has(chapter.id)) errors.push(`Duplicate chapter ID: ${chapter.id}`);
    chapterIds.add(chapter.id);
    const reference: ChapterReference = { id: chapter.id, title: chapter.title, path: chapter.path };
    for (const lesson of chapter.lessons) {
      if (!record(lesson) || !stableId(lesson.id)
        || !courseRelativePath(lesson.template)) {
        errors.push(`Chapter ${chapter.id}: each lesson needs an id and course-relative template`);
        continue;
      }
      if (!lesson.template.startsWith(`${chapter.path}/`)) {
        errors.push(`Lesson ${lesson.id}: template must be inside chapter ${chapter.id}`);
        continue;
      }
      if (lessonIds.has(lesson.id)) errors.push(`Duplicate lesson ID: ${lesson.id}`);
      lessonIds.add(lesson.id);
      katas.push({ ...lesson, name: lesson.id, chapter: reference });
    }
  }
  return { katas, errors };
}
