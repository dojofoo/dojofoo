import { expect, it } from "vitest";
import { lessonResources } from "./lesson-resources";

it("resolves real authored resources against the briefing's source directory", () => {
  const resources = lessonResources("[Local **notes**](./reference.md)\n\n[Reference](https://example.com/api)\n\n[Same notes](./reference.md)", "lessons/first", "actual-workspace");
  expect(resources).toEqual([
    { title: "Local notes", href: "/api/interactive/asset?workspace=actual-workspace&path=lessons%2Ffirst%2Freference.md" },
    { title: "Reference", href: "https://example.com/api" },
  ]);
});

it("understands reference links and omits images, code samples, anchors and unsafe links", () => {
  expect(lessonResources('[Guide][guide]\n\n[guide]: https://example.com/guide\n\n![image](image.png)\n\n[Section](#section)\n\n[unsafe](javascript:alert(1))\n\n```md\n[Example](./example.md)\n```', null, "workspace"))
    .toEqual([{ title: "Guide", href: "https://example.com/guide" }]);
});

it("keeps an explicitly selected interactive course in its resource links", () => {
  expect(lessonResources("[Reference](reference.pdf)", "lessons", "workspace", "second")).toEqual([
    { title: "Reference", href: "/api/interactive/asset?workspace=workspace&path=lessons%2Freference.pdf&course=second" },
  ]);
});
