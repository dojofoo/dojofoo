/** Portless terminates TLS and forwards to the loopback-only local server. */
export function requestOrigin(request: Request): string {
  const direct = new URL(request.url);
  const loopback = direct.hostname === "localhost" || direct.hostname === "127.0.0.1" || direct.hostname === "[::1]" || direct.hostname.endsWith(".localhost");
  if (!loopback) return direct.origin;
  const host = request.headers.get("x-forwarded-host");
  const protocol = request.headers.get("x-forwarded-proto");
  if (!host || (protocol !== "http" && protocol !== "https")) return direct.origin;
  try {
    const forwarded = new URL(`${protocol}://${host}`);
    if (forwarded.username || forwarded.password || forwarded.pathname !== "/" || forwarded.search || forwarded.hash || host.includes(",")) return direct.origin;
    return forwarded.origin;
  } catch { return direct.origin; }
}
