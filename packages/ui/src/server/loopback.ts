/** The UI server's own origin on loopback, `http://<host>:<port>`: never DOJO_UI_BASE_URL, whose portless TLS proxy a local fetch may
 *  not trust (decision 8). A wildcard or empty HOST is loopback. Persona hosts reach the host port here, and an evaluation trial
 *  the learner's routes. */
export function loopbackOrigin(environment: NodeJS.ProcessEnv = process.env): string {
  const host = environment.HOST?.trim();
  const loopback = !host || ["0.0.0.0", "::", "[::]"].includes(host) ? "127.0.0.1" : host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
  return `http://${loopback}:${environment.PORT || "4567"}`;
}
