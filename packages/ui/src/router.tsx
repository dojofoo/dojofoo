import { createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { observeRouterViewTransition, routerNavigationTransition } from "@dojofoo/uix/lib/view-transition";
import { dashboardDepth } from "./lib/dashboard-navigation";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  // TanStack Query caches what pages read (TanStack Router, "External data loading"): a page shows its cached data at once and
  // refetches it when it mounts. Nothing refetches on focus or reconnect, so a refetch never replaces state a page is editing.
  const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, refetchOnReconnect: false } } });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    Wrap: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    defaultPreload: "intent",
    // The query cache decides freshness; the router keeps a preload only to share its work in flight ("Preloading")
    defaultPreloadStaleTime: 0,
    defaultViewTransition: routerNavigationTransition(dashboardDepth),
    scrollRestoration: true,
    scrollToTopSelectors: [".ui-as-main__scroll", ".ui-as-chat__details"],
  });
  router.subscribe("onBeforeNavigate", observeRouterViewTransition);
  router.subscribe("onBeforeRouteMount", observeRouterViewTransition);
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
