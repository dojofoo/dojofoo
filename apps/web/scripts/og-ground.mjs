// Draws the social cards' maps: the footer's (TopographyBackdrop: the shader's lines, a blurred copy fading in above, a
// sharp one below) as public/og-map-topography.bin, and the docs' waves laid out the same as og-map-waves.bin – 2400
// wide, gray, each level kept to 1/64 (16-bit, worked out in full precision from lines drawn at twice the size), deflated. The server
// (lib/og-ground) cuts a page's 1200 from it, shades it – the glass fade, a course card's shadow – in full precision and
// dithers it straight after, since Takumi composites in 8 bits. Run with the site and Storybook up:
//   node scripts/og-ground.mjs [https://dojo.td] [http://localhost:6006]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const site = process.argv[2] ?? "https://dojo.td";
const storybook = process.argv[3] ?? "http://localhost:6006";
const file = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const W = 1200, H = 630, STRIP = 2400;
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: STRIP, height: H }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });

// The lines alone, white on black, a strip wide: the footer map's own canvas, and a card's waves
await page.goto(site, { waitUntil: "networkidle" });
const color = await page.evaluate(() => getComputedStyle(document.querySelector(".ui-web")).backgroundColor);
await page.addStyleTag({ content: `
  html, body { background: #000 !important; overflow: hidden !important; }
  .ui-web > :not(.ui-topo) { visibility: hidden !important; }
  .ui-topo { position: fixed !important; inset: 0 !important; height: ${H}px !important; }
  .ui-topo__layer--soft { display: none !important; }
  .ui-topo__layer--sharp { mask-image: none !important; -webkit-mask-image: none !important; filter: none !important; mix-blend-mode: normal !important; opacity: 1 !important; }
` });
await page.evaluate(() => scrollTo(0, 0));
await page.waitForTimeout(3000);
const lines = { topography: (await page.screenshot()).toString("base64") };

await page.goto(`${storybook}/iframe.html?id=components-molecules-color-card--variants&viewMode=story&globals=theme:dark`);
await page.waitForSelector('canvas.ui-card__lines[data-kind="waves"]');
await page.evaluate(() => document.querySelector('canvas.ui-card__lines[data-kind="waves"]').closest(".ui-card").setAttribute("data-og", ""));
await page.addStyleTag({ content: `
  [data-og] { position: fixed !important; top: 0 !important; left: 0 !important; z-index: 9999 !important; width: ${STRIP}px !important; height: ${H}px !important; aspect-ratio: auto !important; box-shadow: none !important; border-radius: 0 !important; }
  [data-og] .ui-card__face { background: #000 !important; box-shadow: none !important; border-radius: 0 !important; }
  [data-og] .ui-card__face > :not(.ui-card__lines) { visibility: hidden !important; }
  [data-og] .ui-card__lines { mix-blend-mode: normal !important; opacity: 1 !important; }
` });
await page.waitForTimeout(3000);
lines.waves = (await page.locator("[data-og] .ui-card__lines").screenshot()).toString("base64");

// The ground's color as a level: what the map lies on and the fade fades to (lib/og-ground OG_GROUND)
const ground = await page.evaluate((color) => {
  const context = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d");
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  return context.getImageData(0, 0, 1, 1).data[0];
}, color);

// Each laid out as the footer lays out its map (topography-backdrop.tsx) – on the ground, a blurred copy of the lines
// fading in from the top to 45% and out by 85%, the sharp lines fading in from 35% to the foot, each screened at half
// strength – worked out here in full precision (a browser would mask and blend in 8 bits, banding the fades), then each
// 2×2 block averaged and kept to 1/64 of a level
for (const [kind, shot] of Object.entries(lines)) {
  const levels = await page.evaluate(async ({ shot, ground }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${shot}`;
    await image.decode();
    const read = (filter) => {
      const context = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height }).getContext("2d");
      context.filter = filter;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    // blur(5px) at twice the size
    const sharp = read("none"), soft = read("blur(10px)");
    const width = image.width / 2, height = image.height / 2;
    const softMask = (t) => (t < 0.45 ? t / 0.45 : t < 0.85 ? 1 - (t - 0.45) / 0.4 : 0);
    const sharpMask = (t) => (t < 0.35 ? 0 : (t - 0.35) / 0.65);
    const out = new Uint16Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let sum = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const px = 2 * x + dx, py = 2 * y + dy, at = (py * image.width + px) * 4;
        const t = (py + 0.5) / image.height;
        // Screened at alpha a: B + a·L·(1 − B)
        let level = ground / 255;
        level += 0.5 * softMask(t) * (soft[at] / 255) * (1 - level);
        level += 0.5 * sharpMask(t) * (sharp[at] / 255) * (1 - level);
        sum += level;
      }
      out[y * width + x] = Math.round((sum / 4) * 255 * 64);
    }
    let binary = "";
    const bytes = new Uint8Array(out.buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }, { shot, ground });
  writeFileSync(file(`og-map-${kind}.bin`), deflateSync(Buffer.from(levels, "base64"), { level: 9 }));
  console.log(`wrote og-map-${kind}.bin`);
}
await browser.close();
console.log(`the ground is level ${ground}`);
