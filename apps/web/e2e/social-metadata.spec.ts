import { expect, test } from "@playwright/test";

const imageUrl = "https://dojo.foo/og.webp";

async function expectSocialImage(page: import("@playwright/test").Page, url = imageUrl, alt: string | RegExp = /Dojo\.foo/) {
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", url);
  await expect(page.locator('meta[property="og:image:type"]')).toHaveAttribute("content", "image/webp");
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute("content", "1200");
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute("content", "630");
  await expect(page.locator('meta[property="og:image:alt"]')).toHaveAttribute("content", alt);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", url);
  await expect(page.locator('meta[name="twitter:image:alt"]')).toHaveAttribute("content", alt);
}

test("uses the Dojo.foo social card on the main website", async ({ page }) => {
  await page.goto("/");
  await expectSocialImage(page);
  await expect(page).toHaveTitle("AI mentors, teachers and personas you can install");
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute("content", "Dojo.foo");
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", "https://dojo.foo");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://dojo.foo/");
  // The site's name for search results comes from WebSite on the home page, not from every title
  const graph = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent() ?? "{}")["@graph"];
  expect(graph.map((node: { "@type": string }) => node["@type"])).toEqual(["WebSite", "Organization", "SoftwareApplication"]);
  expect(graph[0]).toMatchObject({ name: "Dojo.foo", url: "https://dojo.foo/" });
});

test("uses the Dojo.foo social card with page metadata in the docs", async ({ page }) => {
  await page.goto("/docs");
  // Its own card, at its path
  await expectSocialImage(page, "https://dojo.foo/docs/og.webp", "Usage");
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", "Usage");
  await expect(page.locator('meta[name="twitter:title"]')).toHaveAttribute("content", "Usage");
  await expect(page).toHaveTitle("Usage");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://dojo.foo/docs");
  const graph = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent() ?? "{}")["@graph"];
  expect(graph[0]).toMatchObject({ "@type": "TechArticle", headline: "Usage", url: "https://dojo.foo/docs" });
});

test("names pages without repeating the site's name", async ({ page }) => {
  await page.goto("/dojos");
  await expect(page).toHaveTitle("Find your dojo – Free coding courses with an AI sensei");
  await page.goto("/docs/quickstart");
  await expect(page).toHaveTitle("Quickstart");
  const graph = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent() ?? "{}")["@graph"];
  expect(graph[1]["itemListElement"].map((item: { name: string }) => item.name)).toEqual(["Usage", "Quickstart"]);
});

test("describes the site for language models", async ({ request }) => {
  const index = await (await request.get("/llms.txt")).text();
  expect(index.startsWith("# Dojo.foo\n\n> ")).toBe(true);
  expect(index).toContain("npx dojofoo");
  expect(index).toContain("](https://dojo.foo/docs/quickstart)");
  const full = await request.get("/llms-full.txt");
  expect(full.headers()["content-type"]).toContain("text/plain");
  expect((await full.text()).startsWith("# Dojo.foo docs")).toBe(true);
});

test("lists the pages to index and keeps the auth pages out", async ({ request }) => {
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/", "/dojos", "/docs", "/docs/quickstart"]) expect(sitemap).toContain(`<loc>https://dojo.foo${path}</loc>`);
  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /sign-in");
  expect(robots).toContain("Sitemap: https://dojo.foo/sitemap.xml");
});

test("serves the social card as WebP", async ({ request }) => {
  const response = await request.get("/og.webp");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/webp");
  expect(response.headers()["cache-control"]).toContain("s-maxage=3600");
  const bytes = await response.body();
  expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
  expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
});

test("draws each page's own card at its address + /og.webp", async ({ request }) => {
  for (const path of ["/docs/quickstart/og.webp", "/authoring/og.webp", "/dojos/og.webp", "/courses/dojofoo/effect-ts/og.webp"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/webp");
  }
  for (const path of ["/og/docs/quickstart/og.webp", "/docs/no-such-page/og.webp", "/courses/nobody/nothing/og.webp"]) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
});

test("keeps the old OG URL pointing at the dynamic renderer", async ({ request }) => {
  const response = await request.get("/og/landing.webp", { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers()["location"]).toBe("/og.webp");
});
