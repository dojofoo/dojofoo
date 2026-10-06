import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState } from "react";
import CodeEditor, { type CodeEditorLanguage } from "./code-editor";

const samples: Record<string, { language: CodeEditorLanguage; code: string }> = {
  "solution.ts": { language: "typescript", code: 'export function greet(name: string) {\n  return `Hello ${name}`;\n}\n' },
  "DOJO.md": { language: "markdown", code: "# Practice\n\nTeach **one concept** at a time.\n" },
  "dojo.yaml": { language: "yaml", code: "title: Practice\nlessons:\n  - title: Greetings\n" },
  "package.json": { language: "json", code: '{\n  "name": "practice"\n}\n' },
  "solution.py": { language: "python", code: 'def greet(name):\n    return f"Hello {name}"\n' },
  "solution.js": { language: "javascript", code: 'export const greet = name => `Hello ${name}`;\n' },
  "long.yaml": { language: "yaml", code: Array.from({ length: 300 }, (_, i) => `item${i}: value-${i}`).join("\n") },
};
const meta = { title: "Components/Code Editor", component: CodeEditor,
  args: { readOnly: false, coverage: true, code: "", filePath: "solution.ts", language: "typescript", lessonApiBase: "", onChange: () => {} }, parameters: { layout: "fullscreen" },
  render: (args) => <EditorFixture readOnly={args.readOnly} coverage={args.coverage} />,
} satisfies Meta<typeof CodeEditor>;
export default meta;
export const Workspace: StoryObj<typeof meta> = {};

function EditorFixture({ readOnly, coverage }: { readOnly: boolean; coverage: boolean }) {
  const [files, setFiles] = useState(samples);
  const [file, setFile] = useState("solution.ts");
  const [saved, setSaved] = useState("");
  const [nonce, setNonce] = useState(0);
  const undo = useRef<() => boolean>(() => false);
  const current = files[file]!;
  useEffect(() => {
    const save = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault(); setSaved(`${file}: ${current.code}`);
      }
    };
    window.addEventListener("keydown", save);
    return () => window.removeEventListener("keydown", save);
  }, [file, current.code]);
  return <div className="flex h-screen flex-col bg-background text-foreground">
    <nav className="flex flex-wrap gap-4 p-3" aria-label="Editor fixture files">
      {Object.keys(files).map((name) => <button key={name} onClick={() => setFile(name)}>{name}</button>)}
      <button onClick={() => undo.current()}>Undo</button>
      <button onClick={() => setFiles(samples)}>Reset</button>
      <button onClick={() => setNonce((n) => n + 1)}>Highlight line 2</button>
    </nav>
    <div className="min-h-0 flex-1">
      <CodeEditor {...{ readOnly, coverage }} code={current.code} language={current.language}
        filePath={file} lessonApiBase="/editor-fixture" lineHits={{ "1": 1, "2": 1 }} failedLines={[3]}
        onChange={(code) => setFiles((previous) => ({ ...previous, [file]: { ...current, code } }))}
        onUndoReady={(fn) => { undo.current = fn; }} highlight={nonce ? { from: 2, to: 2, nonce } : undefined} />
    </div>
    <output aria-label="Current source" className="sr-only">{current.code}</output>
    <output aria-label="Saved source" className="sr-only">{saved}</output>
  </div>;
}
