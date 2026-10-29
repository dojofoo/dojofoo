import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef, useState } from "react";
import { Button } from "../components/button";
import { EditorTestResults, type EditorTestResult } from "../components/editor-test-results";
import { CodeEditor, Editor, EditorStatus, EditorTabs, type EditorLanguage } from "../containers/editor";

const source = `/**
 * Keep positive readings without changing the input.
 * @param readings - A list of measurements.
 * @example
 * positive([3, -1, 0, 8]);
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
 */
export function positive(readings: number[]): number[] {
  return readings.filter(value => value >= 0);
}
`;
const samples: Record<string, { language: EditorLanguage; code: string; readOnly?: boolean }> = {
  "kata.ts": { language: "typescript", code: source },
  "kata.test.ts": { language: "typescript", readOnly: true, code: `import { expect, it } from "vitest";
import { positive } from "./kata";

it("keeps positive readings", () => {
  expect(positive([3, -1, 0, 8])).toEqual([3, 8]);
});
` },
  "README.md": { language: "markdown", code: "# Positive readings\n\nKeep values **greater than zero**, without changing the input.\n" },
  "dojo.yaml": { language: "yaml", code: "title: Positive readings\nlanguage: typescript\nlessons:\n  - kata.ts\n" },
  "package.json": { language: "json", code: '{\n  "name": "positive-readings",\n  "private": true\n}\n' },
  "kata.js": { language: "javascript", code: "/** Keep readings greater than zero. */\nexport const positive = readings => readings.filter(value => value > 0);\n" },
  "kata.py": { language: "python", code: 'def positive(readings):\n    """Keep readings greater than zero."""\n    return [value for value in readings if value > 0]\n' },
};
const exampleTests: EditorTestResult[] = [
  { suite: "positive", name: "keeps positive readings", status: "failed", durationMs: 4,
    message: "AssertionError: zero is not a positive reading. The result includes 0 because the current predicate uses `value >= 0`; only readings greater than zero should be returned, without changing the original list.", expected: "[3, 8]", received: "[3, 0, 8]",
    location: { filePath: "kata.ts", line: 9 } },
  { suite: "positive", name: "handles an empty list", status: "passed", durationMs: 1 },
  { suite: "positive", name: "leaves the input unchanged", status: "passed", durationMs: 1 },
  { suite: "positive", name: "handles non-finite readings", status: "skipped" },
];
function EditorExample({ readOnly = false, coverage = true, lessonApiBase = "/uix-language", documentationUrl = "" }) {
  const [files, setFiles] = useState(samples);
  const [saved, setSaved] = useState(samples);
  const [filePath, setFilePath] = useState("kata.ts");
  const [view, setView] = useState("kata.ts");
  const [highlight, setHighlight] = useState<{ from: number; to: number; nonce: number }>();
  const undo = useRef<() => boolean>(() => false);
  const file = files[filePath];
  const select = (path: string) => {
    setView(path);
    if (path !== "results") { setFilePath(path); setHighlight(undefined); }
  };
  const reveal = (path = "kata.ts", line = 9) => {
    setFilePath(path); setView(path);
    setHighlight({ from: line, to: line, nonce: Date.now() });
  };
  return <div className="flex h-dvh flex-col gap-3 p-5">
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={() => reveal()}>Highlight lines</Button>
      <span role="status">{file.code === saved[filePath].code ? "Saved" : "Unsaved edits · ⌘/Ctrl S"}</span>
    </div>
    <p className="text-sm text-[var(--fluid-muted)]">Hover a symbol for JSDoc, examples and references. Edit TypeScript for diagnostics; use Ctrl Space for completion. The test file is read-only; test results are sample output.</p>
    <Editor className="flex-1" tabs={<EditorTabs mode="learning" label="Lesson files" active={view}
      tabs={[...Object.keys(files).map(path => ({ path, label: path, dirty: files[path].code !== saved[path].code })), { path: "results", label: "Test results · 2/4" }]} onSelect={select} />}
      actions={<div role="toolbar" aria-label="File actions" className="flex items-center gap-2">
        <Button size="sm" variant="ghost" disabled={view === "results" || readOnly || file.readOnly} onClick={() => undo.current()}>Undo edit</Button>
        <Button size="sm" variant="ghost" onClick={() => { setFiles(samples); setSaved(samples); }}>Reset files</Button>
      </div>}
      status={view !== "results" ? <EditorStatus passed={2} total={4} /> : undefined}>
      <div hidden={view === "results"} className="h-full" role="tabpanel" aria-label={filePath}>
        <CodeEditor code={file.code} onChange={code => setFiles(current => ({ ...current, [filePath]: { ...current[filePath], code } }))}
          onSave={code => setSaved(current => ({ ...current, [filePath]: { ...files[filePath], code } }))}
          onUndoReady={fn => { undo.current = fn; }}
          filePath={filePath} language={file.language} readOnly={readOnly || !!file.readOnly} coverage={coverage}
          lineHits={filePath === "kata.ts" ? { 8: 1, 9: 2 } : undefined} failedLines={filePath === "kata.ts" ? [9] : undefined} highlight={highlight}
          lessonApiBase={lessonApiBase} documentationUrl={documentationUrl || undefined} />
      </div>
      {view === "results" && <EditorTestResults tests={exampleTests} onReveal={({ filePath, line }) => reveal(filePath, line)} />}
    </Editor>
  </div>;
}
const meta = {
  title: "Components/Organisms/Editor", component: EditorExample,
  parameters: { layout: "fullscreen" },
  args: { readOnly: false, coverage: true, lessonApiBase: "/uix-language", documentationUrl: "" },
  argTypes: { readOnly: { control: "boolean" }, coverage: { control: "boolean" }, lessonApiBase: { control: "text" }, documentationUrl: { control: "text" } },
} satisfies Meta<typeof EditorExample>;
export default meta;
export const Playground: StoryObj<typeof meta> = {};
