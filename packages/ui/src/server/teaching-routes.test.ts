import { expect, it } from "vitest";
import { teachingRoutes } from "./teaching-routes";

const request = (body: unknown, origin?: string) => teachingRoutes.request("http://localhost/preview", {
  method: "POST", headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) }, body: JSON.stringify(body),
});

it("serves compiled authored content", async () => {
  const response = await request({ source: "# Lesson" }, "http://localhost");
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ blocks: [{ type: "html", html: "<h1>Lesson</h1>\n" }] });
});

it("renders same-origin material through the local HTTPS reverse proxy", async () => {
  const response = await teachingRoutes.request("http://127.0.0.1:4567/preview", {
    method: "POST", headers: {
      "content-type": "application/json", Origin: "https://dojo.localhost",
      "x-forwarded-host": "dojo.localhost", "x-forwarded-proto": "https",
    }, body: JSON.stringify({ source: "# Proxied lesson" }),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ blocks: [{ type: "html", html: "<h1>Proxied lesson</h1>\n" }] });
});

it.each([
  { Origin: "https://untrusted.example", "x-forwarded-host": "dojo.localhost", "x-forwarded-proto": "https" },
  { Origin: "https://dojo.localhost", "x-forwarded-host": "other.localhost", "x-forwarded-proto": "https" },
  { Origin: "https://dojo.localhost", "x-forwarded-host": "dojo.localhost/private", "x-forwarded-proto": "https" },
])("retains origin rejection with forwarded headers: $Origin", async headers => {
  const response = await teachingRoutes.request("http://127.0.0.1:4567/preview", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ source: "# Private material" }),
  });
  expect(response.status).toBe(403);
});

it("rejects invalid requests, cross-origin access, and oversized documents", async () => {
  expect((await request({})).status).toBe(400);
  expect((await request({ source: "test", basePath: {} })).status).toBe(400);
  expect((await request({ source: "test" }, "https://untrusted.example")).status).toBe(403);
  expect((await request({ source: "x".repeat(256 * 1024) })).status).toBe(413);
});

it("returns actionable errors for incomplete authored examples", async () => {
  const response = await request({ source: "````md magic-move\nno frames\n````" });
  expect(response.status).toBe(422);
  expect(await response.json()).toEqual({ error: "A magic-move block needs at least one fenced code example." });
});
