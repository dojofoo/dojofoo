import { createFileRoute } from "@tanstack/react-router";

async function forwardToCoursesApi({ request }: { request: Request }) {
  const origin = process.env.DOJO_API_ORIGIN
    ?? (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:4311" : null);
  if (!origin) {
    return Response.json(
      { error: "service_unavailable", message: "Courses API binding is unavailable." },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const headers = new Headers(request.headers);
  headers.delete("host");

  return fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer(),
  });
}

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      GET: forwardToCoursesApi,
      POST: forwardToCoursesApi,
    },
  },
});
