import { ThemeToggle } from "./layout/theme-toggle";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { useEffect, useMemo, type ReactNode } from "react";
import { SiteContext, type SiteLinks, type SiteSection } from "@dojofoo/uix/web/site";

const destinations: Record<SiteSection, string> = { home: "/", courses: "/dojos", docs: "/docs", help: "/docs" };
const footerLinks: NonNullable<SiteLinks["footerLinks"]> = [
  { title: "Learn", links: [["Usage", "/docs"], ["Quickstart", "/docs/quickstart"], ["Installation", "/docs/installation"]] },
  { title: "Explore", links: [["Courses", "/dojos"], ["Authoring", "/authoring"], ["Developers", "/developers"]] },
  { title: "Project", links: [["GitHub", "https://github.com/dojofoo/dojofoo"], ["Issues", "https://github.com/dojofoo/dojofoo/issues"], ["Roadmap", "https://github.com/dojofoo/dojofoo/blob/main/ROADMAP.md"], ["License", "https://github.com/dojofoo/dojofoo/blob/main/packages/cli/LICENSE"]] },
];

/** Routing and global search stay with TanStack/Fumadocs. */
export function UIXSiteProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const router = useRouter();
  // Refresh the initial static snapshot once; client navigations load through the router.
  useEffect(() => {
    const pathname = router.state.location.pathname.replace(/\/+$/, "") || "/";
    if (pathname === "/" || pathname === "/dojos") {
      void router.invalidate({ filter: match => match.routeId === pathname, sync: false });
    }
  }, [router]);
  const { setOpenSearch } = useSearchContext();
  const links = useMemo<SiteLinks>(() => {
    const open = (href: string) => {
      const [to, hash] = href.split("#");
      void navigate({ to, hash });
    };
    const courseHref: SiteLinks["courseHref"] = course => `/courses/${course.source}/${course.slug}`;
    return {
      navigate: section => open(destinations[section]), sectionHref: section => destinations[section],
      openDoc: open, courseHref, openCourse: course => open(courseHref(course)),
      openSearch: () => setOpenSearch(true), footerLinks, footerControls: <ThemeToggle />,
    };
  }, [navigate, setOpenSearch]);
  return <SiteContext.Provider value={links}>{children}</SiteContext.Provider>;
}
