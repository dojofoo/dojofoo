import { FileText, type MynaIconsProps } from "@mynaui/icons-react";

export function ArticleIcon({ className, ...props }: MynaIconsProps) {
  return <FileText size={16} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
