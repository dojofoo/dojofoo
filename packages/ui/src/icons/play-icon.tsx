import { PlaySolid, type MynaIconsProps } from "@mynaui/icons-react";

export function PlayIcon({ className, ...props }: MynaIconsProps) {
  return <PlaySolid size={12} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
