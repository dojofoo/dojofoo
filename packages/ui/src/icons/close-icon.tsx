import { X, type MynaIconsProps } from "@mynaui/icons-react";

export function CloseIcon({ className, ...props }: MynaIconsProps) {
  return <X size={16} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
