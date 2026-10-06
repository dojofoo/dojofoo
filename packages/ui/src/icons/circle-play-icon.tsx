import { PlayCircle, type MynaIconsProps } from "@mynaui/icons-react";

export function CirclePlayIcon({ className, ...props }: MynaIconsProps) {
  return <PlayCircle size={16} className={["shrink-0", className].filter(Boolean).join(" ")} {...props} />;
}
