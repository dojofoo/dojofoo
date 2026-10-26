import { useSyncExternalStore } from "react";
import catalog from "../styles/themes/catalog.json";
import { editorSchemes, type EditorSchemeId } from "./code-editor-theme";
import { themeViewTransition } from "./view-transition";

/*
 * The interface's look, chosen by the person using it: a theme (its colors – styles/themes), the editor's color
 * scheme (its syntax colors, chosen apart so the two can be compared and swapped), the type density (Fluid's default
 * or compact step) and the code editor's font size. Applied as attributes on <html>, so portals
 * (dialogs, tooltips, the editor's hovers) follow; remembered in this browser.
 */
/** Dojofoo, the default and the one hand-made theme, or an imported one's id (styles/themes/catalog.json) */
export type UiThemeName = "dojofoo" | (string & {});
export type UiDensity = "default" | "compact";
export type UiEditorScheme = "match" | EditorSchemeId;
export type UiPreferences = { theme: UiThemeName; editorScheme: UiEditorScheme; density: UiDensity; editorSize: number };

export const uiThemes: { id: UiThemeName; label: string; note: string; swatches: [string, string, string] }[] = [
  { id: "dojofoo", label: "Dojofoo", note: "Neutrals with the brand pink", swatches: ["oklch(0.2046 0 0)", "oklch(0.2645 0 0)", "oklch(0.6321 0.2554 13.98)"] },
  ...(catalog as { id: string; label: string; note: string; swatches: string[] }[]).map(({ id, label, note, swatches }) => ({ id, label, note, swatches: swatches as [string, string, string] })),
];
/** Imported themes set shadcn's colors only; data-ui-derive turns on styles/themes/derive.css for them */
const imported = new Set((catalog as { id: string }[]).map((theme) => theme.id));
/** Monaco sizes on offer, each with a whole-pixel line height near 1.6 */
export const editorSizes = [13, 14, 15, 16.5] as const;
export const editorLineHeight = (size: number) => ({ 13: 20, 14: 22, 15: 24, 16.5: 26 } as Record<number, number>)[size] ?? Math.round(size * 1.6);

/** The scheme each theme pairs with for "Match theme": Japan Blues' warm grays take Material's neutral Darker, OpenClaw's
    blue-black Material's Ocean, T3 Chat its app's own Pierre Dark (T3 Code); every other theme takes Vercel, which
    has a light variant. The dark-only schemes stay a dark island in a light page */
const matched: Partial<Record<string, EditorSchemeId>> = { "japan-blues": "material-darker", openclaw: "material-ocean", "t3-chat": "pierre-dark" };
/** The editor's scheme for a theme – a fixed choice, or the theme's match – in its variant for the page's mode: a
    scheme with a light variant turns light on a light page, the others stay dark */
export function resolveEditorScheme(preferences: Pick<UiPreferences, "theme" | "editorScheme">, mode: PageMode = "dark") {
  const id = preferences.editorScheme === "match" ? (matched[preferences.theme] ?? "vercel") : preferences.editorScheme;
  const scheme = editorSchemes.find((item) => item.id === id) ?? editorSchemes[0];
  return mode === "light" && scheme.light ? { ...scheme, ...scheme.light } : scheme;
}
export { editorSchemes };

const defaults: UiPreferences = { theme: "dojofoo", editorScheme: "match", density: "default", editorSize: 16.5 };
const key = "uix:preferences";
const listeners = new Set<() => void>();

function load(): UiPreferences {
  try {
    const saved = { ...defaults, ...(JSON.parse(localStorage.getItem(key) ?? "null") as Partial<UiPreferences> | null) };
    // A theme or scheme saved before it was removed falls back to the default
    if (!uiThemes.some((theme) => theme.id === saved.theme)) saved.theme = defaults.theme;
    if (saved.editorScheme !== "match" && !editorSchemes.some((scheme) => scheme.id === saved.editorScheme)) saved.editorScheme = "match";
    return saved;
  } catch {
    return defaults;
  }
}

let state: UiPreferences = typeof window === "undefined" ? defaults : load();

function apply() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.uiTheme = state.theme;
  if (imported.has(state.theme)) root.dataset.uiDerive = "";
  else delete root.dataset.uiDerive;
  root.dataset.uiDensity = state.density;
}
apply();

export function setUiPreferences(patch: Partial<UiPreferences>) {
  if (patch.theme !== undefined && patch.theme !== state.theme) {
    themeViewTransition(() => updatePreferences(patch));
  } else updatePreferences(patch);
}

function updatePreferences(patch: Partial<UiPreferences>) {
  state = { ...state, ...patch };
  apply();
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Private windows and blocked storage keep the choice for this visit only
  }
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useUiPreferences() {
  return useSyncExternalStore(subscribe, () => state, () => defaults);
}

/** The editor's color scheme as it stands: the person's choice, or the theme's match, for the page's mode */
export function useEditorScheme() {
  return resolveEditorScheme(useUiPreferences(), usePageMode());
}

/** The page's mode – the .dark class on <html> that Storybook's toolbar and the app's theme toggle set – followed as it
    changes, and set from the interface (Settings → Appearance) */
export type PageMode = "light" | "dark";
function subscribePageMode(listener: () => void) {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
  return () => observer.disconnect();
}
const pageMode = (): PageMode => (document.documentElement.matches('.dark, [data-theme="dark"]') ? "dark" : "light");
export function usePageMode() {
  return useSyncExternalStore(subscribePageMode, pageMode, () => "dark" as PageMode);
}
export function setPageMode(mode: PageMode) {
  if (pageMode() === mode) return;
  themeViewTransition(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", mode === "dark");
    if (root.dataset.theme) root.dataset.theme = mode;
    root.style.colorScheme = mode;
  });
}
