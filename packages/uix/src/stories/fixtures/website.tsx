import { fadeViewTransition } from "../../lib/view-transition";
import { useEffect, useMemo, useRef, useState } from "react";
import { findPage } from "./docs";
import { renderMarkdown } from "../../lib/markdown";
import { useEditorScheme } from "../../lib/ui-preferences";
import { DocsSite } from "../../docs/docs-site";
import { catalog, courseById } from "./catalog";
import type { WebCourse } from "../../web/catalog";
import { docsContent } from "./docs";
import { SearchDialog } from "./search";
import type { SearchScope } from "../../components/site-search-palette";
import { LearningPreview } from "../../web/learning-preview";
import { CoursePage } from "../../web/course";
import { CoursesPage } from "../../web/courses";
import { LandingPage } from "../../web/landing";
import { SiteContext, type SiteLinks } from "../../web/site";
import { APIPageFixture } from "./api-reference";

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
  const [search, setSearch] = useState<{ open: boolean; scope: SearchScope }>({ open: false, scope: "courses" });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch({ open: true, scope: page === "docs" ? "docs" : "courses" });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [page]);
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
    sectionHref: section => ({ home: "/", courses: "/dojos", docs: "/docs", help: "/docs" })[section],
    navigate: (section) => {
      if (section === "help" || section === "docs") { void openDoc("/docs"); return; }
      request.current++;
      fadeViewTransition(() => {
      setPage(section === "home" ? "landing" : section === "courses" ? "courses" : "docs");
      window.scrollTo({ top: 0 });
      });
    },
    openDoc,
    courseHref: item => `/courses/${item.source}/${item.slug}`,
    openSearch: scope => setSearch({ open: true, scope }),
    openCourse: (next) => { request.current++; fadeViewTransition(() => {
      setCourse(next);
      setPage("course");
      window.scrollTo({ top: 0 });
    }); },
  }), [theme]);
  return (
    <SiteContext.Provider value={links}>
      {page === "course" ? <CoursePage course={course} />
        : page === "courses" ? <CoursesPage courses={catalog} />
        : page === "docs" ? <DocsSite path={doc} content={docsContent} renderApiPage={page => <APIPageFixture page={page} />} />
        : <LandingPage learning={8} courses={catalog} featureCourse={courseById("everyday-typescript")} preview={<LearningPreview />} />}
      <SearchDialog {...search} onClose={() => setSearch(state => ({ ...state, open: false }))} onOpenDoc={links.openDoc} onOpenCourse={links.openCourse} />
    </SiteContext.Provider>
  );
}
