import { routerViewTransition } from "@dojofoo/uix/lib/view-transition"
import { createRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"
import { NotFound } from "@/components/not-found"

export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: "intent",
    defaultViewTransition: routerViewTransition,
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
