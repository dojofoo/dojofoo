import type { ComponentProps } from "react";
import { EditorFrame, EditorTabs as FileTabs, type EditorTabsProps } from "../components/editor";
import { editorAppearance } from "../lib/editor-appearance";
import { useEditorScheme } from "../lib/ui-preferences";

export { EditorStatus } from "../components/editor";
export { CodeEditor, type EditorLanguage } from "./code-editor";

export function Editor(props: Omit<ComponentProps<typeof EditorFrame>, "appearance">) {
  return <EditorFrame {...props} appearance={editorAppearance(useEditorScheme())} />;
}

export function EditorTabs(props: EditorTabsProps) {
  return <FileTabs {...props} scheme={useEditorScheme()} />;
}
