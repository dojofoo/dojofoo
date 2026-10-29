# Dojofoo logo sources

`dojofoo-wordmark.svg` is the wordmark: DOJO over FOO, exported from Affinity.
The logo is built from it:

```sh
pnpm assets:logo
```

`scripts/assets/build-logo.mjs` turns the FOO line into the slanted ribbon
(stripes thickening into a block that carries FOO, orange fading into the
brand colour) and writes:

- `dojofoo.svg` and its copies in `packages/ui/public/brand/`,
  `apps/web/public/` and `packages/uix/src/assets/brand/`, inlined by the
  BrandLogo components. They color the paths with `currentColor`; in light
  mode FOO is cut out of the block, in dark mode (`.dark` on an ancestor) it
  is drawn in the logo colour.
- `dojofoo-light.svg` and `dojofoo-dark.svg`, standalone builds with fixed
  colours for places without that CSS, such as the README.
- `dojofoo-mono.svg` (also in `packages/uix/src/assets/brand/`), one colour
  with FOO always cut out, for single-colour uses such as certificates: every
  path is white, to recolour like the wordmark (the certificate seal draws it
  in `currentColor`).

Do not edit the generated files by hand. The ribbon's proportions are the
constants at the top of the script.

`dojofoo-flat.svg` and `dojofoo-perspective.af` are the earlier flat artwork
and its Affinity `Pers` live filter; `scripts/assets/apply-svg-perspective.mjs`
bakes that filter into SVG paths.
