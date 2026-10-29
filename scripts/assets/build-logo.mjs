#!/usr/bin/env node

// Builds the dojofoo logo from the wordmark (DOJO over FOO, exported from Affinity): FOO's line
// becomes a slanted ribbon. Stripes thicken while their gaps shrink, the last gap as wide as the
// first stripe, until a solid block carries FOO. FOO's right edge lines up with DOJO's last O, the
// ribbon overhangs DOJO equally on both sides, and its edges are cut: flat along the bottom at both
// ends (the left cut ending in a stripe gap) and shorter at the top right. The stripes fade from
// orange to the brand colour, reached at the block. DOJO sits on top, its J and D dipping into
// the ribbon.
//
// The site build is inlined by the BrandLogo components, which force every path to currentColor;
// FOO is cut out of the block in light mode and drawn in the logo colour in dark mode (`.dark` on an
// ancestor, the Tailwind dark variant). The light and dark builds are standalone files for places
// without that CSS, such as the README. The mono build is one colour (white, recoloured like the
// wordmark) with FOO always cut out, for single-colour uses such as certificates.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";

const WORDMARK = "assets/brand/dojofoo-wordmark.svg";
const SITE = [
  "assets/brand/dojofoo.svg",
  "packages/ui/public/brand/dojofoo.svg",
  "apps/web/public/dojofoo.svg",
  "packages/uix/src/assets/brand/dojofoo.svg",
];
const LIGHT = "assets/brand/dojofoo-light.svg";
const DARK = "assets/brand/dojofoo-dark.svg";
const MONO = ["assets/brand/dojofoo-mono.svg", "packages/uix/src/assets/brand/dojofoo-mono.svg"];
// the theme colours (packages/uix/src/styles/themes/dojofoo.css) as sRGB, for the standalone builds
const ORANGE = "#ff8a00";
const BRAND = { light: "#d7024b", dark: "#fe0059" };
const INK = { light: "#404040", dark: "white" };

const wordmark = readFileSync(WORDMARK, "utf8");
const FOO_GROUP = '<g transform="matrix(1.55631';
const OUTER = '<g transform="matrix(1,0,0,1,-1135.637806,-1054)">';
const [F, , O1, O2] = [...wordmark.slice(wordmark.indexOf(FOO_GROUP)).matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
const prologue = wordmark.slice(0, wordmark.indexOf("<svg"));
let head = wordmark.slice(wordmark.indexOf("<svg"), wordmark.indexOf(FOO_GROUP));
head = head.replace(' xmlns:affinity="https://www.affinity.studio/"', "");

const nums = (d) => [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
const xs = (d) => nums(d).filter((_, i) => i % 2 === 0);
const ys = (d) => nums(d).filter((_, i) => i % 2 === 1);
const f1 = (v) => v.toFixed(1);

// FOO's group coords <-> viewBox coords (its matrix plus the outer translate)
const GS = 1.55631;
const GX = 11.549972 - 1135.637806;
const GY = -1604.66068 - 1054;
const toVb = (x, y) => [GS * x + GX, GS * y + GY];
const fromVbX = (x) => (x - GX) / GS;

const GT = 2289.482; // the wordmark's FOO line (group coords)
const GB = 2486.848;
const scale = 1.1; // the ribbon's height (and FOO in it) against the FOO line
const T = GT - 18; // top edge, just under DOJO
let H = (GB - T) * scale;
let B = T + H;
const s = (1511.897 - 1480.344) / (2478.107 - 2299.161); // FOO's italic slant (dx per dy)
const k = 0.76 * scale; // FOO's scale
const pad = 36 * scale; // block padding left of FOO, horizontally at mid-height
const reach = 102.5; // how far the block runs past FOO at scale 1.25; the ribbon's ends stay put
const n = 9; // stripes
const cut = 22 * scale; // height of both bottom cuts
const cutLn = 6; // stripes the left bottom cut spans
const cutRx = 1700; // right bottom cut start (glyph x: under the first O)
const cutT = 16 * scale; // right top cut height
const cutTx = 2000; // right top cut start (glyph x: over the second O)

const glyphYs = [F, O1, O2].flatMap(ys);
const top = Math.min(...glyphYs);
const bottom = Math.max(...glyphYs);
const fx0 = 1478.0;
const fx1 = Math.max(...xs(O2)); // FOO's bbox x (group coords)
const oy = (top + bottom) / 2;
const gh = (bottom - top) * k;
const tongue = reach + (s * ((GB - T) * 1.25 - (bottom - top) * 0.76 * 1.25 - (H - gh))) / 2;
const tw = (fx1 - fx0) * k;
const cy = (T + B) / 2;
const lastO = 1692 + 1668 - 1135.637806; // DOJO's last O: path x max in its group, plus translates
const right = fromVbX(lastO);
const tcx = right - tw / 2; // FOO's right edge on DOJO's last O
const ox = (fx0 + fx1) / 2;
const gx = (x) => tcx + (x - ox) * k; // glyph x -> ribbon x
let bl = gx(fx0) + (s * gh) / 2 - pad - (s * H) / 2; // block bottom-left: pad left of F at mid-height
let XR = right - (s * gh) / 2 + tongue - (s * H) / 2; // block bottom-right: tongue past FOO at mid-height
// the ribbon overhangs DOJO's left edge by as much as it overhangs the right one
const dPath = wordmark.match(/matrix\(1,0,0,1,597,-309\)">\s*<path d="([^"]+)"/)[1];
const dojoLeft = Math.min(...xs(dPath)) + 597 - 1135.637806;
const overhang = toVb(XR + s * H, T)[0] - lastO;
let X0 = fromVbX(dojoLeft - overhang); // ribbon bottom-left
// the bottom moves until the gap under the Os (above the bottom cut) equals the gap over the last O
// (under the top cut); the tops stay put, so each bottom x moves along the slant
const topGap = cy + (top - oy) * k - T;
const oBottom = cy + (Math.max(...ys(O1), ...ys(O2)) - oy) * k;
const extra = topGap - cutT - (B - cut - oBottom);
B += extra;
H += extra;
X0 -= s * extra;
bl -= s * extra;
XR -= s * extra;

// slanted parallelogram from bottom x, width w, bottom raised by c
function para(xb, w, c = 0) {
  const x = xb + s * c;
  const y = B - c;
  const d = s * (y - T);
  return `M${f1(x)},${f1(y)}L${f1(x + w)},${f1(y)}L${f1(x + w + d)},${f1(T)}L${f1(x + d)},${f1(T)}Z`;
}

const L = bl - X0;
const LRef = 844.2732543432863; // the stripe run at scale 1.25, where these widths were set
const a = (32 * L) / LRef; // first stripe
const g0 = (56 * L) / LRef; // first gap
const b = (2 * (L - (n * (g0 + a)) / 2)) / n - a; // last stripe: gaps fall linearly from g0 to a
const stripes = [];
let x = X0;
for (let i = 0; i < n; i += 1) {
  const w = a + ((b - a) * i) / (n - 1);
  stripes.push(para(x, w, i < cutLn ? cut : 0));
  x += w + g0 + ((a - g0) * i) / (n - 1);
}
if (Math.abs(x - bl) > 0.5) throw new Error(`stripes end at ${x}, block starts at ${bl}`);

const xb = gx(cutRx) - s * extra; // bottom cut starts at y=B
const xt = gx(cutTx); // top cut starts at y=T
const block =
  `M${f1(bl)},${f1(B)}L${f1(xb)},${f1(B)}L${f1(xb + s * cut)},${f1(B - cut)}L${f1(XR + s * cut)},${f1(B - cut)}` +
  `L${f1(XR + s * (H - cutT))},${f1(T + cutT)}L${f1(xt - s * cutT)},${f1(T + cutT)}L${f1(xt)},${f1(T)}` +
  `L${f1(bl + s * H)},${f1(T)}Z`;
const bake = (d) =>
  d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, px, py) =>
    `${(tcx + (Number(px) - ox) * k).toFixed(2)},${(cy + (Number(py) - oy) * k).toFixed(2)}`);
const cutout = block + [F, O1, O2].map(bake).join("");
const foo = (ink) => [F, O1, O2].map((p) => `<path d="${bake(p)}" style="fill:${ink};fill-rule:nonzero;"/>`).join("");

const vx = Math.floor(toVb(X0, B)[0]);
const vw = Math.ceil(toVb(XR + s * H, T)[0]) - vx;
const vh = Math.ceil(toVb(0, B)[1]);
// DOJO sits over the ribbon with its Os as far above it as the first O is from the J (37.4, measured
// in the rendered SVG); the viewBox top follows it
const oBottomVb = 794.0; // the Os' bottom edge before the drop (measured)
const drop = Number((toVb(0, T)[1] - 37.4 - oBottomVb).toFixed(1));
const dDrop = 38; // the D drops further (about 1px at the header's 32px), into the ribbon
const dojo = head
  .slice(head.indexOf(OUTER) + OUTER.length)
  .replace("matrix(1,0,0,1,597,-309)", `matrix(1,0,0,1,597,${-309 + dDrop})`)
  .trimEnd();
const svgHead = head
  .slice(0, head.indexOf(OUTER) + OUTER.length)
  .replace('viewBox="0 0 2225 1212"', `viewBox="${vx} ${drop} ${vw} ${vh - drop}"`);

function build({ brand, ink, ribbon }) {
  const fill = brand ? `fill:url(#dojofoo-line)${ribbon};` : "fill:white;";
  const gradient = !brand ? "" :
    `<defs><linearGradient id="dojofoo-line" gradientUnits="userSpaceOnUse" x1="${f1(X0)}" y1="0" x2="${f1(bl)}" y2="0">` +
    `<stop offset="0" stop-color="${ORANGE}"/><stop offset="1" stop-color="${brand.fallback}"${brand.style}/></linearGradient></defs>`;
  const body = ink.theme
    ? `            ${ink.theme}
            <path class="dojofoo-light" d="${cutout}" style="${fill}fill-rule:evenodd;"/>
            <g class="dojofoo-dark"><path d="${block}" style="${fill}"/>${foo("white")}</g>`
    : ink.cut
      ? `            <path d="${cutout}" style="${fill}fill-rule:evenodd;"/>`
      : `            <path d="${block}" style="${fill}"/>${foo(ink.color)}`;
  const letters = ink.color === "white" ? dojo : dojo.replaceAll("fill:white", `fill:${ink.color}`);
  return `${prologue}${svgHead}
        <g transform="matrix(1.55631,0,0,1.55631,11.549972,-1604.66068)">
${gradient ? `            ${gradient}\n` : ""}${stripes.map((d) => `            <path d="${d}" style="${fill}"/>\n`).join("")}${body}
        </g>
        <g transform="translate(0,${drop})">${letters}
        </g>
    </g>
</svg>
`;
}

// The site build: the ribbon's !important beats the BrandLogo's forced currentColor; its brand stop
// follows the theme's --brand.
const site = build({
  brand: { fallback: BRAND.dark, style: ' style="stop-color:var(--brand, #fe0059)"' },
  ink: {
    color: "white",
    theme: '<style>.dojofoo-dark{display:none}.dark .dojofoo-dark{display:inline}.dark .dojofoo-light{display:none}</style>',
  },
  ribbon: " !important",
});
const light = build({ brand: { fallback: BRAND.light, style: "" }, ink: { color: INK.light, cut: true }, ribbon: "" });
const dark = build({ brand: { fallback: BRAND.dark, style: "" }, ink: { color: INK.dark }, ribbon: "" });
const mono = build({ brand: null, ink: { color: "white", cut: true }, ribbon: "" });

for (const [path, svg] of [...SITE.map((path) => [path, site]), [LIGHT, light], [DARK, dark], ...MONO.map((path) => [path, mono])]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, svg);
}
process.stdout.write(`Generated ${[...SITE, LIGHT, DARK, ...MONO].join(", ")} (viewBox ${vx} ${drop} ${vw} ${vh - drop})\n`);
