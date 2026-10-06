import { useEffect, useRef, useState } from "react";
import type * as Monaco from "modern-monaco/editor-core";
import type { CodeHighlight } from "../lib/code-highlight";
import { vercelCursorColors, vercelCursorTheme } from "../lib/code-editor-theme";
import { attachLanguageTools } from "../lib/monaco-language-tools";
import { attachDocumentation } from "../lib/monaco-documentation";
import "./code-editor.css";

export type CodeEditorLanguage = "javascript" | "json" | "markdown" | "python" | "typescript" | "yaml";
type CodeEditorProps = {
  code: string; coverage: boolean; lineHits?: Record<string, number>; failedLines?: number[];
  filePath: string; language: CodeEditorLanguage; lessonApiBase: string; readOnly: boolean;
  documentationUrl?: string;
  onChange: (code: string) => void;
  onUndoReady?: (undoEditor: () => boolean) => void;
  highlight?: CodeHighlight & { nonce: number };
};
type Editor = Monaco.editor.IStandaloneCodeEditor;

export default function CodeEditor(props: CodeEditorProps) {
  return <FileEditor key={`${props.lessonApiBase}:${props.filePath}:${props.language}:${props.readOnly}`} {...props} />;
}

function FileEditor(props: CodeEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [instance, setInstance] = useState<{ editor: Editor; monaco: typeof Monaco }>();
  const [error, setError] = useState<string>();
  const { code, filePath, language, lessonApiBase, readOnly, coverage, lineHits, failedLines, highlight, documentationUrl } = props;

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    setInstance(undefined);
    setError(undefined);
    import("../lib/monaco-runtime").then(({ loadMonaco }) => loadMonaco()).then((monaco) => {
      if (cancelled || !container.current) return;
      // Unique model per mounted file: no shared URI state across lessons/editors.
      const uri = monaco.Uri.from({ scheme: "inmemory", path: `/dojo/${crypto.randomUUID()}/${filePath}` });
      const model = monaco.editor.createModel(latest.current.code, language, uri);
      model.updateOptions({ tabSize: 2, insertSpaces: true });
      const overlay = document.createElement("div");
      overlay.className = "dojo-code-editor dojo-editor-overlays";
      const widgets = document.createElement("div");
      widgets.className = "monaco-editor";
      overlay.append(widgets);
      widgets.addEventListener("wheel", (event) => {
        const segment = (event.target as Element).closest(".markdown-hover");
        // Let the documentation segment scroll natively instead of Monaco scrolling
        // the entire hover (including the API and parameter segments).
        if (segment?.matches(":nth-child(2)")) event.stopPropagation();
      }, { capture: true, passive: true });
      document.body.append(overlay);
      const editor = monaco.editor.create(container.current, {
        overflowWidgetsDomNode: widgets, fixedOverflowWidgets: true,
        model, theme: vercelCursorTheme.name, automaticLayout: true,
        readOnly: latest.current.readOnly, ariaLabel: "Code editor", editContext: false,
        fontFamily: '"Iosevka", ui-monospace, monospace', fontSize: 16.5, lineHeight: 26,
        minimap: { enabled: false }, stickyScroll: { enabled: false },
        scrollBeyondLastLine: false, lineNumbersMinChars: 3, lineDecorationsWidth: 14,
        overviewRulerLanes: 0, hideCursorInOverviewRuler: true,
        renderLineHighlight: "all", renderLineHighlightOnlyWhenFocus: true,
        folding: true, showFoldingControls: "mouseover", glyphMargin: false,
        padding: { top: 4, bottom: 4 }, wordWrap: "off",
        "semanticHighlighting.enabled": false,
      });
      // Monaco reuses its hover widget. Reset its native scrollbar when content changes,
      // not while the learner is scrolling within the same documentation.
      let hoverContent = "";
      const hoverUpdates = new MutationObserver(() => {
        for (const segment of widgets.querySelectorAll<HTMLElement>(".markdown-hover:nth-child(n + 3)")) {
          segment.title = segment.textContent ?? "";
        }
        const content = widgets.querySelector(".hover-contents")?.textContent ?? "";
        if (content !== hoverContent) {
          hoverContent = content;
          // The keyboard action requires hover focus; call the installed contribution
          // without stealing focus from the editor or the learner's pointer.
          editor.getContribution<Monaco.editor.IEditorContribution & { goToTop(): void }>("editor.contrib.contentHover")?.goToTop();
        }
      });
      hoverUpdates.observe(widgets, { childList: true, subtree: true, characterData: true });
      const changes = model.onDidChangeContent(() => {
        if (model.getValue() !== latest.current.code) latest.current.onChange(model.getValue());
      });
      const detach = language === "typescript" && lessonApiBase && !readOnly
        ? attachLanguageTools(monaco, model, filePath, lessonApiBase) : undefined;
      const hoverUrl = documentationUrl ?? (lessonApiBase ? `${lessonApiBase}/files/solution/hover` : undefined);
      const detachDocs = hoverUrl && (language === "typescript" || language === "javascript")
        ? attachDocumentation(monaco, model, filePath, hoverUrl) : undefined;
      latest.current.onUndoReady?.(() => {
        if (model.isDisposed() || !model.canUndo()) return false;
        editor.trigger("dojo", "undo", null);
        return true;
      });
      setInstance({ editor, monaco });
      dispose = () => { hoverUpdates.disconnect(); detachDocs?.(); detach?.(); changes.dispose(); editor.dispose(); model.dispose(); overlay.remove(); };
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; dispose?.(); };
  }, [filePath, language, lessonApiBase, readOnly, documentationUrl]);

  useEffect(() => {
    const editor = instance?.editor;
    const model = editor?.getModel();
    if (!editor || !model || model.getValue() === code) return;
    const view = editor.saveViewState();
    model.setValue(code);
    if (view) editor.restoreViewState(view);
  }, [code, instance]);

  useEffect(() => {
    if (!instance) return;
    const { editor, monaco } = instance;
    const model = editor.getModel();
    if (!model) return;
    const decorations = editor.createDecorationsCollection();
    const update = () => decorations.set(visualizedLines(model.getLineCount(), coverage ? lineHits : undefined, failedLines)
      .map(({ line, status }) => ({ range: new monaco.Range(line, 1, line, 1), options: {
        isWholeLine: true, className: `dojo-line-${status}`, lineNumberClassName: `dojo-number-${status}`,
      } })));
    update();
    const subscription = model.onDidChangeContent(update);
    return () => { subscription.dispose(); decorations.clear(); };
  }, [instance, coverage, lineHits, failedLines]);

  useEffect(() => {
    if (!instance || !highlight) return;
    const { editor, monaco } = instance;
    const model = editor.getModel();
    if (!model) return;
    const count = model.getLineCount();
    const from = Math.max(1, Math.min(highlight.from, count));
    const to = Math.max(from, Math.min(highlight.to, count));
    const decorations = editor.createDecorationsCollection([{
      range: new monaco.Range(from, 1, to, 1),
      options: { isWholeLine: true, className: "dojo-line-flash" },
    }]);
    editor.revealLineInCenter(from);
    const timeout = setTimeout(() => decorations.clear(), 1200);
    return () => { clearTimeout(timeout); decorations.clear(); };
  }, [instance, highlight]);

  return <div className="dojo-code-editor relative h-full min-h-0 overflow-hidden"
    style={{ backgroundColor: vercelCursorColors.background }} data-file-path={filePath}>
    <div ref={container} className="h-full min-h-0" />
    {error ? <div role="alert" className="absolute inset-0 p-4">Editor could not load: {error}</div>
      : !instance && <div role="status" className="absolute inset-0 p-4 text-muted-foreground">Loading editor…</div>}
  </div>;
}

export function visualizedLines(lineCount: number, lineHits?: Record<string, number>, failedLines: number[] = []) {
  const failed = new Set(failedLines);
  return [...new Set([...Object.entries(lineHits ?? {}).filter(([, hits]) => hits > 0).map(([line]) => Number(line)), ...failedLines])]
    .filter((line) => Number.isInteger(line) && line > 0 && line <= lineCount)
    .sort((a, b) => a - b).map((line) => ({ line, status: failed.has(line) ? "failed" : "covered" }));
}
