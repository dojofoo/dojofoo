// Draws the social cards' ground: the landing's footer backdrop (TopographyBackdrop – the contour shader, blurred and
// fading up, sharp at the bottom) at 1200×630, with the shade over it worked out here rather than by Takumi, which
// composites in 8 bits: the glass fade behind the words (public/og-ground.png), and for a course's card also the card's
// shadow (public/og-ground-card.png). Every shade is computed in full precision and dithered straight after, so its
// slow ramps grain instead of banding. Run with the site up:
//   node scripts/og-ground.mjs [https://dojo.td]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const site = process.argv[2] ?? "https://dojo.td";
const file = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
// Twice the size: each 2×2 block is averaged in full precision
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2, ignoreHTTPSErrors: true });
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
const shot = (await page.screenshot()).toString("base64");

// The course card's place and shadow, as components/og/dojo-og.tsx lays it out: 420px square, 96px from the right,
// centered; its edge 3px right and 5px down carries the shadow
const card = { left: 1200 - 96 - 420 + 3, top: (630 - 420) / 2 + 5, size: 420 };
const shadows = [
  { y: 56, blur: 90, spread: -16, alpha: 0.75 },
  { y: 22, blur: 36, spread: -8, alpha: 0.5 },
];

for (const [name, withCard] of [["og-ground.png", false], ["og-ground-card.png", true]]) {
  const png = await page.evaluate(async ({ shot, withCard, card, shadows }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${shot}`;
    await image.decode();
    const source = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height }).getContext("2d");
    source.drawImage(image, 0, 0);
    const big = source.getImageData(0, 0, image.width, image.height).data;
    const width = image.width / 2, height = image.height / 2;
    // The ground's own color: what the fade fades to
    const ground = (big[0] + big[4] + big[image.width * 4] + big[image.width * 4 + 4]) / 4;

    // erf (Abramowitz–Stegun 7.1.26): a box shadow is its rectangle blurred by a Gaussian of σ = blur / 2
    const erf = (x) => { const s = Math.sign(x), t = 1 / (1 + 0.3275911 * Math.abs(x)); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
    const cover = (v, from, to, sigma) => 0.5 * (erf((to - v) / (sigma * Math.SQRT2)) - erf((from - v) / (sigma * Math.SQRT2)));
    const shadowAt = (x, y) => shadows.reduce((left, { y: dy, blur, spread, alpha }) => {
      const sigma = blur / 2, x0 = card.left - spread, x1 = card.left + card.size + spread, y0 = card.top + dy - spread, y1 = card.top + card.size + dy + spread;
      return left * (1 - alpha * cover(x, x0, x1, sigma) * cover(y, y0, y1, sigma));
    }, 1);

    // The glass fade: linear-gradient(100deg) from the ground at 0.7 to clear (CSS: 0deg points up, turning clockwise)
    const angle = (100 * Math.PI) / 180, dx = Math.sin(angle), dy = -Math.cos(angle);
    const length = Math.abs(width * dx) + Math.abs(height * dy);
    const stops = [[0, 0.702], [0.35, 0.502], [0.65, 0.102], [1, 0]];
    const fadeAt = (x, y) => {
      const t = Math.min(1, Math.max(0, ((x - width / 2) * dx + (y - height / 2) * dy) / length + 0.5));
      const i = stops.findIndex(([at]) => at >= t);
      if (i <= 0) return stops[0][1];
      const [a, va] = stops[i - 1], [b, vb] = stops[i];
      return va + ((t - a) / (b - a)) * (vb - va);
    };

    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const fade = fadeAt(x + 0.5, y + 0.5);
      const shade = withCard ? shadowAt(x + 0.5, y + 0.5) : 1;
      // Dithered straight after the shade: triangular noise of a level either way, then rounded
      const noise = Math.random() + Math.random() - 1;
      const at = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const row = (2 * y * image.width + 2 * x) * 4 + c, below = row + image.width * 4;
        const base = (big[row] + big[row + 4] + big[below] + big[below + 4]) / 4;
        pixels.data[at + c] = Math.round((base * (1 - fade) + ground * fade) * shade + noise);
      }
      pixels.data[at + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, { shot, withCard, card, shadows });
  writeFileSync(file(name), Buffer.from(png, "base64"));
  console.log(`wrote ${file(name)} on ${color}`);
}
await browser.close();
