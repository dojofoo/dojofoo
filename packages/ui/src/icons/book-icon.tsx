import { Book, type MynaIconsProps } from "@mynaui/icons-react";

export function BookIcon({ className, ...props }: MynaIconsProps) {
  return <Book size={16} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
