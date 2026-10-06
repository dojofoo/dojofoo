import { Sidebar, type MynaIconsProps } from "@mynaui/icons-react";

export function SidebarIcon({ className, ...props }: MynaIconsProps) {
  return <Sidebar size={16} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
