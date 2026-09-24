"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type SiteNavigationProps = HTMLAttributes<HTMLElement> & {
  as?: "header" | "div";
  brand: ReactNode;
  actions?: ReactNode;
  leading?: ReactNode;
};

function SiteNavigation({
  as: Component = "header",
  actions,
  brand,
  className,
  leading,
  ...props
}: SiteNavigationProps) {
  return (
    <Component
      className={cn(
        "border-b border-dashed border-border bg-background/90 backdrop-blur-md [&_.dojo-brand-logo]:w-14",
        Component === "header" && "sticky top-0 z-40",
        className,
      )}
      {...props}
    >
      <div className="mx-auto flex h-16 w-full max-w-(--fd-layout-width) items-center gap-2 px-5 lg:px-8">
        {brand}
        {leading}
        {actions && <nav aria-label="Primary" className="ml-auto flex items-center gap-1">{actions}</nav>}
      </div>
    </Component>
  );
}

export { SiteNavigation };
export type { SiteNavigationProps };
