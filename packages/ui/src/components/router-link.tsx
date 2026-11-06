import { Link } from "@tanstack/react-router";
import type { NavigationAnchorProps } from "@dojofoo/uix/components/navigation-link";

/** UIX supplies built hrefs; TanStack owns history, preloading and view transitions. A course run is local, so its link
 *  preloads as soon as it is on screen (TanStack Router, "Preloading": viewport); other links preload on intent. */
export function RouterLink({ href, ...props }: NavigationAnchorProps) {
  return <Link {...props} to={href ?? "/"} href={href} activeOptions={{ exact: true }} {...(href?.startsWith("/learn/") ? { preload: "viewport" as const } : {})} />;
}
