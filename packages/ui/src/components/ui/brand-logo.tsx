import type { ComponentProps } from "react";
import logoSvg from "../../../../../assets/brand/dojofoo.svg?raw";
import { cn } from "../../lib/utils";

type BrandLogoProps = Omit<ComponentProps<"span">, "children"> & {
  alt?: string;
};

function BrandLogo({ alt = "dojofoo", className, ...props }: BrandLogoProps) {
  return (
    <span
      aria-label={alt}
      className={cn(
        "dojo-brand-logo relative inline-block aspect-[3.19/1] h-6 w-16 shrink-0 text-neutral-700 [&_circle]:!fill-current [&_path]:!fill-current [&_svg]:absolute [&_svg]:top-1/2 [&_svg]:-translate-y-1/2 [&_svg]:block [&_svg]:h-auto [&_svg]:w-full dark:text-white",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: logoSvg }}
      role="img"
      {...props}
    />
  );
}

export { BrandLogo };
export type { BrandLogoProps };
