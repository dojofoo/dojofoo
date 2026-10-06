import { ChevronDown, type MynaIconsProps } from "@mynaui/icons-react";

export function ChevronDownIcon({ className, ...props }: MynaIconsProps) {
  return <ChevronDown size={12} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
