import { CheckCircle, type MynaIconsProps } from "@mynaui/icons-react";

export function CheckmarkIcon({ className, ...props }: MynaIconsProps) {
  return <CheckCircle size={16} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
