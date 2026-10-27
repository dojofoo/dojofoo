import type { MouseEvent } from "react";

/** Delegate ordinary navigation to the host while preserving native new-tab and download gestures. */
export function followLink(event: MouseEvent<HTMLElement>, navigate: () => void) {
  const target = event.currentTarget.getAttribute("target");
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey ||
    event.currentTarget.hasAttribute("download") || target && target !== "_self") return;
  event.preventDefault();
  navigate();
}
