import { useSyncExternalStore } from "react";

// Motion's useReducedMotion reads the media query on the very first client
// render, but the server can't know it, so every component that renders
// differently under reduced motion broke hydration for those users. This
// reports false during hydration, matching the server HTML, then the real
// preference straight after, and follows it if it changes.
const query = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
