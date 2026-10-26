import { flushSync } from "react-dom";

export type UiTransition = "ui-navigation" | "ui-theme" | "ui-pane";
/** The same navigation contract for TanStack Router and interactive Storybook previews. */
export const routerViewTransition = { types: ({ pathChanged }: { pathChanged: boolean }) => pathChanged ? ["ui-navigation"] : false as const };
let committing = false;
let active: ViewTransition | undefined;

export function runViewTransition(update: () => void, type: UiTransition = "ui-navigation") {
  // A route action can delegate to another action; commit it in the current snapshot.
  if (committing) { update(); return; }
  if (typeof document === "undefined" || !document.startViewTransition) {
    update();
    return;
  }
  active?.skipTransition();
  document.activeViewTransition?.skipTransition();
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

export const fadeViewTransition = (update: () => void) => runViewTransition(update, "ui-navigation");
export const themeViewTransition = (update: () => void) => runViewTransition(update, "ui-theme");
export const paneViewTransition = (update: () => void) => runViewTransition(update, "ui-pane");
