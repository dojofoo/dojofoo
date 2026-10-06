import { Clock3, type MynaIconsProps } from "@mynaui/icons-react";

export function ClockIcon({ className, ...props }: MynaIconsProps) {
  return <Clock3 size={16} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
