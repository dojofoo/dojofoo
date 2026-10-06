import { Copy, type MynaIconsProps } from "@mynaui/icons-react";

export function LessonsIcon({ className, ...props }: MynaIconsProps) {
  return <Copy size={16} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
