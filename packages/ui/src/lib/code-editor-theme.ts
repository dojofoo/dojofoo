import cursorVercel from "./themes/cursor-vercel.json" with { type: "json" };

// Exact upstream TextMate theme, not an approximation layered over another theme.
// https://github.com/FlameDevvv/vercelcursortheme/tree/99613015c8e4e39dedbcbfafb3d7b41942e3fc1b
export const vercelCursorTheme = { ...cursorVercel, name: "dojo-vercel", type: "dark" as const };
export const vercelCursorColors = {
  background: cursorVercel.colors["editor.background"],
  keyword: cursorVercel.colors["editorError.foreground"],
  string: cursorVercel.colors["terminal.ansiGreen"],
};
