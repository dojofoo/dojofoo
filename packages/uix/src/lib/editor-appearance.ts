import type { CSSProperties } from "react";
import type { EditorSchemeVariant } from "./code-editor-theme";

export type EditorAppearance = {
  type: "dark" | "light";
  line?: string;
  lineBorder?: string;
  style: CSSProperties;
};

/** Pass original palette values to CSS; blending and lightness stay in styles/editor.css. */
export function editorAppearance(scheme: EditorSchemeVariant): EditorAppearance {
  const colors = (scheme.theme as { colors?: Record<string, string> }).colors ?? {};
  return {
    type: scheme.type,
    line: colors["editor.lineHighlightBackground"],
    lineBorder: colors["editor.lineHighlightBorder"],
    style: {
      "--ui-ed-scheme": scheme.surface,
      "--ui-ed-line-color": colors["editor.lineHighlightBackground"],
      "--ui-ed-line-border-color": colors["editor.lineHighlightBorder"],
      ...(scheme.blend && { "--ui-ed-blend": scheme.blend }),
    } as CSSProperties,
  };
}
