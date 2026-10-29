// Draws the OG images' ground: the landing's footer backdrop (TopographyBackdrop – the contour shader, blurred and
// fading up, sharp at the bottom) at 1200×630, as public/og-ground.png. Run with the site up:
//   node scripts/og-ground.mjs [https://dojo.td]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const site = process.argv[2] ?? "https://dojo.td";
const out = fileURLToPath(new URL("../public/og-ground.png", import.meta.url));
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
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
const shot = await page.screenshot();
// Dithered: the browser draws the blur and the fades in 8 bits, so their slow ramps step into bands. Drawn at twice the
// size, each 2×2 block is averaged in full precision, then rounded with ±1.5 levels of triangular noise – the steps
// break up into grain (Takumi then dithers what it draws over it)
const dithered = await page.evaluate(async (png) => {
  const image = new Image();
  image.src = `data:image/png;base64,${png}`;
  await image.decode();
  const source = Object.assign(document.createElement("canvas"), { width: image.width, height: image.height }).getContext("2d");
  source.drawImage(image, 0, 0);
  const big = source.getImageData(0, 0, image.width, image.height).data;
  const width = image.width / 2, height = image.height / 2;
  const canvas = Object.assign(document.createElement("canvas"), { width, height });
  const context = canvas.getContext("2d");
  const pixels = context.createImageData(width, height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const noise = (Math.random() + Math.random() - 1) * 1.5;
    const at = (y * width + x) * 4;
    for (let c = 0; c < 3; c++) {
      const row = (2 * y * image.width + 2 * x) * 4 + c, below = row + image.width * 4;
      pixels.data[at + c] = Math.round((big[row] + big[row + 4] + big[below] + big[below + 4]) / 4 + noise);
    }
    pixels.data[at + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return canvas.toDataURL("image/png").split(",")[1];
}, shot.toString("base64"));
writeFileSync(out, Buffer.from(dithered, "base64"));
await browser.close();
console.log(`wrote ${out} on ${color}`);
