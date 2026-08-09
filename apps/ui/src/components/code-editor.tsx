import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { undo } from "@codemirror/commands";
import { codeFolding, foldGutter, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Decoration, EditorView, GutterMarker, gutterLineClass, type DecorationSet } from "@codemirror/view";
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

  return (
    <div
      className="h-full min-h-0 overflow-hidden bg-[#0a0a0a]"
      data-file-path={filePath}
      title={`CodeMirror editor: ${filePath}`}
    >
      <CodeMirror
        basicSetup={{
          autocompletion: true,
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
