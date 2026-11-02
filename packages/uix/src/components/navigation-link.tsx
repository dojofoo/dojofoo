import { createContext, useContext, type ComponentPropsWithRef, type ComponentType, type ReactNode } from "react";
import { followLink } from "../lib/link-event";

export type NavigationAnchorProps = ComponentPropsWithRef<"a">;
type NavigationAdapter = ComponentType<NavigationAnchorProps>;
const NavigationContext = createContext<NavigationAdapter | undefined>(undefined);

/** Each application supplies its router Link; isolated UIX stories retain native anchors. */
export function NavigationProvider({ link, children }: { link?: NavigationAdapter; children: ReactNode }) {
  return <NavigationContext.Provider value={link}>{children}</NavigationContext.Provider>;
}

export type NavigationLinkProps = NavigationAnchorProps & {
  /** In-memory Storybook navigation; the application's router owns real links. */
  onNavigate?: () => void;
};

export function NavigationLink({ href, onClick, onNavigate, ...props }: NavigationLinkProps) {
  const adapter = useContext(NavigationContext);
  const routed = adapter && href?.startsWith("/") && !href.startsWith("//");
  const Link = routed ? adapter : "a";
  return <Link {...props} href={href} onClick={event => {
    onClick?.(event);
    if (!routed && onNavigate) followLink(event, onNavigate);
  }} />;
}
