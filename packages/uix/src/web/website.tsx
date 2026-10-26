import { fadeViewTransition } from "~/lib/view-transition";
import { useEffect, useMemo, useRef, useState } from "react";
import { findPage } from "~/docs/content";
import { renderMarkdown } from "~/lib/markdown";
import { useEditorScheme } from "~/lib/ui-preferences";
import { DocsSite } from "~/docs/docs-site";
import { courseById, type WebCourse } from "./catalog";
import { CoursePage } from "./course";
import { CoursesPage } from "./courses";
import { LandingPage } from "./landing";
import { SiteContext, type SiteLinks } from "./site";

/*
 * The website's pages, linked: the header, the search, the course cards, the footer and the docs' own links move between
 * them, so a story can be clicked through like the site. Help is the docs (src/docs).
 */

export type WebsiteStart = "landing" | "courses" | "course" | "docs";

export function Website({ start = "landing", courseId = "effect-ts", docPath = "/docs" }: {
  start?: WebsiteStart;
  /** The course a "course" start opens */
  courseId?: string;
  /** The docs page a "docs" start opens, by its site path */
  docPath?: string;
}) {
  const [page, setPage] = useState<WebsiteStart>(start);
  const [course, setCourse] = useState<WebCourse>(() => courseById(courseId));
  const [doc, setDoc] = useState(docPath);
  const theme = useEditorScheme().theme.name;
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const openDoc = async (href: string) => {
    const pending = ++request.current;
    await renderMarkdown(findPage(href.split("#")[0]).page.body, theme).catch(() => {});
    if (pending !== request.current) return;
    fadeViewTransition(() => {
      setDoc(href);
      setPage("docs");
      if (!href.includes("#")) window.scrollTo({ top: 0 });
    });
  };
  const links = useMemo<SiteLinks>(() => ({
    navigate: (section) => {
      if (section === "help" || section === "docs") { void openDoc("/docs"); return; }
      request.current++;
      fadeViewTransition(() => {
      setPage(section === "home" ? "landing" : section === "courses" ? "courses" : "docs");
      window.scrollTo({ top: 0 });
      });
    },
    openDoc,
    openCourse: (next) => { request.current++; fadeViewTransition(() => {
      setCourse(next);
      setPage("course");
      window.scrollTo({ top: 0 });
    }); },
  }), [theme]);
  return (
    <SiteContext.Provider value={links}>
      {page === "course" ? <CoursePage course={course} />
        : page === "courses" ? <CoursesPage />
        : page === "docs" ? <DocsSite path={doc} />
        : <LandingPage />}
    </SiteContext.Provider>
  );
}
