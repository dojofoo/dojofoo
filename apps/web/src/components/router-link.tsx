import { Link } from "@tanstack/react-router";
import type { NavigationAnchorProps } from "@dojofoo/uix/components/navigation-link";

/** Keep the website's route tree in this application, outside shared UIX presentation. */
export function RouterLink({ href, ...props }: NavigationAnchorProps) {
  return <Link {...props} preload="intent" to={href ?? "/"} href={href} activeOptions={{ exact: true }} />;
}
