import { autocompletion, completionKeymap, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { undo } from "@codemirror/commands";
import { codeFolding, foldGutter, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { linter, lintGutter, type Diagnostic } from "@codemirror/lint";
import { Decoration, EditorView, GutterMarker, gutterLineClass, keymap, type DecorationSet } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import CodeMirror, { RangeSetBuilder, StateField } from "@uiw/react-codemirror";

const vercelDark = EditorView.theme({
  "&": { backgroundColor: "#0a0a0a", color: "#ededed" },
  ".cm-content": { caretColor: "#ededed" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#ededed" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "#ffffff1a",
  },
  ".cm-activeLine": { backgroundColor: "#ffffff1a" },
  ".cm-gutters": {
    backgroundColor: "#0a0a0a",
    borderRight: "1px solid #242424",
    color: "#878787",
  },
  ".cm-activeLineGutter": { backgroundColor: "#ffffff1a", color: "#a1a1a1" },
  ".cm-tooltip": {
    backgroundColor: "#000000",
    border: "0",
    borderRadius: "0",
    boxShadow: "var(--shadow-5)",
    color: "#ededed",
    fontFamily: "Iosevka, monospace",
  },
  ".cm-tooltip-autocomplete": {
    borderLeft: "2px solid #62a6ff",
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
    backgroundColor: "#ffffff1a",
    color: "#ededed",
  },
  ".cm-completionIcon": { color: "#878787", opacity: "1", width: "1.25rem" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionIcon": { color: "#a3a3a3" },
  ".cm-completionLabel": { fontSize: "0.8125rem" },
  ".cm-completionMatchedText": { color: "#62a6ff", fontWeight: "600", textDecoration: "none" },
  ".cm-completionDetail": { color: "#878787", fontStyle: "normal", marginLeft: "1rem" },
  ".cm-tooltip-lint": {
    backgroundColor: "#000000 !important",
    border: "0 !important",
    boxShadow: "var(--shadow-5)",
    maxWidth: "30rem",
    minWidth: "20rem",
  },
  ".cm-tooltip-lint .cm-diagnostic": {
    borderLeft: "2px solid #e5484d",
    lineHeight: "1.5",
    minHeight: "4.5rem",
    padding: "0.75rem 1rem !important",
  },
  ".cm-diagnosticText": { fontFamily: "Iosevka, monospace", fontSize: "0.84375rem" },
  ".cm-diagnosticSource": { color: "#878787", marginTop: "0.375rem" },
  ".cm-gutter-lint": { width: "0.875rem" },
  ".cm-foldGutter": { width: "0.875rem" },
  ".cm-gutter-lint .cm-gutterElement, .cm-foldGutter .cm-gutterElement": { padding: "0 0.125rem" },
  ".cm-lint-marker-error": {
    content: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Ccircle cx='4' cy='4' r='3' fill='%23f05b8d'/%3E%3C/svg%3E\")",
    height: "0.5rem",
    width: "0.5rem",
  },
  ".cm-lintRange-error": { backgroundImage: "none", textDecoration: "underline wavy #e5484d" },
  ".cm-lintRange-warning": { backgroundImage: "none", textDecoration: "underline wavy #f5a623" },
}, { dark: true });

const vercelHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#a1a1a1" },
  { tag: [tags.keyword, tags.operatorKeyword, tags.modifier, tags.controlKeyword], color: "#f05b8d" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName), tags.typeName], color: "#b675f1" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp, tags.tagName], color: "#58c760" },
  { tag: [tags.bool, tags.number, tags.atom, tags.constant(tags.name), tags.propertyName], color: "#62a6ff" },
  { tag: [tags.variableName, tags.name, tags.punctuation], color: "#ededed" },
  { tag: tags.invalid, color: "#f05b8d" },
]);

type CodeEditorProps = {
  code: string;
  coverage: boolean;
  lineHits?: Record<string, number>;
  failedLines?: number[];
  filePath: string;
  language: "javascript" | "typescript" | "python";
  readOnly: boolean;
  onChange: (code: string) => void;
  onUndoReady?: (undoEditor: () => boolean) => void;
};

export default function CodeEditor({
  code,
  coverage,
  lineHits,
  failedLines,
  filePath,
  language,
  readOnly,
  onChange,
  onUndoReady,
}: CodeEditorProps) {
  const languageExtension = language === "python"
    ? python()
    : javascript({ jsx: true, typescript: language === "typescript" });
  const languageTools = language === "typescript" ? typescriptLanguageTools(filePath) : [];

  return (
    <div
      className="h-full min-h-0 overflow-hidden bg-[#0a0a0a]"
      data-file-path={filePath}
      title={`CodeMirror editor: ${filePath}`}
    >
      <CodeMirror
        basicSetup={{
          autocompletion: false,
          bracketMatching: true,
          closeBrackets: true,
          foldGutter: false,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          highlightSelectionMatches: true,
          lineNumbers: true,
          lintKeymap: true,
          searchKeymap: true,
        }}
        editable={!readOnly}
        extensions={[
          languageExtension,
          languageTools,
          preciseFolding,
          coverageExtension(coverage ? lineHits : undefined, failedLines),
          EditorView.contentAttributes.of({ "aria-label": "Solution code" }),
          vercelDark,
          syntaxHighlighting(vercelHighlight),
        ]}
        height="100%"
        onChange={onChange}
        onCreateEditor={(view) => onUndoReady?.(() => undo(view))}
        value={code}
      />
    </div>
  );
}

type CompletionResponse = {
  from: number;
  options: Array<{ label: string; type: string }>;
};

type DiagnosticResponse = Array<Diagnostic & { code: number }>;

function typescriptLanguageTools(filePath: string) {
  return [
    autocompletion({ override: [typescriptCompletions(filePath)] }),
    keymap.of(completionKeymap),
    linter(async (view) => {
      const response = await fetch("/api/lesson/language/diagnostics", {
        body: JSON.stringify({ code: view.state.doc.toString(), filePath }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (!response.ok) return [];
      const diagnostics = await response.json() as DiagnosticResponse;
      return diagnostics.map(({ code, ...diagnostic }) => ({
        ...diagnostic,
        source: `TypeScript ${code}`,
      }));
    }, { delay: 500 }),
    lintGutter(),
  ];
}

function typescriptCompletions(filePath: string) {
  return async (context: CompletionContext): Promise<CompletionResult | null> => {
    const word = context.matchBefore(/[\w$]*/);
    if (!context.explicit && word?.from === word?.to && context.state.sliceDoc(Math.max(0, context.pos - 1), context.pos) !== ".") {
      return null;
    }
    const response = await fetch("/api/lesson/language/completions", {
      body: JSON.stringify({
        code: context.state.doc.toString(),
        filePath,
        position: context.pos,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!response.ok) return null;
    const result = await response.json() as CompletionResponse;
    return { ...result, validFor: /^[\w$]*$/ };
  };
}

const preciseFolding = [
  foldGutter({ markerDOM: (open) => foldMarker(open) }),
  codeFolding({ placeholderDOM: (_view, onClick) => foldPlaceholder(onClick) }),
];

function foldMarker(open: boolean): HTMLElement {
  const marker = document.createElement("span");
  marker.title = open ? "Fold line" : "Unfold line";
  marker.className = "cm-foldControl";
  marker.append(svgIcon(open
    ? "<path d=\"m4 6 4 4 4-4\"/>"
    : "<path d=\"m6 4 4 4-4 4\"/>"));
  return marker;
}

function foldPlaceholder(onClick: (event: Event) => void): HTMLElement {
  const marker = document.createElement("span");
  marker.className = "cm-foldPlaceholder";
  marker.title = "Unfold folded code";
  marker.addEventListener("click", onClick);
  marker.append(svgIcon("<circle cx=\"4\" cy=\"8\" r=\"1\"/><circle cx=\"8\" cy=\"8\" r=\"1\"/><circle cx=\"12\" cy=\"8\" r=\"1\"/>"));
  return marker;
}

function svgIcon(content: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.innerHTML = content;
  return svg;
}

function coverageExtension(lineHits?: Record<string, number>, failedLines: number[] = []) {
  const content = StateField.define<DecorationSet>({
    create(state) {
      return coverageDecorations(state.doc.lines, (line) => state.doc.line(line).from, lineHits, failedLines);
    },
    update(decorations, transaction) {
      return transaction.docChanged
        ? coverageDecorations(transaction.state.doc.lines, (line) => transaction.state.doc.line(line).from, lineHits, failedLines)
        : decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
  const gutters = StateField.define({
    create(state) {
      return coverageGutterMarkers(state.doc.lines, (line) => state.doc.line(line).from, lineHits, failedLines);
    },
    update(markers, transaction) {
      return transaction.docChanged
        ? coverageGutterMarkers(transaction.state.doc.lines, (line) => transaction.state.doc.line(line).from, lineHits, failedLines)
        : markers;
    },
    provide: (field) => gutterLineClass.from(field),
  });
  return [content, gutters];
}

class CoverageGutterMarker extends GutterMarker {
  constructor(readonly elementClass: string) {
    super();
  }

  eq(other: CoverageGutterMarker): boolean {
    return other.elementClass === this.elementClass;
  }
}

const coveredGutterMarker = new CoverageGutterMarker("cm-line-covered");
const failedGutterMarker = new CoverageGutterMarker("cm-line-failed");

function coverageGutterMarkers(
  lineCount: number,
  lineStart: (line: number) => number,
  lineHits?: Record<string, number>,
  failedLines: number[] = [],
) {
  const builder = new RangeSetBuilder<GutterMarker>();
  for (const { line, status } of visualizedLines(lineCount, lineHits, failedLines)) {
    const marker = status === "failed" ? failedGutterMarker : coveredGutterMarker;
    builder.add(lineStart(line), lineStart(line), marker);
  }
  return builder.finish();
}

function coverageDecorations(
  lineCount: number,
  lineStart: (line: number) => number,
  lineHits?: Record<string, number>,
  failedLines: number[] = [],
): DecorationSet {
  return Decoration.set(visualizedLines(lineCount, lineHits, failedLines)
    .map(({ line, status }) => Decoration.line({ attributes: { class: `cm-line-${status}` } }).range(lineStart(line))));
}

function visualizedLines(lineCount: number, lineHits?: Record<string, number>, failedLines: number[] = []) {
  const failed = new Set(failedLines);
  const lines = new Set([
    ...Object.entries(lineHits ?? {}).filter(([, hits]) => hits > 0).map(([line]) => Number(line)),
    ...failedLines,
  ]);
  return [...lines]
    .map((line) => ({
      line,
      status: failed.has(line) ? "failed" : "covered",
    }))
    .filter(({ line }) => Number.isInteger(line) && line > 0 && line <= lineCount)
    .sort((a, b) => a.line - b.line);
}
