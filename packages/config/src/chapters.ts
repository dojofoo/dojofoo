export interface ChapterReference { id: string; title: string; path: string }

/** The same chapter identities in authoring, the CLI and learner navigation. */
export function courseChapters(manifest: { chapters?: unknown }): ChapterReference[] {
  if (Array.isArray(manifest.chapters) && manifest.chapters.length) return manifest.chapters.filter((chapter): chapter is ChapterReference => chapter !== null && typeof chapter === "object").map(chapter => ({ id: String(chapter.id), title: String(chapter.title), path: String(chapter.path) }));
  return [{ id: "default", title: "Default", path: "src" }];
}
