import type * as Monaco from "modern-monaco/editor-core";
import type { TypeScriptDiagnostic } from "../server/lesson/typescript-language-service";

type API = typeof Monaco;
type Model = Monaco.editor.ITextModel;

export function diagnosticMarkers(monaco: API, model: Model, diagnostics: TypeScriptDiagnostic[]) {
  return diagnostics.map(({ from, to, severity, message, code }) => {
    const start = model.getPositionAt(from);
    const end = model.getPositionAt(to);
    return { startLineNumber: start.lineNumber, startColumn: start.column,
      endLineNumber: end.lineNumber, endColumn: end.column, message, code: String(code),
      source: "TypeScript", severity: severity === "error" ? monaco.MarkerSeverity.Error
        : severity === "warning" ? monaco.MarkerSeverity.Warning : monaco.MarkerSeverity.Info };
  });
}

/** Keep installed project types on the server; scope every provider to its model. */
export function attachLanguageTools(monaco: API, model: Model, filePath: string, apiBase: string) {
  let disposed = false;
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout>;
  const request = async (method: string, signal: AbortSignal, extra = {}) => {
    const response = await fetch(`${apiBase}/files/solution/${method}`, {
      method: "POST", headers: { "content-type": "application/json" }, signal,
      body: JSON.stringify({ code: model.getValue(), filePath, ...extra }),
    });
    if (!response.ok) throw new Error(`TypeScript ${method}: ${response.status}`);
    return response.json();
  };
  const schedule = () => {
    clearTimeout(timer);
    controller?.abort();
    monaco.editor.setModelMarkers(model, "dojo-typescript", []);
    timer = setTimeout(async () => {
      const current = controller = new AbortController();
      const version = model.getVersionId();
      try {
        const diagnostics = await request("diagnostics", current.signal);
        if (!disposed && !current.signal.aborted && model.getVersionId() === version) {
          monaco.editor.setModelMarkers(model, "dojo-typescript", diagnosticMarkers(monaco, model, diagnostics));
        }
      } catch (error) {
        if (!current.signal.aborted) console.warn("Editor diagnostics unavailable", error);
      }
    }, 500);
  };
  const subscription = model.onDidChangeContent(schedule);
  schedule();
  const kinds = monaco.languages.CompletionItemKind;
  const completionKinds: Record<string, Monaco.languages.CompletionItemKind> = {
    class: kinds.Class, constant: kinds.Constant, function: kinds.Function,
    interface: kinds.Interface, keyword: kinds.Keyword, method: kinds.Method,
    property: kinds.Property, type: kinds.TypeParameter, variable: kinds.Variable,
  };
  const completions = monaco.languages.registerCompletionItemProvider("typescript", {
    triggerCharacters: ["."],
    async provideCompletionItems(candidate, position, _context, token) {
      if (candidate !== model || disposed) return { suggestions: [] };
      const abort = new AbortController();
      const cancellation = token.onCancellationRequested(() => abort.abort());
      const version = model.getVersionId();
      try {
        const result = await request("completions", abort.signal, { position: model.getOffsetAt(position) });
        if (disposed || token.isCancellationRequested || version !== model.getVersionId()) return { suggestions: [] };
        const from = model.getPositionAt(result.from);
        return { suggestions: result.options.map((option: { label: string; type: string }) => ({
          label: option.label, insertText: option.label, kind: completionKinds[option.type] ?? kinds.Variable,
          range: new monaco.Range(from.lineNumber, from.column, position.lineNumber, position.column),
        })) };
      } catch (error) {
        if (!abort.signal.aborted) console.warn("Editor completions unavailable", error);
        return { suggestions: [] };
      } finally { cancellation.dispose(); }
    },
  });
  return () => {
    disposed = true;
    clearTimeout(timer);
    controller?.abort();
    subscription.dispose();
    completions.dispose();
    monaco.editor.setModelMarkers(model, "dojo-typescript", []);
  };
}
