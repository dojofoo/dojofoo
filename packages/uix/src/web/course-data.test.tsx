import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { cardInfo, installCommand, installPrompt, type WebCourse } from "./catalog";
import { CourseTile } from "./course-tile";
import { CoursePage } from "./course";
import { CoursesPage } from "./courses";
import { LandingPage } from "./landing";
import { SiteContext, type SiteLinks } from "./site";

// Metadata supplied by the marketplace, plus presentation-only artwork.
const course: WebCourse = {
  id: "dojofoo/effect-ts", slug: "effect-ts", name: "Effect TS", source: "dojofoo",
  description: "Learn Effect through focused lessons.", version: "0.0.6", publishedAt: "2026-10-01T12:00:00Z",
  repository: "dojofoo/effect-ts", repositoryUrl: "https://github.com/dojofoo/effect-ts", author: "Dojo.foo",
  language: "TypeScript", framework: null, tags: ["effect"], mode: "katas", kataCount: 40,
  installUrl: "dojofoo/effect-ts", trendingRank: 1, art: { hue: 350, glyph: "TS" }, shader: "topography",
  metrics: { installs: 3, started: 2, progressing: 1, finished: 1, completionRate: 50, kataProgress: [], weeklyActivity: [] },
};
const links: SiteLinks = { navigate: vi.fn(), sectionHref: section => section === "courses" ? "/dojos" : "/docs", openDoc: vi.fn(), openCourse: vi.fn(), openSearch: vi.fn(), courseHref: item => `/courses/${item.source}/${item.slug}` };

it("accepts marketplace data without inventing ratings, chapters or learning hours", () => {
  const info = cardInfo(course);
  expect(info.title).toBe("Effect TS");
  expect(info.updated).toBe("1 Oct 2026");
  expect(info.rating).toBeUndefined();
  expect(info.chapters).toBeUndefined();
  expect(info.hours).toBeUndefined();
});

it("renders an unrated course as a real link without a fabricated score", () => {
  const markup = renderToStaticMarkup(createElement(CourseTile, { course, href: "/courses/dojofoo/effect-ts" }));
  expect(markup).toContain('href="/courses/dojofoo/effect-ts"');
  expect(markup).not.toMatch(/Rated|out of 5|undefined|NaN/);
});

it("renders real activity and omits unavailable course provenance and audit claims", () => {
  const markup = renderToStaticMarkup(createElement(SiteContext.Provider, { value: links }, createElement(CoursePage, { course })));
  expect(markup).toContain("Effect TS");
  expect(markup).toContain("50% of starts");
  expect([...markup.matchAll(/GitHub stars|First seen|Security audits|Scanned|undefined|NaN|Invalid Date/g)].map(match => markup.slice(Math.max(0, match.index - 45), match.index + 65))).toEqual([]);
});

it("server-renders catalog course destinations supplied by the host", () => {
  const markup = renderToStaticMarkup(createElement(SiteContext.Provider, { value: { ...links, courseHref: item => `/courses/${item.source}/${item.slug}` } }, createElement(CoursesPage, { courses: [course] })));
  expect(markup).toContain('href="/courses/dojofoo/effect-ts"');
});

it("does not offer a shell command when the API has no installation source", () => {
  const unavailable = { ...course, installUrl: null };
  expect(installCommand(unavailable)).toBeNull();
  expect(installPrompt(unavailable)).toBeNull();
  const markup = renderToStaticMarkup(createElement(SiteContext.Provider, { value: links }, createElement(CoursePage, { course: unavailable })));
  expect(markup).not.toContain("dojofoo add null");
  expect(markup).toContain("No installation source is available");
});

it("renders the real empty catalog without a sample course or pretend live telemetry", () => {
  const markup = renderToStaticMarkup(createElement(SiteContext.Provider, { value: links }, createElement(LandingPage, { courses: [], preview: null })));
  expect(markup).toContain("You can only fight the way you practice");
  expect(markup).toContain("No courses are available yet");
  expect(markup).not.toContain("people learning right now");
  expect(markup).not.toContain("undefined");
});
