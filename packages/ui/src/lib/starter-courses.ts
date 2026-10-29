import { parse } from "yaml";
import type { ExploreCourse } from "@dojofoo/uix/containers/course-explore";
import createManifest from "../../../../courses/create-your-own-dojo/dojo.yaml?raw";
import runManifest from "../../../../courses/how-to-run-a-dojo/dojo.yaml?raw";

/** Always-available draft shells. Opening these does not claim a filesystem installation. */
export const starterCourses: ExploreCourse[] = [
  { source: createManifest, title: "Create your own dojo", hue: 350, categories: ["authoring"] },
  { source: runManifest, title: "How to run a dojo", hue: 170, categories: ["getting-started"] },
].map(({ source, title, hue, categories }) => {
  const manifest = parse(source) as { name: string; version: string; description: string; language?: string };
  return { id: manifest.name, title, version: manifest.version, blurb: manifest.description, language: manifest.language,
    categories, art: { hue, glyph: "D" } };
});
