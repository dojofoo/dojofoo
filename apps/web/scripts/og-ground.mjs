// Draws the OG images' ground: the landing's footer backdrop (TopographyBackdrop – the contour shader, blurred and
// fading up, sharp at the bottom) at 1200×630, as public/og-ground.png. Run with the site up:
//   node scripts/og-ground.mjs [https://dojo.td]
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";

const site = process.argv[2] ?? "https://dojo.td";
const out = fileURLToPath(new URL("../public/og-ground.png", import.meta.url));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true });
await page.goto(site, { waitUntil: "networkidle" });
const color = await page.evaluate(() => getComputedStyle(document.querySelector(".ui-web")).backgroundColor);
// Only the backdrop, filling the frame, on the page's color
await page.addStyleTag({ content: `
  html, body { background: ${color} !important; overflow: hidden !important; }
  .ui-web > :not(.ui-topo) { visibility: hidden !important; }
  .ui-topo { position: fixed !important; inset: 0 !important; height: 630px !important; }
` });
await page.evaluate(() => scrollTo(0, 0));
await page.waitForTimeout(3000);
await page.screenshot({ path: out });
await browser.close();
console.log(`wrote ${out} on ${color}`);
