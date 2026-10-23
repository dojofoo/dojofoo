import { expect, it } from "vitest";
import { parseManifest, validateManifest } from "./index";

const course = {
  name: "python-basics", version: "1.0.0", description: "Python practice", mode: "katas", test: "python -m pytest {template}",
  chapters: [{ id: "foundations", title: "Foundations", path: "chapters/01-foundations", lessons: [
    { id: "variables", title: "Variables", template: "chapters/01-foundations/lessons/01-variables/kata.py" },
  ] }],
};

it("loads chapter order and stable lesson IDs into the shared runtime curriculum", () => {
  const loaded = parseManifest(JSON.stringify(course), "dojo.json");
  expect(loaded).toMatchObject({ katas: [{ name: "variables", title: "Variables", chapter: {
    id: "foundations", title: "Foundations", path: "chapters/01-foundations",
  } }] });
  expect(validateManifest(course)).toEqual([]);
});

it("rejects duplicate lesson identities across chapters, conflicting formats and escaping paths", () => {
  expect(validateManifest({ ...course, chapters: [...course.chapters, { ...course.chapters[0], id: "next" }] }).join("\n")).toContain("Duplicate lesson ID");
  expect(validateManifest({ ...course, katas: [] }).join("\n")).toContain("not both");
  expect(validateManifest({ ...course, chapters: [{ ...course.chapters[0], path: "../outside" }] }).join("\n")).toContain("relative");
  expect(validateManifest({ ...course, chapters: [{ ...course.chapters[0], id: "../outside" }] }).join("\n")).toContain("id");
  expect(validateManifest({ ...course, chapters: [{ ...course.chapters[0], lessons: [
    { id: "../outside", template: "chapters/01-foundations/kata.py" },
  ] }] }).join("\n")).toContain("id");
  expect(validateManifest({ ...course, chapters: [{ ...course.chapters[0], lessons: [
    { id: "outside", template: "chapters/02/kata.py" },
  ] }] }).join("\n")).toContain("inside chapter");
});
