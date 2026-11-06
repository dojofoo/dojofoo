import { useEffect, useRef } from "react";

export type PageSocketMessage = { method?: string; params?: unknown; id?: string | number; result?: unknown; error?: { message?: string } };

/** A lesson or course page's socket (`/api/session?workspace&course[&lesson]`): its opening is the page's presence (D19), and it carries
 *  the page's notifications. It reconnects with backoff, so a short drop (a server restart) never reads as leaving. */
export function usePageSocket(page: { workspace?: string; course?: string; lesson?: string }, onMessage: (message: PageSocketMessage) => void) {
  const socket = useRef<WebSocket | null>(null);
  const handler = useRef(onMessage);
  handler.current = onMessage;
  useEffect(() => {
    if (!page.workspace || !page.course) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = 250;
    const connect = () => {
      if (cancelled) return;
      const url = new URL(`${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/session`);
      url.searchParams.set("workspace", page.workspace!);
      url.searchParams.set("course", page.course!);
      if (page.lesson) url.searchParams.set("lesson", page.lesson);
      const current = new WebSocket(url);
      socket.current = current;
      current.addEventListener("open", () => { delay = 250; });
      current.addEventListener("message", message => {
        try { handler.current(JSON.parse(String(message.data)) as PageSocketMessage); } catch {}
      });
      current.addEventListener("close", () => {
        if (socket.current === current) socket.current = null;
        if (cancelled) return;
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 5_000);
      });
    };
    connect();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      socket.current?.close();
      socket.current = null;
    };
  }, [page.workspace, page.course, page.lesson]);
  return socket;
}
