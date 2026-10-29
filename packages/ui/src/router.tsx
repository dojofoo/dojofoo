import { createRouter } from "@tanstack/react-router";
import { routerNavigationTransition } from "@dojofoo/uix/lib/view-transition";
import { dashboardDepth } from "./lib/dashboard-navigation";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultViewTransition: routerNavigationTransition(dashboardDepth),
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface HistoryState {
    lesson?: { workspaceId: string; courseId: string; lessonId: string; sessionId: string };
  }
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
