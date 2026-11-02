import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CourseExplore } from "./course-explore";

it("shows the supplied course catalog through the Pages Explore surface without sample reviews or installs", () => {
  const html = renderToStaticMarkup(<CourseExplore courses={[
    { id: "run", title: "How to run a dojo", blurb: "Find your way around.", version: "0.0.1", art: { hue: 350, glyph: "D" } },
    { id: "create", title: "Create your own dojo", blurb: "Shape an independent draft.", version: "0.0.1", art: { hue: 170, glyph: "D" } },
  ]} onOpen={() => {}} />);
  expect(html).toContain("Find your next course");
  expect(html).toContain('aria-label="Featuring"');
  expect(html).toContain("How to run a dojo");
  expect(html).toContain("Create your own dojo");
  expect(html).toContain('aria-label="Open Create your own dojo"');
  expect(html).not.toContain("Hannah Osei");
  expect(html).not.toContain("Rated 4.9");
  expect(html).not.toContain("Everyday TypeScript");
  expect(html).not.toContain(">Updated<");
});

it("features uninstalled courses, offers Details, and resumes installed courses", () => {
  const courses = [
    { id: "run", title: "How to run a dojo", blurb: "Learn the UI.", art: { hue: 350, glyph: "D" } },
    { id: "create", title: "Create your own dojo", blurb: "Create a course.", art: { hue: 170, glyph: "D" } },
  ];
  const html = renderToStaticMarkup(<CourseExplore courses={courses} installed={["run"]} featuredId="run" onOpen={() => {}} onPreview={() => {}} />);
  const featuring = html.split('aria-label="Featuring"')[1]?.split('</ol>')[0];
  expect(featuring).toContain("Create your own dojo");
  expect(featuring).not.toContain("How to run a dojo");
  expect(html).toContain('aria-label="Continue How to run a dojo"');
  expect(html).toContain('aria-label="Details Create your own dojo"');
  expect(html).not.toContain("Preview");
  const allInstalled = renderToStaticMarkup(<CourseExplore courses={courses} installed={["run", "create"]} onOpen={() => {}} onPreview={() => {}} />);
  expect(allInstalled).not.toContain('aria-label="Featuring"');
});
