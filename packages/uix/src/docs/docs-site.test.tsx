import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { DocsSite } from "./docs-site";
import { createDocsContent } from "./content";
import { SiteContext, type SiteLinks } from "../web/site";

it("renders host-compiled content and heading IDs instead of re-parsing an MDX projection", () => {
  const page = { path: "/docs", title: "Usage", body: "## Projection heading", source: "apps/web/content/docs/index.mdx", onSite: true };
  const content = createDocsContent([{ id: "usage", title: "Usage", groups: [{ pages: [page], entries: [{ path: page.path, title: page.title, page }] }] }]);
  const links: SiteLinks = { navigate: vi.fn(), openDoc: vi.fn(), openCourse: vi.fn(), openSearch: vi.fn(), sectionHref: section => section === "courses" ? "/dojos" : "/docs", courseHref: course => `/courses/${course.source}/${course.slug}` };
  const markup = renderToStaticMarkup(createElement(SiteContext.Provider, { value: links }, createElement(DocsSite, {
    path: "/docs", content, renderPage: () => createElement("p", null, "Compiled MDX component"),
    toc: [{ depth: 2, id: "compiled-id", text: createElement("code", null, "Compiled heading") }, { depth: 2, id: "compiled-id-1", text: "Compiled heading again" }],
  })));
  expect(markup).toContain("Compiled MDX component");
  expect(markup).toContain('href="#compiled-id"');
  expect(markup).toContain('href="#compiled-id-1"');
  expect(markup).toContain("<code>Compiled heading</code>");
  expect(markup).not.toContain('href="#projection-heading"');
});
