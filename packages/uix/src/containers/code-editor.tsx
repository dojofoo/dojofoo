import { useContentPreferences } from "../lib/content-preferences";
import { useEffect, useRef, useState } from "react";
import type * as Monaco from "modern-monaco/editor-core";
import { editorLineHeight, useEditorScheme, useUiPreferences } from "../lib/ui-preferences";
import type { CodeHighlight } from "../lib/code-highlight";
import { attachLanguageTools } from "../lib/monaco-language-tools";
import { attachDocumentation } from "../lib/monaco-documentation";
import { visualizedLines } from "../lib/editor-lines";
import { preloadEditor } from "../lib/preload-editor";
export type EditorLanguage = "javascript" | "json" | "markdown" | "python" | "typescript" | "yaml";

export type CodeEditorProps = {
  code: string; coverage: boolean; lineHits?: Record<string, number>; failedLines?: number[];
  filePath: string; language: EditorLanguage; lessonApiBase: string; readOnly: boolean;
  documentationUrl?: string;
  onChange: (code: string) => void;
  onUndoReady?: (undoEditor: () => boolean) => void;
  onSave?: (code: string) => void;
  highlight?: CodeHighlight & { nonce: number };
};
type MonacoEditor = Monaco.editor.IStandaloneCodeEditor;

/** A lesson/API boundary owns one editor; its file models never escape that workspace. */
export function CodeEditor(props: CodeEditorProps) {
  return <FileEditor key={props.lessonApiBase} {...props} />;
}

function FileEditor(props: CodeEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [instance, setInstance] = useState<{ editor: MonacoEditor; monaco: typeof Monaco }>();
  const [error, setError] = useState<string>();
  // The person's editor size (Brief → Typography); a change resizes the open editor in place
  const { editorSize } = useUiPreferences();
  const { code: display } = useContentPreferences();
  const size = useRef(editorSize);
  size.current = editorSize;
  // The color scheme (Settings → Color scheme): Monaco takes its theme by name, and the hover layer follows its mode
  const scheme = useEditorScheme();
  const schemeRef = useRef(scheme);
  schemeRef.current = scheme;
  const overlayRef = useRef<HTMLDivElement>(null);
  const files = useRef(new Map<string, { model: Monaco.editor.ITextModel; view: Monaco.editor.ICodeEditorViewState | null }>());
  const detachFile = useRef<(() => void) | undefined>(undefined);
  const tokenizeVisibleRef = useRef<(() => void) | undefined>(undefined);
  const { code, filePath, language, lessonApiBase, readOnly, coverage, lineHits, failedLines, highlight, documentationUrl } = props;

  useEffect(() => {
    if (!instance) return;
    instance.monaco.editor.setTheme(scheme.theme.name);
    overlayRef.current?.classList.toggle("dark", scheme.type === "dark");
    overlayRef.current?.classList.toggle("light", scheme.type === "light");
  }, [instance, scheme]);

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | undefined;
    setInstance(undefined);
    setError(undefined);
    preloadEditor().then((monaco) => {
      if (cancelled || !container.current) return;
      // Hovers and suggestions render into a layer on <body>; it is a dark island like the card
      const overlay = document.createElement("div");
      overlay.className = `ui-ed-overlays ${schemeRef.current.type}`;
      overlayRef.current = overlay;
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
        model: null, theme: schemeRef.current.theme.name, automaticLayout: true,
        readOnly: latest.current.readOnly, ariaLabel: "Code editor", editContext: false,
        fontFamily: '"Iosevka", ui-monospace, monospace', fontSize: size.current, lineHeight: editorLineHeight(size.current),
        minimap: { enabled: false }, stickyScroll: { enabled: false },
        scrollBeyondLastLine: false, lineNumbersMinChars: 3, lineDecorationsWidth: 14,
        overviewRulerLanes: 0, hideCursorInOverviewRuler: true, overviewRulerBorder: false,
        // The content's scrollbars: a 10px track, a thin pill thumb (styled below), and no shadow under the tabs – the
        // code fades at its edges instead
        scrollbar: { useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10, verticalSliderSize: 4, horizontalSliderSize: 10 },
        // Typographic quotes and apostrophes are right in lesson text, not lookalikes to flag
        unicodeHighlight: { ambiguousCharacters: false },
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
      // Monaco colors visible lines from idle-time work, which a busy main thread (a slow
      // renderer) can postpone indefinitely; tokenize up to the last visible line directly
      const tokenizeVisible = () => {
        const model = editor.getModel() as (Monaco.editor.ITextModel & { tokenization?: { forceTokenization?(lineNumber: number): void } }) | null;
        if (!model) return;
        const last = editor.getVisibleRanges().at(-1)?.endLineNumber ?? model.getLineCount();
        model.tokenization?.forceTokenization?.(Math.min(Math.max(last, 1), model.getLineCount()));
      };
      tokenizeVisibleRef.current = tokenizeVisible;
      const changes = editor.onDidChangeModelContent(() => {
        tokenizeVisible();
        const value = editor.getModel()?.getValue();
        if (value !== undefined && value !== latest.current.code) latest.current.onChange(value);
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        const model = editor.getModel();
        if (model) latest.current.onSave?.(model.getValue());
      });
      latest.current.onUndoReady?.(() => {
        const model = editor.getModel();
        if (!model || model.isDisposed() || !model.canUndo()) return false;
        editor.trigger("dojo", "undo", null);
        return true;
      });
      // The code fades where there's more to scroll, as every scrolling area does (styles/fluid.css .scroll-fade): Monaco
      // scrolls virtually, so the fade follows its scroll events instead of a scroll timeline
      const code = container.current?.parentElement;
      const fade = () => {
        if (!code) return;
        const top = editor.getScrollTop();
        const rest = editor.getScrollHeight() - editor.getLayoutInfo().height - top;
        code.style.setProperty("--ui-ed-fade-start", String(1 - Math.min(Math.max(top / 48, 0), 1)));
        code.style.setProperty("--ui-ed-fade-end", String(1 - Math.min(Math.max(rest / 48, 0), 1)));
      };
      const scrolls = editor.onDidScrollChange(() => { fade(); tokenizeVisible(); });
      const sizes = editor.onDidContentSizeChange(fade);
      fade();
      setInstance({ editor, monaco });
      // Monaco measures the font when it starts; Iosevka may arrive later, so measure again once it is in
      void document.fonts.ready.then(() => { if (!cancelled) monaco.editor.remeasureFonts(); });
      dispose = () => {
        detachFile.current?.(); detachFile.current = undefined;
        hoverUpdates.disconnect(); scrolls.dispose(); sizes.dispose(); changes.dispose(); editor.dispose();
        for (const file of files.current.values()) file.model.dispose();
        files.current.clear(); overlay.remove();
      };
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; dispose?.(); };
  }, []);

  useEffect(() => {
    if (!instance) return;
    const { editor, monaco } = instance;
    let file = files.current.get(filePath);
    if (!file) {
      const uri = monaco.Uri.from({ scheme: "inmemory", path: `/dojo/${crypto.randomUUID()}/${filePath}` });
      const model = monaco.editor.createModel(latest.current.code, language, uri);
      model.updateOptions({ tabSize: 2, insertSpaces: true });
      file = { model, view: null };
      files.current.set(filePath, file);
    }
    const { model } = file;
    if (model.getLanguageId() !== language) monaco.editor.setModelLanguage(model, language);
    editor.setModel(model);
    tokenizeVisibleRef.current?.();
    editor.updateOptions({ readOnly });
    if (file.view) editor.restoreViewState(file.view);
    const detach = language === "typescript" && lessonApiBase && !readOnly
      ? attachLanguageTools(monaco, model, filePath, lessonApiBase) : undefined;
    const hoverUrl = documentationUrl ?? (lessonApiBase ? `${lessonApiBase}/files/solution/hover` : undefined);
    const detachDocs = hoverUrl && (language === "typescript" || language === "javascript")
      ? attachDocumentation(monaco, model, filePath, hoverUrl) : undefined;
    const active = file;
    detachFile.current = () => {
      active.view = editor.saveViewState();
      detachDocs?.(); detach?.();
    };
    return () => { detachFile.current?.(); detachFile.current = undefined; };
  }, [instance, filePath, language, lessonApiBase, readOnly, documentationUrl]);

  useEffect(() => {
    instance?.editor.updateOptions({ wordWrap: display.wrap ? "on" : "off", lineNumbers: display.lineNumbers ? "on" : "off", guides: { indentation: display.indentationGuides } });
  }, [instance, display]);

  useEffect(() => {
    instance?.editor.updateOptions({ fontSize: editorSize, lineHeight: editorLineHeight(editorSize) });
  }, [instance, editorSize]);

  useEffect(() => {
    const editor = instance?.editor;
    const model = editor?.getModel();
    if (!editor || !model || model.getValue() === code) return;
    const view = editor.saveViewState();
    model.setValue(code);
    if (view) editor.restoreViewState(view);
  }, [code, instance, filePath]);

  useEffect(() => {
    if (!instance) return;
    const { editor, monaco } = instance;
    const model = editor.getModel();
    if (!model) return;
    const decorations = editor.createDecorationsCollection();
    const update = () => decorations.set(visualizedLines(model.getLineCount(), coverage && display.coverage ? lineHits : undefined, failedLines)
      .map(({ line, status }) => ({ range: new monaco.Range(line, 1, line, 1), options: {
        isWholeLine: true, className: `ui-ed-line-${status}`, lineNumberClassName: `ui-ed-number-${status}`,
      } })));
    update();
    const subscription = model.onDidChangeContent(update);
    return () => { subscription.dispose(); decorations.clear(); };
  }, [instance, filePath, coverage, lineHits, failedLines, display.coverage]);

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
      options: { isWholeLine: true, className: "ui-ed-line-flash" },
    }]);
    editor.revealLineInCenter(from);
    const timeout = setTimeout(() => decorations.clear(), 1200);
    return () => { clearTimeout(timeout); decorations.clear(); };
  }, [instance, filePath, highlight]);

  return <div className="ui-ed__code" data-file-path={filePath}>
    <div ref={container} className="ui-ed__monaco" />
    {error ? <div role="alert" className="ui-ed__state">Editor could not load: {error}</div>
      : !instance && <div role="status" className="ui-ed__state">Loading editor…</div>}
  </div>;
}
