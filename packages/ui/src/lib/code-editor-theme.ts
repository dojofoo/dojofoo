import cursorVercel from "./themes/cursor-vercel.json" with { type: "json" };

// Exact upstream TextMate theme, not an approximation layered over another theme.
// https://github.com/FlameDevvv/vercelcursortheme/tree/99613015c8e4e39dedbcbfafb3d7b41942e3fc1b
export const vercelCursorTheme = { ...cursorVercel, name: "dojo-vercel", type: "dark" as const };
export const vercelCursorColors = {
  background: cursorVercel.colors["editor.background"],
  keyword: cursorVercel.colors["editorError.foreground"],
  string: cursorVercel.colors["terminal.ansiGreen"],
};

import githubDarkDimmed from "./themes/github-dark-dimmed.json" with { type: "json" };
import oneDarkProDarker from "./themes/one-dark-pro-darker.json" with { type: "json" };
import materialDarker from "./themes/material-theme-darker.json" with { type: "json" };
import materialOcean from "./themes/material-theme-ocean.json" with { type: "json" };
import pierreDark from "./themes/pierre-dark.json" with { type: "json" };
import linearDark from "./themes/linear-dark.json" with { type: "json" };
import linearLight from "./themes/linear-light.json" with { type: "json" };
import vercelDark from "./themes/vercel-dark.json" with { type: "json" };
import vercelLight from "./themes/vercel-light.json" with { type: "json" };

type TextMateTheme = { colors: Record<string, string>; tokenColors: { scope?: string | string[]; settings: Record<string, string | undefined> }[] };
const isComment = (rule: TextMateTheme["tokenColors"][number]) => ([] as string[]).concat(rule.scope ?? []).some((scope) => /^(comment|punctuation\.definition\.comment|string\.comment)/.test(scope));
/** Vercel's text in Linear's editor: Linear's colors for everything around the code – backgrounds, line highlight,
    selection, line numbers, guides, cursor and the other glyphs – and its comments; Vercel's syntax colors and its
    default text. Both upstream files stay as published (themes/NOTICE.md) */
function linearVercel(name: string, type: "dark" | "light", linear: TextMateTheme, vercel: TextMateTheme) {
  return {
    name, type,
    colors: { ...linear.colors, "editor.foreground": vercel.colors["editor.foreground"] } as Record<string, string>,
    tokenColors: [...vercel.tokenColors.filter((rule) => !isComment(rule)), ...linear.tokenColors.filter(isComment)],
  };
}
const vercelLinearDark = linearVercel("dojo-vercel-linear-dark", "dark", linearDark, vercelDark);
const vercelLinearLight = linearVercel("dojo-vercel-linear-light", "light", linearLight, vercelLight);

// Color schemes for the editor. Each paints the editor with its own background (`surface`), so its line highlight,
// selection and gutter read exactly as in the original theme. A scheme with a `light` variant follows the page's mode;
// the others are dark wherever they are. Sources and licenses: themes/NOTICE.md
export type EditorSchemeId = "vercel" | "github-dark-dimmed" | "one-dark-pro-darker" | "material-darker" | "material-ocean" | "pierre-dark";
/** `blend`: how far the editor's background moves toward the theme's card, when the variant sets its own (else 75%) */
export type EditorSchemeVariant = { type: "dark" | "light"; surface: string; blend?: string; theme: { name: string } & Record<string, unknown> };
export type EditorScheme = { id: EditorSchemeId; label: string; light?: EditorSchemeVariant } & EditorSchemeVariant;
export const editorSchemes: EditorScheme[] = [
  { id: "vercel", label: "Vercel", type: "dark", surface: vercelLinearDark.colors["editor.background"], theme: vercelLinearDark,
    // Linear Light's near-white is already the window it sits in (Dojofoo light): kept as published
    light: { type: "light", surface: vercelLinearLight.colors["editor.background"], blend: "0%", theme: vercelLinearLight } },
  { id: "github-dark-dimmed", surface: githubDarkDimmed.colors["editor.background"], label: "GitHub Dark Dimmed", type: "dark", theme: { ...githubDarkDimmed, name: "dojo-github-dark-dimmed", type: "dark" } },
  { id: "one-dark-pro-darker", surface: oneDarkProDarker.colors["editor.background"], label: "One Dark Pro Darker", type: "dark", theme: { ...oneDarkProDarker, name: "dojo-one-dark-pro-darker", type: "dark" } },
  { id: "material-darker", surface: materialDarker.colors["editor.background"], label: "Material Darker", type: "dark", theme: { ...materialDarker, name: "dojo-material-darker", type: "dark" } },
  { id: "material-ocean", surface: materialOcean.colors["editor.background"], label: "Material Ocean", type: "dark", theme: { ...materialOcean, name: "dojo-material-ocean", type: "dark" } },
  { id: "pierre-dark", surface: pierreDark.colors["editor.background"], label: "Pierre Dark", type: "dark", theme: { ...pierreDark, name: "dojo-pierre-dark", type: "dark" } },
];
