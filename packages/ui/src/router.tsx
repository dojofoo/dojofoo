import { createRouter } from "@tanstack/react-router";
import { routerViewTransition } from "@dojofoo/uix/lib/view-transition";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultViewTransition: routerViewTransition,
    scrollRestoration: true,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
