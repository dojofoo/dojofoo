import { defineShikiSetup } from "@slidev/types";
import type { ThemeRegistration } from "shiki";
import { editorSchemes } from "../../src/lib/code-editor-theme";

const scheme = editorSchemes[0];
export default defineShikiSetup(() => ({
  themes: { dark: scheme.theme as ThemeRegistration, light: scheme.light!.theme as ThemeRegistration },
  langs: ["typescript", "javascript"],
}));
