import { ChevronRight, type MynaIconsProps } from "@mynaui/icons-react";

export function ChevronRightIcon({ className, ...props }: MynaIconsProps) {
  return <ChevronRight size={12} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
