import { defineWebSocketHandler } from "nitro";
import { authoringWatchers } from "../../../../src/server/authoring-watch";
import { resolveRequestWorkspace } from "../../../../src/server/control/workspace";

const subscriptions = new Map<string, () => Promise<void>>();
export default defineWebSocketHandler({
  upgrade(request) {
    const origin = request.headers.get("origin");
    if (!origin || new URL(origin).host !== new URL(request.url).host) throw new Response("Forbidden", { status: 403 });
    resolveRequestWorkspace(request);
  },
  open(peer) {
    try {
      subscriptions.set(peer.id, authoringWatchers.subscribe(resolveRequestWorkspace(peer.request), notice => {
        peer.send(JSON.stringify({ jsonrpc: "2.0", method: notice.method, params: "error" in notice ? { error: notice.error } : {} }));
      }));
    } catch (cause) {
      peer.send(JSON.stringify({ jsonrpc: "2.0", method: "workspace.watch.error", params: { error: String(cause) } }));
      peer.close();
    }
  },
  async close(peer) {
    const unsubscribe = subscriptions.get(peer.id);
    subscriptions.delete(peer.id);
    await unsubscribe?.();
  },
});
