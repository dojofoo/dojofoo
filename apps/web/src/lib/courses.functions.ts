import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { SITE_URL } from "./site";
import { getMarketplaceCourses } from "./courses";

const marketplaceCacheControl = "public, max-age=0, s-maxage=300, stale-while-revalidate=3600, stale-if-error=86400";

export const loadMarketplaceCourses = createServerFn({ method: "GET" }).handler(async () => {
  const origin = process.env.DOJO_API_ORIGIN ?? SITE_URL;

  setResponseHeader("Cache-Control", marketplaceCacheControl);
  return getMarketplaceCourses(origin);
});
