import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags } from "@lezer/highlight";

/** Colors translated from FlameDevvv's Cursor Vercel VS Code theme. */
export const vercelCursorColors = {
  accent: "#52a8ff",
  activeLine: "#292929",
  background: "#1a1a1a",
  border: "#2a2a2a",
  comment: "#a1a1a1",
  cursor: "#ffffff",
  foreground: "#d8dee9",
  gutterText: "#505050",
  keyword: "#ff4d8d",
  panel: "#161616",
  selection: "#40404099",
  string: "#62c073",
  type: "#bf7af0",
  function: "#c472fb",
  warning: "#eaac00",
} as const;

const createVercelCursorTheme = (): Extension => {
  const color = vercelCursorColors;
  const theme = EditorView.theme(
    {
      "&": {
        backgroundColor: color.background,
        color: color.foreground,
        fontFamily: '"Iosevka", ui-monospace, monospace',
        fontSize: "16.5px",
        lineHeight: "1.55",
      },
      "&.cm-focused": { outline: "none" },
      ".cm-scroller": {
        fontFamily: "inherit",
        fontSize: "inherit",
      },
      ".cm-content": {
        caretColor: color.cursor,
        fontFamily: '"Iosevka", ui-monospace, monospace',
      },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: color.cursor },
      "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
        backgroundColor: color.selection,
      },
      ".cm-activeLine": { backgroundColor: color.activeLine },
      ".cm-activeLineGutter": {
        backgroundColor: color.activeLine,
        color: color.cursor,
      },
      ".cm-selectionMatch": { backgroundColor: "#404040cc" },
      "&.cm-focused .cm-matchingBracket": {
        backgroundColor: "transparent",
        outline: "1px solid #ffffff55",
      },
      ".cm-gutters": {
        backgroundColor: color.background,
        border: "none",
        color: color.gutterText,
        fontFamily: "inherit",
        fontSize: "inherit",
      },
      ".cm-panels": {
        backgroundColor: color.panel,
        color: color.foreground,
      },
      ".cm-panels.cm-panels-top": { borderBottom: `1px solid ${color.border}` },
      ".cm-panels.cm-panels-bottom": { borderTop: `1px solid ${color.border}` },
      ".cm-searchMatch": { backgroundColor: "#88c0d044" },
      ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "#88c0d066" },
      ".cm-foldPlaceholder": {
        backgroundColor: "transparent",
        border: "none",
        color: color.gutterText,
      },
      ".cm-tooltip": {
        backgroundColor: color.panel,
        border: `1px solid ${color.border}`,
        borderRadius: "0",
        boxShadow: "var(--shadow-5)",
        color: color.cursor,
        fontFamily: "Iosevka, monospace",
      },
      ".cm-tooltip-autocomplete": {
        borderLeft: `2px solid ${color.accent}`,
        fontSize: "0.8125rem",
        maxWidth: "30rem",
        minWidth: "18rem",
      },
      ".cm-tooltip-autocomplete.cm-tooltip-below": { transform: "translateY(4px)" },
      ".cm-tooltip-autocomplete > ul": { maxHeight: "16rem", padding: "0" },
      ".cm-tooltip-autocomplete > ul > li": {
        alignItems: "center",
        boxSizing: "border-box",
        cursor: "pointer",
        display: "flex",
        height: "25.575px",
        lineHeight: "25.575px",
        minHeight: "25.575px",
        padding: "0 0.625rem !important",
      },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
        backgroundColor: "#404040",
        color: color.cursor,
      },
      ".cm-completionIcon": { color: color.gutterText, opacity: "1", width: "1.25rem" },
      ".cm-completionLabel": { fontSize: "0.8125rem" },
      ".cm-completionMatchedText": {
        color: color.accent,
        fontWeight: "600",
        textDecoration: "none",
      },
      ".cm-completionDetail": {
        color: color.gutterText,
        fontStyle: "normal",
        marginLeft: "1rem",
      },
      ".cm-tooltip-lint": {
        backgroundColor: `${color.panel} !important`,
        border: `1px solid ${color.border} !important`,
        boxShadow: "var(--shadow-5)",
        maxWidth: "30rem",
        minWidth: "20rem",
      },
      ".cm-tooltip-lint.cm-tooltip-below": { transform: "translateY(6px)" },
      ".cm-tooltip-lint .cm-diagnostic": {
        borderLeft: `2px solid ${color.keyword}`,
        lineHeight: "1.5",
        minHeight: "4.5rem",
        padding: "0.75rem 1rem !important",
      },
      ".cm-diagnosticText": {
        fontFamily: "Iosevka, monospace",
        fontSize: "0.9375rem",
      },
      ".cm-diagnosticSource": { color: color.gutterText, marginTop: "0.375rem" },
      ".cm-gutter-lint": { width: "1em" },
      ".cm-foldGutter": { width: "0.875rem" },
      ".cm-gutter-lint .cm-gutterElement": {
        alignItems: "center",
        display: "flex",
        justifyContent: "center",
        padding: "0",
      },
      ".cm-foldGutter .cm-gutterElement": { padding: "0 0.25rem 0 0" },
    },
    { dark: true },
  );

  const highlight = HighlightStyle.define([
    { tag: tags.comment, color: color.comment },
    { tag: [tags.typeName, tags.className], color: color.type },
    {
      tag: [
        tags.attributeName,
        tags.function(tags.variableName),
        tags.function(tags.propertyName),
      ],
      color: color.function,
    },
    {
      tag: [
        tags.atom,
        tags.bool,
        tags.constant(tags.name),
        tags.number,
        tags.regexp,
        tags.special(tags.variableName),
      ],
      color: color.accent,
    },
    {
      tag: [
        tags.controlKeyword,
        tags.definition(tags.propertyName),
        tags.invalid,
        tags.keyword,
        tags.modifier,
        tags.operatorKeyword,
        tags.separator,
      ],
      color: color.keyword,
    },
    {
      tag: [tags.inserted, tags.string, tags.tagName],
      color: color.string,
    },
    { tag: [tags.changed, tags.annotation], color: color.warning },
    {
      tag: [tags.name, tags.propertyName, tags.punctuation, tags.variableName],
      color: "#ededed",
    },
    { tag: tags.heading, color: color.accent, fontWeight: "bold" },
    { tag: tags.link, color: color.accent, textDecoration: "underline" },
    { tag: tags.strong, fontWeight: "bold" },
    { tag: tags.emphasis, fontStyle: "italic" },
  ]);

  return [theme, syntaxHighlighting(highlight)];
};

export const vercelCursorTheme = createVercelCursorTheme();
