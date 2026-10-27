import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { SiteContext, SiteHeader, SiteFooter, type SiteLinks, type SiteSection } from "./site";

const destinations: Record<SiteSection, string> = { home: "/", courses: "/dojos", docs: "/docs", help: "/docs" };
const links: SiteLinks = {
  navigate: vi.fn(), openDoc: vi.fn(), openCourse: vi.fn(), openSearch: vi.fn(), courseHref: item => `/courses/${item.source}/${item.slug}`,
  sectionHref: section => destinations[section],
};
const hrefs = (markup: string) => [...markup.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map(match => match[1]);

it("server-renders the host's real navigation destinations in the shared header", () => {
  const markup = renderToStaticMarkup(createElement(SiteContext.Provider, { value: links }, createElement(SiteHeader)));
  expect(hrefs(markup)).toEqual(expect.arrayContaining(["/", "/dojos", "/docs", "/docs/quickstart"]));
  expect(hrefs(markup)).not.toContain("#");
});

it("keeps footer section destinations usable without a client-side click handler", () => {
  const markup = renderToStaticMarkup(createElement(SiteContext.Provider, { value: links }, createElement(SiteFooter)));
  expect(hrefs(markup)).toContain("/dojos");
  expect(hrefs(markup)).not.toContain("#");
});
