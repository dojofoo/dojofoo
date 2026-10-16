import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "~/lib/utils";

/*
 * The player's buttons: shadcn's current Button, the one videocn depends on (`@shadcn/button`), classes as rendered on
 * videocn.dev. It lives here because uix's own Button is affectUI's, with another API, and the registry would have
 * overwritten it. One change: the corners are the site's pixel values (10px, 8px), since uix's radius tokens are
 * scaled for squircle corners.
 */
const base =
  "group/button inline-flex shrink-0 items-center justify-center border border-transparent bg-clip-padding font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0";

const variants = {
  ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
  default: "bg-primary text-primary-foreground hover:bg-primary/80",
} as const;

const sizes = {
  icon: "size-8 rounded-[10px] text-sm [&_svg:not([class*='size-'])]:size-4",
  sm: "h-7 gap-1 rounded-[8px] px-2.5 text-[0.8rem] has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
  default: "h-8 gap-1.5 rounded-[10px] px-2.5 text-sm [&_svg:not([class*='size-'])]:size-4",
} as const;

type PlayerButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants; size?: keyof typeof sizes };

export const Button = forwardRef<HTMLButtonElement, PlayerButtonProps>(({ variant = "default", size = "default", className, type = "button", ...props }, ref) => (
  <button ref={ref} type={type} data-slot="button" className={cn(base, variants[variant], sizes[size], className)} {...props} />
));
Button.displayName = "Button";
