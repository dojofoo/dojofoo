import { parse } from "yaml";
import type { ExploreCourse } from "@dojofoo/uix/containers/course-explore";
import createManifest from "../../../../courses/create-your-own-dojo/dojo.yaml?raw";
import runManifest from "../../../../courses/how-to-run-a-dojo/dojo.yaml?raw";
import createCurriculum from "../../../../courses/create-your-own-dojo/lessons/intro.json";
import runCurriculum from "../../../../courses/how-to-run-a-dojo/lessons/intro.json";

/** Always-available draft shells. Opening these does not claim a filesystem installation. */
export const starterCourses: (ExploreCourse & { mode: "interactive"; author: string; lessonTitles: string[]; tags: string[] })[] = [
  { source: createManifest, title: "Create your own dojo", hue: 350, categories: ["authoring"] },
  { source: runManifest, title: "How to run a dojo", hue: 170, categories: ["getting-started"] },
].map(({ source, title, hue, categories }) => {
  const manifest = parse(source) as { name: string; title: string; version: string; description: string; language?: string; tags?: string[] };
  return { id: manifest.name, title: manifest.title, version: manifest.version, blurb: manifest.description, language: manifest.language,
    mode: "interactive", author: "Dojo.foo", tags: manifest.tags ?? [],
    lessonTitles: manifest.name === "how-to-run-a-dojo" ? runCurriculum.lessons.map(lesson => lesson.title) : [createCurriculum.title],
    categories, art: { hue, glyph: "D" } };
});
