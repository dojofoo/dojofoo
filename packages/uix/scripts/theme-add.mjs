#!/usr/bin/env node
/*
 * theme:add – imports a shadcn theme as a uix theme: a tweakcn link, or any registry item's JSON (e.g. shadcnthemer).
 *
 *   pnpm --filter uix theme:add https://tweakcn.com/themes/<id> [id] [label]
 *   pnpm --filter uix theme:add https://shadcnthemer.com/r/themes/<uuid>.json [id] [label]
 *
 * Downloads the theme's shadcn registry item (tweakcn.com/r/themes/<id>, or the .json as given), checks its values and writes
 * src/styles/themes/<id>.css plus an entry in src/styles/themes/catalog.json (read by lib/ui-preferences).
 *
 * What it keeps: the shadcn colors, light and dark, and the radius – as --radius-base, so the squircle scaling in
 * styles.css still applies. What it drops: fonts (uix sets Inter and Iosevka), spacing and tracking (Tailwind's
 * and Inter's own), and shadows (the Fluid shadow ladder carries elevation). Our own tokens – the surface ladder, text,
 * hairline, states – are derived from the colors in themes/derive.css, the same for every imported theme.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [link, idArg, labelArg] = process.argv.slice(2);
if (!link) {
  console.error("Usage: theme-add <tweakcn theme url> [id] [label]");
  process.exit(1);
}
const themes = join(dirname(fileURLToPath(import.meta.url)), "../src/styles/themes");
// A registry item's JSON is read as given; a tweakcn page link maps to its registry item
const remote = link.endsWith(".json") ? link : `https://tweakcn.com/r/themes/${link.match(/themes\/([a-z0-9]+)/i)?.[1] ?? ""}`;
if (remote.endsWith("/")) throw new Error(`Not a tweakcn theme link or a registry .json: ${link}`);
const item = await (await fetch(remote)).json();
const label = labelArg ?? item.title ?? item.name;
const id = idArg ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The shadcn colors uix reads. Anything else in the theme (sidebar-*, fonts, shadows …) stays out */
const colors = ["background", "foreground", "card", "card-foreground", "popover", "popover-foreground", "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground", "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring", "chart-1", "chart-2", "chart-3", "chart-4", "chart-5"];
const warnings = [];
const lightness = (value) => Number(value.match(/oklch\(\s*([\d.]+)/)?.[1] ?? NaN);

function check(mode, vars) {
  const out = {};
  for (const name of colors) {
    let value = vars[name];
    if (!value) continue;
    // A stray "#" before a function – "#oklch(0.145 0 0)" – is invalid CSS and drops the whole declaration
    if (/^#[a-z]+\(/i.test(value)) {
      warnings.push(`${mode} --${name}: "${value}" is invalid, dropped the "#"`);
      value = value.slice(1);
    }
    out[name] = value;
  }
  // A destructive color must read as a warning: a near-black or near-white one is a slip in the theme
  const red = lightness(out.destructive ?? "");
  if (red < 0.3 || red > 0.9) {
    warnings.push(`${mode} --destructive ${out.destructive} is not a usable red – using shadcn's`);
    out.destructive = mode === "light" ? "oklch(0.577 0.245 27.325)" : "oklch(0.704 0.191 22.216)";
  }
  // Lines must sit near the surfaces: a border far from the background is a slip too
  const step = Math.abs(lightness(out.border ?? "") - lightness(out.background ?? ""));
  if (step > 0.35) warnings.push(`${mode} --border ${out.border} is ${step.toFixed(2)} away from the background – check it`);
  return out;
}

const light = check("light", item.cssVars.light ?? {});
const dark = check("dark", item.cssVars.dark ?? {});
const radius = item.cssVars.theme?.radius ?? item.cssVars.light?.radius ?? "0.5rem";
const block = (vars) => Object.entries(vars).map(([name, value]) => `  --${name}: ${value};`).join("\n");

writeFileSync(join(themes, `${id}.css`), `/*
 * ${label} – imported (${link}) by scripts/theme-add.mjs; edit the theme there and import it again. Hand tuning goes
 * in themes/tuning.css, which an import leaves alone.
 * The shadcn colors, light and dark, and the radius; uix's own tokens follow from them in themes/derive.css.
 */
:root[data-ui-theme="${id}"],
[data-ui-theme="${id}"] .light {
${block(light)}
  --radius-base: ${radius};
}

[data-ui-theme="${id}"]:is(.dark, [data-theme="dark"]),
[data-ui-theme="${id}"] :is(.dark, [data-theme="dark"]) {
${block(dark)}
}
`);

const catalogFile = join(themes, "catalog.json");
const catalog = JSON.parse(readFileSync(catalogFile, "utf8"));
const entry = { id, label, note: (item.description ?? `From ${new URL(link).hostname.replace(/^www\./, "")}`).slice(0, 60), source: link, swatches: [dark.background, dark.card, dark.primary] };
const at = catalog.findIndex((theme) => theme.id === id);
if (at >= 0) catalog[at] = { ...catalog[at], ...entry, note: catalog[at].note };
else catalog.push(entry);
writeFileSync(catalogFile, `${JSON.stringify(catalog, null, 2)}\n`);

const index = join(themes, "index.css");
const css = readFileSync(index, "utf8");
if (!css.includes(`./${id}.css`)) writeFileSync(index, css.replace("/* imported */", `/* imported */\n@import "./${id}.css";`));

console.log(`${label} → themes/${id}.css (radius ${radius})`);
for (const warning of warnings) console.log(`  ! ${warning}`);
