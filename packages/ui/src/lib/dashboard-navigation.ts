import type { ShellSection } from "@dojofoo/uix/components/app-shell";
import { CoursesIcon, ExploreIcon } from "@dojofoo/uix/icons";

/** The dashboard's sidebar, one for its pages (Courses, Explore, Settings), so moving between them leaves it as it is */
export const dashboardNavigationKey = "dashboard";

export function dashboardNavigation(): ShellSection[] {
  return [{ id: "dashboard", heading: "Dashboard", items: [
    { id: "courses", label: "Courses", icon: CoursesIcon, href: "/" },
    { id: "explore", label: "Explore", icon: ExploreIcon, href: "/explore" },
  ] }];
}

const dashboardPaths = new Set(["/", "/explore", "/settings", "/avatar"]);

/** How deep a page sits: the dashboard's pages 0, a course's (its lessons, a session, a starter) 1 – the sidebar's menu
    swipes into a course and back out of it */
export const dashboardDepth = (pathname: string) => dashboardPaths.has(pathname.replace(/\/+$/, "") || "/") ? 0 : 1;
