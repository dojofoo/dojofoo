// Draws the social cards' ground, for Takumi to lay out per page:
//
//   public/og-map-topography.png, og-map-waves.png  the footer's map (TopographyBackdrop: the shader's lines, a blurred
//                                                    copy fading in above, a sharp one below), 2400 wide – a page's card
//                                                    shows the 1200 its URL picks (lib/og-assets mapWindow)
//   public/og-fade.png                               the glass fade behind the words: the ground's color, its alpha
//   public/og-shadow.png                             a course card's shadow: black, its alpha
//
// Takumi composites in 8 bits, so every slow ramp is worked out here in full precision and dithered straight after:
// the maps drawn at twice the size and each 2×2 block averaged before rounding with noise, the fade's and the shadow's
// alpha rounded with noise. Run with the site and Storybook up:
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

// Each laid out as the footer lays out its map (topography-backdrop.tsx), on the page's color – then averaged and dithered
for (const [kind, shot] of Object.entries(lines)) {
  await page.setContent(`<!doctype html><style>
    html, body { margin: 0; background: ${color}; overflow: hidden; }
    .map { position: fixed; inset: 0; width: ${STRIP}px; height: ${H}px; }
    .layer { position: absolute; inset: 0; background: url(data:image/png;base64,${shot}) 0 0 / ${STRIP}px ${H}px; mix-blend-mode: screen; opacity: 0.5; }
    .soft { filter: blur(5px); mask-image: linear-gradient(to bottom, transparent 0%, #000 45%, transparent 85%); }
    .sharp { mask-image: linear-gradient(to bottom, transparent 35%, #000 100%); }
  </style><div class="map"><div class="layer soft"></div><div class="layer sharp"></div></div>`);
  await page.waitForTimeout(500);
  const laid = (await page.screenshot()).toString("base64");
  const png = await page.evaluate(async (laid) => {
    const image = new Image();
    image.src = `data:image/png;base64,${laid}`;
    await image.decode();
    const source = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height }).getContext("2d");
    source.drawImage(image, 0, 0);
    const big = source.getImageData(0, 0, image.width, image.height).data;
    const width = image.width / 2, height = image.height / 2;
    const canvas = Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d");
    const pixels = context.createImageData(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      // Triangular noise of a level either way, then rounded
      const noise = Math.random() + Math.random() - 1;
      const at = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const row = (2 * y * image.width + 2 * x) * 4 + c, below = row + image.width * 4;
        pixels.data[at + c] = Math.round((big[row] + big[row + 4] + big[below] + big[below + 4]) / 4 + noise);
      }
      pixels.data[at + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, laid);
  writeFileSync(file(`og-map-${kind}.png`), Buffer.from(png, "base64"));
  console.log(`wrote og-map-${kind}.png`);
}
// The ground's color as a level: what the fade fades to
const ground = await page.evaluate((color) => {
  const context = Object.assign(document.createElement("canvas"), { width: 1, height: 1 }).getContext("2d");
  context.fillStyle = color;
  context.fillRect(0, 0, 1, 1);
  return context.getImageData(0, 0, 1, 1).data[0];
}, color);
await browser.close();

// The overlays, their alpha worked out here and dithered: written as PNGs directly (a canvas would premultiply them)
const dithered = (alpha) => Math.max(0, Math.min(255, Math.round(alpha * 255 + Math.random() + Math.random() - 1)));

// The glass fade: linear-gradient(100deg) from the ground at 0.7 to clear (CSS: 0deg points up, turning clockwise)
const angle = (100 * Math.PI) / 180, dx = Math.sin(angle), dy = -Math.cos(angle);
const length = Math.abs(W * dx) + Math.abs(H * dy);
const stops = [[0, 0.702], [0.35, 0.502], [0.65, 0.102], [1, 0]];
const fadeAt = (x, y) => {
  const t = Math.min(1, Math.max(0, ((x - W / 2) * dx + (y - H / 2) * dy) / length + 0.5));
  const i = stops.findIndex(([at]) => at >= t);
  if (i <= 0) return stops[0][1];
  const [a, va] = stops[i - 1], [b, vb] = stops[i];
  return va + ((t - a) / (b - a)) * (vb - va);
};
writeFileSync(file("og-fade.png"), png(W, H, (x, y) => [ground, ground, ground, dithered(fadeAt(x + 0.5, y + 0.5))]));
console.log(`wrote og-fade.png on level ${ground}`);

// The course card's shadow, as components/og/dojo-og.tsx lays the card out: 420px square, 96px from the right,
// centered; its edge, 3px right and 5px down, casts it – rectangles blurred by Gaussians of σ = blur / 2
const card = { left: W - 96 - 420 + 3, top: (H - 420) / 2 + 5, size: 420 };
const shadows = [{ y: 56, blur: 90, spread: -16, alpha: 0.75 }, { y: 22, blur: 36, spread: -8, alpha: 0.5 }];
const erf = (x) => { const s = Math.sign(x), t = 1 / (1 + 0.3275911 * Math.abs(x)); return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)); };
const cover = (v, from, to, sigma) => 0.5 * (erf((to - v) / (sigma * Math.SQRT2)) - erf((from - v) / (sigma * Math.SQRT2)));
const shadowAt = (x, y) => 1 - shadows.reduce((left, { y: offset, blur, spread, alpha }) => {
  const sigma = blur / 2, x0 = card.left - spread, x1 = card.left + card.size + spread, y0 = card.top + offset - spread, y1 = card.top + card.size + offset + spread;
  return left * (1 - alpha * cover(x, x0, x1, sigma) * cover(y, y0, y1, sigma));
}, 1);
writeFileSync(file("og-shadow.png"), png(W, H, (x, y) => [0, 0, 0, dithered(shadowAt(x + 0.5, y + 0.5))]));
console.log("wrote og-shadow.png");

/** A straight-alpha RGBA PNG from a pixel function */
function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) raw.set(pixel(x, y), y * (width * 4 + 1) + 1 + x * 4);
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
    return Buffer.concat([size, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) { crc ^= byte; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return ~crc >>> 0;
}
