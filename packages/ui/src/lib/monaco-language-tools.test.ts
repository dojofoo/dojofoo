import { afterEach, expect, it, vi } from "vitest";
import type * as Monaco from "modern-monaco/editor-core";
import { attachLanguageTools, diagnosticMarkers } from "./monaco-language-tools";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function fixture() {
  let code = "old";
  let version = 1;
  let change = () => {};
  let provider: Monaco.languages.CompletionItemProvider;
  const model = {
    getValue: () => code, getVersionId: () => version,
    getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }),
    getOffsetAt: ({ column }: { column: number }) => column - 1,
    onDidChangeContent: (listener: () => void) => { change = listener; return { dispose: vi.fn() }; },
  } as unknown as Monaco.editor.ITextModel;
  const markers = vi.fn();
  const unregister = vi.fn();
  const monaco = {
    MarkerSeverity: { Error: 8, Warning: 4, Info: 2 },
    editor: { setModelMarkers: markers },
    languages: { CompletionItemKind: { Method: 0, Variable: 1 }, registerCompletionItemProvider: (_: string, value: typeof provider) => {
      provider = value; return { dispose: unregister };
    } },
    Range: class { constructor(public startLineNumber: number, public startColumn: number, public endLineNumber: number, public endColumn: number) {} },
  } as unknown as typeof Monaco;
  return { model, monaco, markers, unregister, provider: () => provider,
    edit: (next: string) => { code = next; version++; change(); } };
}

it("maps diagnostic offsets, severity and TypeScript codes to native Monaco markers", () => {
  const { model, monaco } = fixture();
  expect(diagnosticMarkers(monaco, model, [{ from: 0, to: 3, code: 2304, severity: "error", message: "Unknown" }]))
    .toEqual([{ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4,
      severity: 8, source: "TypeScript", code: "2304", message: "Unknown" }]);
});

it("aborts old diagnostics, rejects late results, and disposes providers on file changes", async () => {
  vi.useFakeTimers();
  const responses: Array<(value: unknown) => void> = [];
  const fetch = vi.fn((_url, _options) => new Promise((resolve) => responses.push(resolve)));
  vi.stubGlobal("fetch", fetch);
  const f = fixture();
  const detach = attachLanguageTools(f.monaco, f.model, "solution.ts", "/lesson/a");
  await vi.advanceTimersByTimeAsync(500);
  f.edit("new");
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(500);
  responses[0]({ ok: true, json: async () => [{ from: 0, to: 3, severity: "error", message: "old", code: 1 }] });
  await vi.advanceTimersByTimeAsync(0);
  expect(f.markers.mock.calls.every((call) => call[2].length === 0)).toBe(true);
  detach();
  responses[1]({ ok: true, json: async () => [{ from: 0, to: 3, severity: "error", message: "new", code: 2 }] });
  await vi.advanceTimersByTimeAsync(0);
  expect(f.unregister).toHaveBeenCalledOnce();
  expect(f.markers.mock.calls.every((call) => call[2].length === 0)).toBe(true);
});

it("never serves completions from a different lesson's model", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const f = fixture();
  const detach = attachLanguageTools(f.monaco, f.model, "solution.ts", "/lesson/a");
  const result = await f.provider().provideCompletionItems({} as Monaco.editor.ITextModel,
    { lineNumber: 1, column: 1 } as Monaco.Position, {} as Monaco.languages.CompletionContext, {} as Monaco.CancellationToken);
  expect(result).toEqual({ suggestions: [] });
  expect(fetch).not.toHaveBeenCalled();
  detach();
});
