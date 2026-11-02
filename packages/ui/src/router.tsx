import { createRouter } from "@tanstack/react-router";
import { observeRouterViewTransition, routerNavigationTransition } from "@dojofoo/uix/lib/view-transition";
import { dashboardDepth } from "./lib/dashboard-navigation";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultViewTransition: routerNavigationTransition(dashboardDepth),
    scrollRestoration: true,
    scrollToTopSelectors: [".ui-as-main__scroll", ".ui-as-chat__details"],
  });
  router.subscribe("onBeforeNavigate", observeRouterViewTransition);
  router.subscribe("onBeforeRouteMount", observeRouterViewTransition);
  return router;
}

declare module "@tanstack/react-router" {
  interface HistoryState {
    courseLesson?: { courseId: string; lessonId: string };
    lesson?: { workspaceId: string; courseId: string; lessonId: string; sessionId: string };
  }
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
