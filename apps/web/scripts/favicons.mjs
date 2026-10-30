// Draws the site's icons from public/favicon.svg, for what doesn't take an SVG: favicon.ico (16, 32 and 48px – what
// browsers and fetchers ask for by default), a 96px PNG (Google Search wants a multiple of 48px), the 180px Apple touch
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
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<body style="margin:0;background:${ground}"><img style="display:block;margin:${inset}px;width:${size - 2 * inset}px;height:${size - 2 * inset}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"></body>`);
  await page.locator("img").evaluate((image) => image.decode());
  return page.screenshot({ omitBackground: ground === "transparent" });
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
for (const size of [16, 32, 48]) small.push({ size, png: await draw(size) });
writeFileSync(file("favicon.ico"), ico(small));
writeFileSync(file("favicon-96x96.png"), await draw(96));
writeFileSync(file("apple-touch-icon.png"), await draw(180, { ground: GROUND, inset: 18 }));
writeFileSync(file("web-app-manifest-192x192.png"), await draw(192));
writeFileSync(file("web-app-manifest-512x512.png"), await draw(512));
await browser.close();
console.log("wrote favicon.ico, favicon-96x96.png, apple-touch-icon.png and the manifest's icons");
