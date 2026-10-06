import { useEffect, useRef } from "react";

/** Refresh after the server watcher is ready, including every reconnect. */
export function useAuthoringWatch(url: string, refresh: () => Promise<void>, onError: (error: string) => void) {
  const callbacks = useRef({ refresh, onError });
  callbacks.current = { refresh, onError };
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    let refreshing = false;
    let pending = false;
    async function invalidate() {
      pending = true;
      if (refreshing) return;
      refreshing = true;
      try {
        while (pending && !disposed) {
          pending = false;
          await callbacks.current.refresh();
        }
      } catch (cause) {
        if (!disposed) callbacks.current.onError(cause instanceof Error ? cause.message : String(cause));
      } finally { refreshing = false; }
    }
    function connect() {
      const endpoint = new URL(url, window.location.href);
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(endpoint);
      socket.onmessage = event => {
        const notice = JSON.parse(event.data);
        if (notice.method === "workspace.changed") void invalidate();
        if (notice.method === "workspace.watch.error") callbacks.current.onError(notice.params.error);
      };
      socket.onclose = () => {
        if (!disposed) retry = setTimeout(connect, 1000);
      };
    }
    connect();
    return () => { disposed = true; clearTimeout(retry); socket.close(); };
  }, [url]);
}
