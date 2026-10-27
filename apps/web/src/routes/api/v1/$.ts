import { createFileRoute } from "@tanstack/react-router";

async function forwardToCoursesApi({ request }: { request: Request }) {
  const origin = process.env.DOJO_API_ORIGIN
    ?? (process.env.NODE_ENV !== "production" ? "https://dojo.foo" : null);
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

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer(),
  });

  // fetch decodes compressed bodies but retains the upstream encoding and length.
  const responseHeaders = new Headers(response.headers);
  if (responseHeaders.has("content-encoding")) {
    responseHeaders.delete("content-encoding");
    responseHeaders.delete("content-length");
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}

export const Route = createFileRoute("/api/v1/$")({
  server: {
    handlers: {
      GET: forwardToCoursesApi,
      POST: forwardToCoursesApi,
    },
  },
});
