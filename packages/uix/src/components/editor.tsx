import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import type * as Monaco from "modern-monaco/editor-core";
import { CloseRegular } from "@mingcute/react/core-regular";
import { editorLineHeight, useEditorScheme, useUiPreferences } from "~/lib/ui-preferences";
// The engine stays in one place – the app's: Monaco runtime and theme, TypeScript tools, hover documentation
import type { CodeHighlight } from "../../../ui/src/lib/code-highlight";
import { attachLanguageTools } from "../../../ui/src/lib/monaco-language-tools";
import { attachDocumentation } from "../../../ui/src/lib/monaco-documentation";

/*
 * Editor – Dojofoo's code editor in uix: file tabs, the Monaco surface and a toolbar in one card. Cloned from the
 * app's CodeEditor and WorkspaceFileTabs with the same behaviour (language tools, hover docs, coverage and failure
 * marks, line flashes, tab drag-and-drop), drawn with the Fluid Functionalism tokens (styles/fluid.css).
 *
 * The card follows the editor's color scheme (Settings → Color scheme): with a dark scheme it is a dark island – it
 * carries the `dark` class and every token inside resolves in dark, on a light page too; a light scheme keeps the
 * page's light tokens. Monaco paints only the syntax: its own backgrounds go transparent on the card, which takes the
 * scheme's background blended with the theme (see the styles). Shadow 3, plus an inner edge drawn over the code so it
 * stays visible on whatever the editor paints.
 *
 *   <Editor tabs={<EditorTabs … />} status={<EditorStatus passed={1} total={3} />}>
 *     <CodeEditor … />
 *   </Editor>
 */

export type EditorLanguage = "javascript" | "json" | "markdown" | "python" | "typescript" | "yaml";

/* ---------- Frame ---------- */

export function Editor({ tabs, status, flush, children, className }: {
  /** The file tabs row, usually EditorTabs */
  tabs?: ReactNode;
  /** A quiet status line along the foot, e.g. EditorStatus for a lesson's tests */
  status?: ReactNode;
  /** Part of the surrounding UI instead of a card: no corners, edge or shadow */
  flush?: boolean;
  /** The code surface, usually CodeEditor */
  children: ReactNode;
  className?: string;
}) {
  // The tab bar belongs to the window, in the page's mode; the code, its status line and the open tab belong to the
  // color scheme – an island of its mode (dark on a light page, light on a dark one), painted with its background and
  // line highlight blended with the theme (see the styles)
  const scheme = schemeColors(useEditorScheme());
  return (
    <section className={["ui-ed", className].filter(Boolean).join(" ")} data-flush={flush || undefined} data-line={scheme.line ? "" : undefined} data-line-border={scheme.lineBorder ? "" : undefined} style={scheme.style}>
      <style href="ui-editor" precedence="default">{css}</style>
      {tabs && <div className="ui-ed__tabs">{tabs}</div>}
      <div className={`ui-ed__body ui-ed__scheme ${scheme.type}`}>{children}</div>
      {status && <footer className={`ui-ed__status ui-ed__scheme ${scheme.type}`}>{status}</footer>}
    </section>
  );
}

/** The scheme's own background and, when solid, how far its line highlight (and that line's border) sits from it in
    lightness – the highlight keeps that step on the blended background, so it reads in every theme. A translucent
    highlight already follows the background it lies on */
function schemeColors(scheme: ReturnType<typeof useEditorScheme>) {
  const colors = (scheme.theme as { colors?: Record<string, string> }).colors ?? {};
  const step = (color?: string) => {
    const lightness = hexLightness(color);
    const base = hexLightness(scheme.surface);
    return lightness === undefined || base === undefined ? undefined : (lightness - base).toFixed(4);
  };
  const line = step(colors["editor.lineHighlightBackground"]);
  const border = step(colors["editor.lineHighlightBorder"]);
  return { type: scheme.type, line, lineBorder: border, style: { "--ui-ed-scheme": scheme.surface, "--ui-ed-line-step": line, "--ui-ed-line-border-step": border, ...(scheme.blend && { "--ui-ed-blend": scheme.blend }) } as CSSProperties };
}

/** OKLab lightness of a solid hex color (#rgb, #rrggbb or #rrggbbff); undefined for anything translucent */
function hexLightness(color?: string) {
  const match = color?.match(/^#([0-9a-f]{3}|[0-9a-f]{6})(ff)?$/i);
  if (!match) return undefined;
  const hex = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
  const [r, g, b] = [0, 2, 4].map((at) => { const c = parseInt(hex.slice(at, at + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

/** How a file's tests stand: a dot (green all, yellow some, red none) and "passed/total tests passed" */
export function EditorStatus({ passed, total, label = "tests passed" }: { passed: number; total: number; label?: string }) {
  const state = total > 0 && passed === total ? "pass" : passed > 0 ? "partial" : "fail";
  return (
    <span className="ui-ed__tests" data-state={state} role="status">
      <span className="ui-ed__dot" aria-hidden="true" />
      <b>{passed}/{total}</b> {label}
    </span>
  );
}

/* ---------- Tabs ---------- */

type Tab = { path: string; label: ReactNode; dirty?: boolean; panelId?: string };
export type EditorTabsProps = {
  tabs: Tab[];
  active: string | null;
  label: string;
  onSelect: (path: string) => void;
} & ({ mode: "learning" } | { mode: "authoring"; onClose: (path: string) => void; onMove: (path: string, index: number) => void });

export function EditorTabs(props: EditorTabsProps) {
  // The open tab is part of the code below it: the color scheme's island, like the editor's body
  const scheme = useEditorScheme();
  const container = useRef<HTMLDivElement>(null);
  const dragged = useRef<string | null>(null);
  const [insertion, setInsertion] = useState<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const clearDrag = () => { dragged.current = null; setDragging(null); setInsertion(null); };
  // Hit-test the gaps, not the tab index: either half of a tab is a drop target.
  const insertionAt = (clientX: number) => {
    const nodes = container.current?.querySelectorAll<HTMLElement>("[data-file-tab]");
    if (!nodes) return 0;
    for (let index = 0; index < nodes.length; index++) {
      const bounds = nodes[index].getBoundingClientRect();
      if (clientX < bounds.left + bounds.width / 2) return index;
    }
    return nodes.length;
  };
  const dragOver = (event: DragEvent<HTMLDivElement>) => {
    if (props.mode !== "authoring" || !dragged.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setInsertion(insertionAt(event.clientX));
  };
  useEffect(() => {
    container.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [props.active, props.tabs.map((tab) => tab.path).join("\0")]);
  return <div ref={container} className="ui-ed__tablist scroll-fade-x" role="tablist" aria-label={props.label}
    onDragOver={dragOver}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setInsertion(null); }}
    onDrop={(event) => {
      if (props.mode !== "authoring" || !dragged.current) return;
      event.preventDefault();
      const source = props.tabs.findIndex((tab) => tab.path === dragged.current);
      const gap = insertionAt(event.clientX);
      // Removing the source shifts every gap to its right one place left.
      if (source >= 0) props.onMove(dragged.current, gap > source ? gap - 1 : gap);
      clearDrag();
    }}>
    {props.tabs.map((tab, index) => {
      const active = props.active === tab.path;
      return <div key={tab.path} data-file-tab={tab.path} className={active ? `ui-ed__tab ui-ed__scheme ${scheme.type}` : "ui-ed__tab"} data-active={active || undefined} data-dragging={dragging === tab.path || undefined}
        draggable={props.mode === "authoring"}
        onDragStart={(event) => { if (props.mode === "authoring") { dragged.current = tab.path; setDragging(tab.path); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", tab.path); } }}
        onDragEnd={clearDrag}>
        {insertion === index || (index === props.tabs.length - 1 && insertion === props.tabs.length)
          ? <span data-testid="tab-insertion-marker" aria-hidden className="ui-ed__marker" data-side={insertion === index ? "start" : "end"} />
          : null}
        <button type="button" role="tab" aria-selected={active} aria-controls={tab.panelId} title={tab.path}
          tabIndex={active ? 0 : -1} className="ui-ed__tab-label"
          onClick={() => props.onSelect(tab.path)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            const next = Math.max(0, Math.min(index + (event.key === "ArrowLeft" ? -1 : 1), props.tabs.length - 1));
            if (event.altKey) { if (props.mode === "authoring") props.onMove(tab.path, next); }
            else { props.onSelect(props.tabs[next].path); (container.current?.querySelectorAll('[role="tab"]')[next] as HTMLButtonElement)?.focus(); }
          }}>
          {tab.label}{tab.dirty ? <span className="sr-only">, unsaved changes</span> : null}
        </button>
        {/* Unsaved changes show as a dot where the close button sits, VS Code's way – it turns back into the close
            button while the pointer is on the tab. Learning tabs have no close button, so the dot sits there alone */}
        {props.mode === "authoring"
          ? <button type="button" aria-label={`Close ${tab.path}`} title="Close tab (keeps unsaved edits)" className="ui-ed__close" data-dirty={tab.dirty || undefined} onClick={() => props.onClose(tab.path)}>
            <CloseRegular size={12} aria-hidden /><span className="ui-ed__dirty" aria-hidden />
          </button>
          : tab.dirty ? <span className="ui-ed__close" data-dirty data-static aria-hidden><span className="ui-ed__dirty" /></span> : null}
      </div>;
    })}
  </div>;
}

/* ---------- Code ---------- */

export type CodeEditorProps = {
  code: string; coverage: boolean; lineHits?: Record<string, number>; failedLines?: number[];
  filePath: string; language: EditorLanguage; lessonApiBase: string; readOnly: boolean;
  documentationUrl?: string;
  onChange: (code: string) => void;
  onUndoReady?: (undoEditor: () => boolean) => void;
  highlight?: CodeHighlight & { nonce: number };
};
type MonacoEditor = Monaco.editor.IStandaloneCodeEditor;

/** The Monaco surface. A new file, language or lesson mounts a fresh editor, so no state leaks across files */
export function CodeEditor(props: CodeEditorProps) {
  return <FileEditor key={`${props.lessonApiBase}:${props.filePath}:${props.language}:${props.readOnly}`} {...props} />;
}

function FileEditor(props: CodeEditorProps) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [instance, setInstance] = useState<{ editor: MonacoEditor; monaco: typeof Monaco }>();
  const [error, setError] = useState<string>();
  // The person's editor size (Brief → Typography); a change resizes the open editor in place
  const { editorSize } = useUiPreferences();
  const size = useRef(editorSize);
  size.current = editorSize;
  // The color scheme (Settings → Color scheme): Monaco takes its theme by name, and the hover layer follows its mode
  const scheme = useEditorScheme();
  const schemeRef = useRef(scheme);
  schemeRef.current = scheme;
  const overlayRef = useRef<HTMLDivElement>(null);
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
    import("../../../ui/src/lib/monaco-runtime").then(({ loadMonaco }) => loadMonaco()).then((monaco) => {
      if (cancelled || !container.current) return;
      // Unique model per mounted file: no shared URI state across lessons/editors.
      const uri = monaco.Uri.from({ scheme: "inmemory", path: `/dojo/${crypto.randomUUID()}/${filePath}` });
      const model = monaco.editor.createModel(latest.current.code, language, uri);
      model.updateOptions({ tabSize: 2, insertSpaces: true });
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
        model, theme: schemeRef.current.theme.name, automaticLayout: true,
        readOnly: latest.current.readOnly, ariaLabel: "Code editor", editContext: false,
        fontFamily: '"Iosevka", ui-monospace, monospace', fontSize: size.current, lineHeight: editorLineHeight(size.current),
        minimap: { enabled: false }, stickyScroll: { enabled: false },
        scrollBeyondLastLine: false, lineNumbersMinChars: 3, lineDecorationsWidth: 14,
        overviewRulerLanes: 0, hideCursorInOverviewRuler: true, overviewRulerBorder: false,
        // The content's scrollbars: a 10px track, a thin pill thumb (styled below), and no shadow under the tabs – the
        // code fades at its edges instead
        scrollbar: { useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10, verticalSliderSize: 6, horizontalSliderSize: 6 },
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
      const scrolls = editor.onDidScrollChange(fade);
      const sizes = editor.onDidContentSizeChange(fade);
      fade();
      setInstance({ editor, monaco });
      // Monaco measures the font when it starts; Iosevka may arrive later, so measure again once it is in
      void document.fonts.ready.then(() => { if (!cancelled) monaco.editor.remeasureFonts(); });
      dispose = () => { hoverUpdates.disconnect(); detachDocs?.(); detach?.(); scrolls.dispose(); sizes.dispose(); changes.dispose(); editor.dispose(); model.dispose(); overlay.remove(); };
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => { cancelled = true; dispose?.(); };
  }, [filePath, language, lessonApiBase, readOnly, documentationUrl]);

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
  }, [code, instance]);

  useEffect(() => {
    if (!instance) return;
    const { editor, monaco } = instance;
    const model = editor.getModel();
    if (!model) return;
    const decorations = editor.createDecorationsCollection();
    const update = () => decorations.set(visualizedLines(model.getLineCount(), coverage ? lineHits : undefined, failedLines)
      .map(({ line, status }) => ({ range: new monaco.Range(line, 1, line, 1), options: {
        isWholeLine: true, className: `ui-ed-line-${status}`, lineNumberClassName: `ui-ed-number-${status}`,
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
      options: { isWholeLine: true, className: "ui-ed-line-flash" },
    }]);
    editor.revealLineInCenter(from);
    const timeout = setTimeout(() => decorations.clear(), 1200);
    return () => { clearTimeout(timeout); decorations.clear(); };
  }, [instance, highlight]);

  return <div className="ui-ed__code" data-file-path={filePath}>
    <div ref={container} className="ui-ed__monaco" />
    {error ? <div role="alert" className="ui-ed__state">Editor could not load: {error}</div>
      : !instance && <div role="status" className="ui-ed__state">Loading editor…</div>}
  </div>;
}

/** Lines to mark: covered by a passing run, or failing */
export function visualizedLines(lineCount: number, lineHits?: Record<string, number>, failedLines: number[] = []) {
  const failed = new Set(failedLines);
  return [...new Set([...Object.entries(lineHits ?? {}).filter(([, hits]) => hits > 0).map(([line]) => Number(line)), ...failedLines])]
    .filter((line) => Number.isInteger(line) && line > 0 && line <= lineCount)
    .sort((a, b) => a - b).map((line) => ({ line, status: failed.has(line) ? "failed" : "covered" }));
}

/* ---------- Styles ---------- */

const css = /* css */ `
/* The card: the tab bar in the window's own color, then the code in the color scheme – its background moved toward
   the theme's card (surface 3) in tint and lightness by --ui-ed-blend (75%; 0% is the scheme as published). Not
   flush, the card has its shadow and a stronger inner edge drawn over the code (5% overlay ring, 3% top light) */
.ui-ed__scheme {
  --ui-ed-surface: color-mix(in oklab, var(--surface-3) var(--ui-ed-blend, 75%), var(--ui-ed-scheme, var(--surface-3)));
  background: var(--ui-ed-surface);
  color: var(--fluid-foreground);
}
.ui-ed__scheme.dark { color-scheme: dark; }
.ui-ed__scheme.light { color-scheme: light; }
.ui-ed {
  --ui-ed-edge: inset 0 0 0 1px rgb(var(--overlay) / 0.05), inset 0 1px 0 0 rgb(var(--overlay) / 0.03);
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: var(--surface-2);
  color: var(--fluid-foreground);
  font-family: var(--ui-font, "Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif);
  font-variation-settings: "opsz" 14;
}
.ui-ed::after {
  content: "";
  position: absolute;
  z-index: 50;
  inset: 0;
  border-radius: inherit;
  box-shadow: var(--ui-ed-edge), var(--shadow-3);
  pointer-events: none;
}
.ui-ed__body { position: relative; flex: 1; min-height: 0; }
/* Flush: part of the surrounding UI – no edge or shadow (the editor is square either way) */
.ui-ed[data-flush]::after { content: none; }

/* Tabs, as in Dojofoo's app: flat cells on the window's own color with a hairline between them, muted, the theme's
   hover tint under the pointer; the open tab is the code's surface, joined to it, with a 2px line in the brand color
   along its top */
/* One line, the window's hairline (taken here, before the scheme's island re-colors it), draws the open tab's outline:
   along the strip's foot – the open tab covers it, so it joins the code – and up both sides of the open tab */
.ui-ed { --ui-ed-line: var(--fluid-hairline); }
.ui-ed__tabs { display: flex; flex: none; height: 40px; background: var(--surface-2); box-shadow: inset 0 -1px 0 var(--ui-ed-line); }
/* The list reaches 1px past both ends of the strip, where the card clips it: a tab's side line at the very edge – the
   first tab's left, the last tab's right once the tabs fill the strip – falls outside, so no line doubles the edge */
.ui-ed__tablist { display: flex; flex: 1; min-width: 0; align-items: stretch; margin: 0 -1px; padding-top: 2px; overflow-x: auto; overflow-y: hidden; scrollbar-width: none; }
.ui-ed__tablist::-webkit-scrollbar { display: none; }
.ui-ed__tab {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  min-width: 0;
  max-width: 220px;
  border-left: 1px solid transparent;
  border-right: 1px solid var(--ui-ed-line);
  color: var(--fluid-muted);
  font-size: var(--fs-caption);
  line-height: var(--lh-caption);
  transition: color var(--motion-fast) var(--ease-fast), background-color var(--motion-fast) var(--ease-fast), box-shadow var(--motion-fast) var(--ease-fast), opacity var(--motion-fast) var(--ease-fast);
}
/* The hover tint fills the strip's top 2px too (the gap the open tab's line sits in), so it reaches the top edge */
.ui-ed__tab:not([data-active]):hover { background: var(--fluid-hover); box-shadow: 0 -2px 0 var(--fluid-hover); color: var(--fluid-foreground); }
/* The brand line sits above the open tab, in the strip's 2px of top padding – a shadow, not a border, as wide as the tab
   with its side lines, so the corners stay square – and glows softly down into the tab */
.ui-ed__tab[data-active] {
  border-left-color: var(--ui-ed-line);
  border-right-color: var(--ui-ed-line);
  box-shadow: 0 -2px 0 var(--brand), inset 0 10px 10px -10px color-mix(in oklab, var(--brand) 18%, transparent);
}
/* The tab before the open one gives up its separator, so the open tab's own side isn't doubled */
.ui-ed__tab:has(+ .ui-ed__tab[data-active]) { border-right-color: transparent; }
/* A separator runs to the strip's top edge: the 2px above the tabs (where the open tab's line sits) is drawn on */
.ui-ed__tab:not([data-active])::after { content: ""; position: absolute; top: -2px; right: -1px; width: 1px; height: 2px; background: var(--ui-ed-line); }
.ui-ed__tab:has(+ .ui-ed__tab[data-active])::after { content: none; }
.ui-ed__tab[data-dragging] { opacity: 0.4; }
.ui-ed__tab-label { all: unset; box-sizing: border-box; position: relative; z-index: 1; display: flex; align-items: center; gap: 6px; min-width: 0; height: 100%; padding: 0 6px 0 16px; cursor: pointer; }
.ui-ed__tab-label:focus-visible { outline: 1px solid var(--focus-ring); outline-offset: -4px; border-radius: 6px; }
.ui-ed__tab:not(:has(.ui-ed__close)) .ui-ed__tab-label { padding-right: 16px; }
.ui-ed__close {
  all: unset;
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin: 0 6px 0 0;
  border-radius: 50%;
  color: var(--fluid-muted);
  cursor: pointer;
  transition: opacity var(--motion-fast) var(--ease-fast), background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast);
}
/* Close is always there on every tab – an edited tab shows its dot in its place until the pointer reaches it */
.ui-ed__close:not([data-static]):hover { background: var(--active); color: var(--fluid-foreground); }
.ui-ed__close[data-static] { cursor: default; }
/* Unsaved: the dot, in the brand's color, holds the close button's place; the tab under the pointer (or the button
   in focus) swaps it for the cross and back – a quick crossfade on Fluid's fast tier: what arrives fades and grows in
   on the enter spring, what leaves fades out on the quicker exit tween */
.ui-ed__close > * { grid-area: 1 / 1; }
.ui-ed__dirty { width: 8px; height: 8px; border-radius: 50%; background: var(--brand); opacity: 0; }
/* At rest: the dot in, the cross out */
.ui-ed__close[data-dirty] > .ui-ed__dirty { opacity: 1; scale: 1; transition: opacity var(--motion-fast) var(--ease-fast), scale var(--motion-fast) var(--ease-fast); }
.ui-ed__close[data-dirty]:not([data-static]) > svg { opacity: 0; scale: 0.8; transition: opacity var(--motion-fast-exit) var(--ease-exit), scale var(--motion-fast-exit) var(--ease-exit); }
/* Hovered: the cross in, the dot out */
.ui-ed__tab:hover > .ui-ed__close[data-dirty]:not([data-static]) > svg, .ui-ed__close[data-dirty]:focus-visible > svg { opacity: 1; scale: 1; transition: opacity var(--motion-fast) var(--ease-fast), scale var(--motion-fast) var(--ease-fast); }
.ui-ed__tab:hover > .ui-ed__close[data-dirty]:not([data-static]) > .ui-ed__dirty, .ui-ed__close[data-dirty]:focus-visible > .ui-ed__dirty { opacity: 0; scale: 0.5; transition: opacity var(--motion-fast-exit) var(--ease-exit), scale var(--motion-fast-exit) var(--ease-exit); }
@media (prefers-reduced-motion: reduce) { .ui-ed__close > * { transition-duration: 0s !important; } }
.ui-ed__close:focus-visible { outline: 1px solid var(--focus-ring); }
.ui-ed__marker { position: absolute; z-index: 2; top: 4px; bottom: 6px; width: 2px; border-radius: 1px; background: var(--focus-ring); pointer-events: none; }
.ui-ed__marker[data-side="start"] { left: -1px; }
.ui-ed__marker[data-side="end"] { right: -1px; }

/* Status: a quiet line along the foot – how the file's tests stand */
.ui-ed__status { display: flex; flex: none; align-items: center; gap: 12px; height: 28px; padding: 0 12px; box-shadow: inset 0 1px 0 var(--fluid-hairline); color: var(--fluid-muted); font-size: var(--fs-caption); line-height: var(--lh-caption); }
.ui-ed__tests { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.ui-ed__tests b { color: var(--fluid-foreground); font-weight: 550; font-variation-settings: "opsz" 18; }
.ui-ed__dot { width: 6px; height: 6px; border-radius: 50%; background: #f87171; }
.ui-ed__tests[data-state="partial"] .ui-ed__dot { background: #fbbf24; }
.ui-ed__tests[data-state="pass"] .ui-ed__dot { background: #4ade80; }

/* The code: Monaco on the card's surface – its own backgrounds go transparent */
.ui-ed__code { position: relative; height: 100%; min-height: 0; overflow: hidden; }
/* The scroll fade, as on every scrolling area: 48px of the editor's own background over the code at an edge with more to
   scroll, shown as far as there is (--ui-ed-fade-*: 1 = none). A layer rather than a mask, so the scrollbars can sit
   above it – they stay solid while the code under them fades */
.ui-ed__code::before, .ui-ed__code::after { content: ""; position: absolute; z-index: 10; left: 0; right: 0; height: 48px; pointer-events: none; }
.ui-ed__code::before { top: 0; background: linear-gradient(to bottom, var(--ui-ed-surface), transparent); opacity: calc(1 - var(--ui-ed-fade-start, 1)); }
.ui-ed__code::after { bottom: 0; background: linear-gradient(to top, var(--ui-ed-surface), transparent); opacity: calc(1 - var(--ui-ed-fade-end, 1)); }
.ui-ed .monaco-scrollable-element > .scrollbar { z-index: 11; }
/* Scrollbars as the content's (styles/fluid.css): transparent track, a thin pill at 8% of the ink, 12% on hover, 16% while
   dragging – Monaco draws its own, so they're set on its slider */
.ui-ed .monaco-editor {
  --vscode-scrollbar-shadow: transparent;
  --vscode-scrollbarSlider-background: rgb(var(--overlay) / 0.08);
  --vscode-scrollbarSlider-hoverBackground: rgb(var(--overlay) / 0.12);
  --vscode-scrollbarSlider-activeBackground: rgb(var(--overlay) / 0.16);
}
.ui-ed .monaco-scrollable-element > .scrollbar { background: transparent; }
.ui-ed .monaco-scrollable-element > .scrollbar > .slider { border-radius: 9999px; }
.ui-ed__monaco { height: 100%; min-height: 0; }
.ui-ed__state { position: absolute; inset: 0; padding: 16px; color: var(--fluid-muted); font-size: var(--fs-body); }
.ui-ed .monaco-editor {
  --vscode-editor-background: transparent;
  --vscode-editorGutter-background: transparent;
  --vscode-editorStickyScroll-background: var(--ui-ed-surface);
}
/* A solid line highlight moves with the background: the blended surface, stepped in lightness as far as the scheme
   steps it from its own background. Monaco writes the scheme's color into its own rules, so these override the lines */
.ui-ed[data-line] .monaco-editor :is(.view-overlays .current-line, .margin-view-overlays .current-line-margin) {
  background-color: oklch(from var(--ui-ed-surface) calc(l + var(--ui-ed-line-step)) c h);
}
.ui-ed[data-line-border] .monaco-editor :is(.view-overlays .current-line, .margin-view-overlays .current-line-margin) {
  border-color: oklch(from var(--ui-ed-surface) calc(l + var(--ui-ed-line-border-step)) c h);
}
.ui-ed .monaco-editor .margin { border: none; }
/* Marks: lines a passing run covered, lines that fail, and a flash where Kyoshi points */
.ui-ed .ui-ed-line-covered { background: rgb(88 199 96 / 6%); }
.ui-ed .ui-ed-line-failed { background: rgb(240 91 141 / 14%); }
.ui-ed .ui-ed-number-covered { color: #6f9f72 !important; }
.ui-ed .ui-ed-number-failed { color: #f05b8d !important; }
.ui-ed .ui-ed-line-flash { animation: ui-ed-line-flash 1.2s ease-out; }
@keyframes ui-ed-line-flash {
  0%, 35% { background: color-mix(in oklab, var(--focus-ring), transparent 60%); }
  100% { background: transparent; }
}

/* Hovers and suggestions: a popover's surface (level 5, shadow 4) with the library's 8px corner */
.ui-ed-overlays { position: fixed; inset: 0; z-index: 1000; pointer-events: none; }
.ui-ed-overlays .monaco-editor {
  --vscode-editorHoverWidget-background: var(--surface-5);
  --vscode-editorHoverWidget-border: var(--fluid-hairline);
  --vscode-editorSuggestWidget-background: var(--surface-5);
  --vscode-editorSuggestWidget-border: var(--fluid-hairline);
  --vscode-editorSuggestWidget-selectedBackground: var(--active);
  --vscode-list-hoverBackground: var(--hover);
}
.ui-ed-overlays .monaco-hover, .ui-ed-overlays .suggest-widget { pointer-events: auto; }
.ui-ed-overlays .monaco-editor .suggest-widget,
.ui-ed-overlays .monaco-editor .monaco-hover,
.ui-ed-overlays .monaco-editor .monaco-resizable-hover { border-radius: 8px; overflow: hidden; }
.ui-ed-overlays .monaco-editor .suggest-widget { box-shadow: var(--shadow-4); }
.ui-ed-overlays .monaco-editor .monaco-resizable-hover {
  box-shadow: var(--shadow-4);
  /* This is the border-bearing wrapper, not .monaco-hover. Its native 250px resize limit must not truncate the
     taller segmented card. */
  height: auto !important;
  max-width: min(520px, calc(100vw - 32px)) !important;
  box-sizing: border-box;
}
.ui-ed-overlays .monaco-editor .monaco-hover {
  --ui-ed-hover-height: min(440px, 70vh);
  max-width: min(520px, calc(100vw - 32px)) !important;
  box-sizing: border-box;
}
.ui-ed-overlays .monaco-resizable-hover > .monaco-hover { position: relative; max-width: 100% !important; }
.ui-ed-overlays .monaco-hover,
.ui-ed-overlays .monaco-hover .monaco-scrollable-element,
.ui-ed-overlays .monaco-hover .monaco-hover-content {
  max-height: var(--ui-ed-hover-height) !important;
  height: auto !important;
}
.ui-ed-overlays .monaco-hover .monaco-scrollable-element,
.ui-ed-overlays .monaco-hover .monaco-hover-content {
  /* Monaco assigns pixel widths before our card cap is applied. Keep the inner scroll viewport inside the border,
     including at narrow widths. */
  max-width: 100% !important;
  box-sizing: border-box;
}
.ui-ed-overlays .monaco-hover .hover-row-contents { display: flex; flex-direction: column; max-height: calc(var(--ui-ed-hover-height) - 2px); min-width: 0; }
.ui-ed-overlays .monaco-hover .hover-row,
.ui-ed-overlays .monaco-hover .markdown-hover { max-width: 100%; box-sizing: border-box; overflow-wrap: anywhere; }
/* Segments: the signature in mono, the documentation in Inter (it scrolls on its own), then one-line parameters */
.ui-ed-overlays .monaco-hover .markdown-hover { padding: 6px 10px; font-family: var(--font-mono); flex: 0 0 auto; min-width: 0; }
.ui-ed-overlays .monaco-hover .markdown-hover + .markdown-hover { border-top: 1px solid var(--fluid-hairline); }
.ui-ed-overlays .monaco-hover .markdown-hover p { font-family: inherit; line-height: 1.4; margin: 4px 0; }
.ui-ed-overlays .monaco-hover .markdown-hover .hover-contents { padding: 0; }
.ui-ed-overlays .monaco-hover .markdown-hover:nth-child(2) {
  font-family: var(--ui-font, "Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif);
  font-size: var(--fs-body);
  line-height: var(--lh-body);
  max-height: min(300px, 45vh);
  min-height: 0;
  flex: 0 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.ui-ed-overlays .monaco-hover .markdown-hover pre,
.ui-ed-overlays .monaco-hover .markdown-hover code,
.ui-ed-overlays .monaco-hover .markdown-hover .monaco-tokenized-source { white-space: pre-wrap; overflow-wrap: anywhere; }
.ui-ed-overlays .monaco-hover .markdown-hover pre,
.ui-ed-overlays .monaco-hover .markdown-hover .monaco-tokenized-source {
  box-sizing: border-box;
  max-width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--hover);
}
.ui-ed-overlays .monaco-hover .markdown-hover:first-child .monaco-tokenized-source { padding: 0; border-radius: 0; background: transparent; box-shadow: none; }
.ui-ed-overlays .monaco-hover .markdown-hover p > code { font-family: var(--font-mono); padding: 1px 4px; border-radius: 4px; background: var(--hover); }
.ui-ed-overlays .monaco-hover .markdown-hover a { text-decoration: underline; text-decoration-color: color-mix(in oklab, currentColor 35%, transparent); text-underline-offset: 0.2em; }
.ui-ed-overlays .monaco-hover .markdown-hover:nth-child(n + 3) .rendered-markdown { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ui-ed-overlays .monaco-hover .markdown-hover:nth-child(n + 3) p { display: inline; }
.ui-ed-overlays .monaco-hover .markdown-hover:nth-child(n + 3) p + p { margin-inline-start: 6px; }
.ui-ed-overlays .monaco-hover .markdown-hover:nth-child(n + 3) code { white-space: inherit; }
.ui-ed-overlays .monaco-hover .markdown-hover:first-child,
.ui-ed-overlays .monaco-hover .markdown-hover:nth-child(n + 3) { font-size: var(--fs-subtitle); line-height: var(--lh-subtitle); }
.ui-ed-overlays .monaco-hover .markdown-hover:first-child .monaco-tokenized-source { font-size: var(--fs-subtitle) !important; line-height: var(--lh-subtitle) !important; }
`;
