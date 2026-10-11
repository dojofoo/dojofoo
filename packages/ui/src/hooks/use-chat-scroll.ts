import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Follow output until the reader scrolls away. Explicit replies resume following. */
export function useChatScroll() {
  const [viewport, viewportRef] = useState<HTMLElement | null>(null);
  const following = useRef(true);
  const scrollToBottom = useCallback(() => {
    following.current = true;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  }, [viewport]);

  useLayoutEffect(() => {
    if (!viewport) return;
    let previousTop = viewport.scrollTop;
    const onScroll = () => {
      // A queued programmatic scroll may arrive after new content has grown.
      // Only movement away from the bottom should stop following that content.
      if (viewport.scrollTop < previousTop) following.current = false;
      else if (viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 32) following.current = true;
      previousTop = viewport.scrollTop;
    };
    const follow = () => {
      if (following.current) viewport.scrollTop = viewport.scrollHeight;
    };
    const observer = new ResizeObserver(follow);
    observer.observe(viewport);
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
    viewport.addEventListener("scroll", onScroll, { passive: true });
    scrollToBottom();
    return () => {
      observer.disconnect();
      viewport.removeEventListener("scroll", onScroll);
    };
  }, [scrollToBottom, viewport]);

  return { viewportRef, scrollToBottom };
}
