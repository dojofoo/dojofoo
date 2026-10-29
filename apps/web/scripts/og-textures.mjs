// Draws what drifts over a course card – the contour map, network, waves and opal shaders – as white lines on black,
// public/og-cards/<kind>.jpg, for the course social cards (Takumi screens them over the card's colors, as the card does).
// Run with Storybook up:  node scripts/og-textures.mjs [http://localhost:6006]
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const storybook = process.argv[2] ?? "http://localhost:6006";
const dir = fileURLToPath(new URL("../public/og-cards/", import.meta.url));
mkdirSync(dir, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 1 });
// Variants shows a card of every kind; each in turn is lifted out, grown and stripped to its lines
await page.goto(`${storybook}/iframe.html?id=components-molecules-color-card--variants&viewMode=story&globals=theme:dark`);
await page.waitForSelector("canvas.ui-card__lines");
for (const kind of ["topography", "network", "waves", "opal"]) {
  await page.evaluate((kind) => {
    document.querySelectorAll("[data-og-texture]").forEach((card) => card.removeAttribute("data-og-texture"));
    document.querySelector(kind === "topography" ? "canvas.ui-card__lines:not([data-kind])" : `canvas.ui-card__lines[data-kind="${kind}"]`).closest(".ui-card").setAttribute("data-og-texture", "");
  }, kind);
  await page.addStyleTag({ content: `
    [data-og-texture] { position: fixed !important; top: 0 !important; left: 0 !important; z-index: 9999 !important; width: 720px !important; height: 720px !important; aspect-ratio: auto !important; box-shadow: none !important; border-radius: 0 !important; }
    [data-og-texture] .ui-card__face { background: #000 !important; box-shadow: none !important; border-radius: 0 !important; }
    [data-og-texture] .ui-card__face > :not(.ui-card__lines) { visibility: hidden !important; }
    [data-og-texture] .ui-card__lines { mix-blend-mode: normal !important; opacity: 1 !important; }
  ` });
  await page.waitForTimeout(2500);
  await page.locator("[data-og-texture] .ui-card__lines").screenshot({ path: `${dir}${kind}.jpg`, type: "jpeg", quality: 82 });
  console.log(`wrote ${dir}${kind}.jpg`);
}
await browser.close();
