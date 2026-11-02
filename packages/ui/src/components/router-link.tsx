import { Link } from "@tanstack/react-router";
import type { NavigationAnchorProps } from "@dojofoo/uix/components/navigation-link";

/** UIX supplies built hrefs; TanStack owns history, preloading and view transitions. */
export function RouterLink({ href, ...props }: NavigationAnchorProps) {
  return <Link {...props} to={href ?? "/"} href={href} activeOptions={{ exact: true }} />;
}
