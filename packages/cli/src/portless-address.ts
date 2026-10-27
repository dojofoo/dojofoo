import { join } from "node:path";
import { RouteStore, resolveUserHome } from "portless";

/** Pin the UI hostname while retaining the shared proxy's transport and other routes. */
export function pinPortlessAddress(
  managedUrl: string,
  hostname: string,
  stateDirectory = process.env.PORTLESS_STATE_DIR ?? join(resolveUserHome(), ".portless"),
): string | null {
  const url = new URL(managedUrl);
  const store = new RouteStore(stateDirectory);
  const routes = store.loadRoutes();
  const managed = routes.find(route => route.hostname === url.hostname);
  if (!managed) return null;
  // Static aliases use PID 0; remove that mapping before force replacement.
  if (routes.some(route => route.hostname === hostname && route.pid === 0)) store.removeRoute(hostname, 0);
  store.addRoute(hostname, managed.port, managed.pid, true);
  url.hostname = hostname;
  return url.origin;
}
