import { SiteSearchPalette as SharedPalette, type SiteSearchPaletteProps } from "@dojofoo/uix/components/site-search-palette";

export type { SearchScope } from "@dojofoo/uix/components/site-search-palette";

/** Bridge the website's theme tokens to the shared Dojo palette, within its dialog. */
export function SiteSearchPalette(props: SiteSearchPaletteProps) {
  return <>
    <style>{css}</style>
    <SharedPalette {...props} className="dojo-site-search" />
  </>;
}

const css = `
.dojo-site-search {
  --fluid-foreground: var(--foreground);
  --fluid-muted: var(--muted-foreground);
  --fluid-hairline: var(--border);
  --fluid-hover: var(--hover);
  --focus-ring: var(--ring);
  --pill-surface: var(--surface-4);
  --fs-body: 13px; --lh-body: 20px; --fs-subtitle: 14px; --fs-caption: 12px;
  --motion-fast: 100ms; --motion-moderate: 200ms; --motion-slow: 250ms; --motion-slow-exit: 160ms;
  --ease-fast: cubic-bezier(.16, 1, .3, 1); --ease-moderate: cubic-bezier(.16, 1, .3, 1);
  --ease-slow: cubic-bezier(.16, 1, .3, 1); --ease-exit: ease-in;
  font-family: var(--font-sans, sans-serif);
}
`;
