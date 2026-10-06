import { DotsVertical, type MynaIconsProps } from "@mynaui/icons-react";

export function MenuIcon({ className, ...props }: MynaIconsProps) {
  return <DotsVertical size={16} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
