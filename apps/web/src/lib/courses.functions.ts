import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { getMarketplaceCourses } from "./courses";

const marketplaceCacheControl = "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

export const loadMarketplaceCourses = createServerFn({ method: "GET" }).handler(async () => {
  const origin = process.env.DOJO_API_ORIGIN
    ?? (process.env.NODE_ENV !== "production" ? "http://127.0.0.1:4311" : null);
  if (!origin) throw new Error("Courses API binding is unavailable.");

  setResponseHeader("Cache-Control", marketplaceCacheControl);
  return getMarketplaceCourses(origin);
});
