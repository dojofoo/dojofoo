import { useEffect, useState } from "react";
import { flushSync } from "react-dom";

export type UiTransition = "ui-navigation" | "ui-theme" | "ui-pane" | "ui-card";
/** The same navigation contract for TanStack Router and interactive Storybook previews. */
export const routerViewTransition = { types: ({ pathChanged }: { pathChanged: boolean }) => pathChanged ? ["ui-navigation"] : false as const };

/** TanStack awaits updateCallbackDone but not ready (upstream discussion #7733).
 * Observe the router-owned animation before it can be superseded. Navigation
 * failures still propagate through TanStack; only an expected visual skip is ignored. */
export function observeRouterViewTransition() {
  if (typeof document === "undefined") return;
  void document.activeViewTransition?.ready.catch(error => {
    if (error instanceof DOMException && error.name === "AbortError") return;
    globalThis.reportError(error);
  });
}
/**
 * routerViewTransition, told how deep each page sits (e.g. 0 the dashboard's pages, 1 a course's): a move deeper is also
 * ui-forward, one back up ui-back, so the sidebar's menu swipes one way into a course and the other way out of it
 */
export function routerNavigationTransition(depth: (pathname: string) => number) {
  return { types: ({ pathChanged, fromLocation, toLocation }: { pathChanged: boolean; fromLocation?: { pathname: string }; toLocation: { pathname: string } }) => {
    if (!pathChanged) return false as const;
    const from = fromLocation ? depth(fromLocation.pathname) : undefined;
    const to = depth(toLocation.pathname);
    return from === undefined || from === to ? ["ui-navigation"] : ["ui-navigation", to > from ? "ui-forward" : "ui-back"];
  } };
}
let committing = false;
let active: ViewTransition | undefined;

export function runViewTransition(update: () => void, type: UiTransition = "ui-navigation") {
  // A route action can delegate to another action; commit it in the current snapshot.
  if (committing) { update(); return; }
  if (typeof document === "undefined" || !document.startViewTransition) {
    update();
    return;
  }
  const routeTransition = document.activeViewTransition;
  if (routeTransition && routeTransition !== active) {
    // A router transition already covers this update. Starting a second one
    // aborts its snapshot and leaves the router's ready promise rejected.
    update();
    return routeTransition;
  }
  active?.skipTransition();
  const commit = () => {
    committing = true;
    try { flushSync(update); } finally { committing = false; }
  };
  const typed = CSS.supports("selector(:active-view-transition-type(ui-navigation))");
  const transition = typed ? document.startViewTransition({ update: commit, types: [type] }) : document.startViewTransition(commit);
  active = transition;
  void transition.ready.catch(() => {});
  void transition.finished.then(() => { if (active === transition) active = undefined; }, () => { if (active === transition) active = undefined; });
  return transition;
}

/** Resolves once the view transition running now has finished, at once when none is. A heavy mount (the code editor, a
 *  conversation's replay) waits for it, so the animation is not starved of frames. */
export function afterViewTransition(): Promise<void> {
  const transition = typeof document === "undefined" ? undefined : document.activeViewTransition;
  return transition ? transition.finished.then(() => {}, () => {}) : Promise.resolve();
}

/** False while the view transition that showed this component is still animating. */
export function useViewTransitionSettled(): boolean {
  const [settled, setSettled] = useState(() => typeof document === "undefined" || !document.activeViewTransition);
  useEffect(() => {
    if (settled) return;
    let live = true;
    void afterViewTransition().then(() => { if (live) setSettled(true); });
    return () => { live = false; };
  }, [settled]);
  return settled;
}

export const cardViewTransition = (update: () => void) => runViewTransition(update, "ui-card");
export const fadeViewTransition = (update: () => void) => runViewTransition(update, "ui-navigation");
export const themeViewTransition = (update: () => void) => runViewTransition(update, "ui-theme");
export const paneViewTransition = (update: () => void) => runViewTransition(update, "ui-pane");

/** Register in a synchronous head script, before document transitions can fire.
 * A literal keeps the bootstrap identical in independently minified server/client builds. */
export const documentTransitionScript = `(() => {
  const observe = event => {
    const transition = event.viewTransition;
    if (!transition) return;
    const report = error => {
      if (error instanceof DOMException && (error.name === "AbortError" ||
        error.name === "InvalidStateError" && error.message === "Transition was aborted because of invalid state. ViewTransition opt-in disabled")) return;
      if (typeof globalThis.reportError === "function") globalThis.reportError(error);
      else console.error(error);
    };
    void transition.ready.catch(report);
    void transition.finished.catch(report);
  };
  window.addEventListener("pageswap", observe);
  window.addEventListener("pagereveal", observe);
})();`;
