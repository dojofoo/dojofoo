// Draws the site's icons from public/favicon.svg, for what doesn't take an SVG: favicon.ico (16–256px),
// 16, 32 and 96px PNGs for browsers and search, the 180px Apple touch
// icon (on the page's ground: iOS fills a transparent one with black) and the web manifest's 192 and 512px.
//   node scripts/favicons.mjs
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const svg = readFileSync(file("favicon.svg"), "utf8");
const GROUND = "#171717";

const browser = await chromium.launch();
const page = await browser.newPage();
async function draw(size, { ground = "transparent", inset = 0 } = {}) {
  if (size > 128) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0;background:${ground}"><img style="display:block;margin:${inset}px;width:${size - 2 * inset}px;height:${size - 2 * inset}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body>`);
    await page.locator("img").evaluate((image) => image.decode());
    return page.screenshot({ omitBackground: ground === "transparent" });
  }
  const png = await page.evaluate(async ({ svg, size, ground, inset }) => {
    // Rasterize the vector at 4×, then downsample once for smoother small curves.
    const scale = 4;
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const high = document.createElement("canvas");
    high.width = high.height = size * scale;
    const context = high.getContext("2d");
    context.fillStyle = ground;
    context.fillRect(0, 0, high.width, high.height);
    context.drawImage(image, inset * scale, inset * scale, (size - 2 * inset) * scale, (size - 2 * inset) * scale);
    const output = document.createElement("canvas");
    output.width = output.height = size;
    const target = output.getContext("2d");
    target.imageSmoothingEnabled = true;
    target.imageSmoothingQuality = "high";
    target.drawImage(high, 0, 0, size, size);
    return output.toDataURL("image/png").split(",")[1];
  }, { svg, size, ground, inset });
  return Buffer.from(png, "base64");
}

// An ICO of PNG images: its header, a directory entry per image, then the images
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

// One page draws them, so one at a time
const small = [];
for (const size of [16, 32, 48, 64, 96, 128, 256]) small.push({ size, png: await draw(size) });
writeFileSync(file("favicon.ico"), ico(small));
for (const { size, png } of small.filter(({ size }) => size === 16 || size === 32)) {
  writeFileSync(file(`favicon-${size}x${size}.png`), png);
}
writeFileSync(file("favicon-96x96.png"), await draw(96));
writeFileSync(file("apple-touch-icon.png"), await draw(180, { ground: GROUND, inset: 18 }));
writeFileSync(file("web-app-manifest-192x192.png"), await draw(192));
writeFileSync(file("web-app-manifest-512x512.png"), await draw(512));
await browser.close();
console.log("wrote favicon.ico, 16/32/96px PNG favicons, apple-touch-icon.png and 192/512px manifest icons from favicon.svg");
