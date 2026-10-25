import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "~/components/button";
import { CodeEditor, Editor, EditorStatus, EditorTabs } from "~/containers/editor";

const source = `/**
 * Keep positive readings without changing the input.
 * @param readings - A list of measurements.
 * @example
 * positive([3, -1, 0, 8]);
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter
 */
export function positive(readings: number[]): number[] {
  return readings.filter(value => value > 0);
}
`;
function EditorExample({ readOnly = false, coverage = true, lessonApiBase = "", documentationUrl = "" }) {
  const [code, setCode] = useState(source);
  const [saved, setSaved] = useState(source);
  const [highlight, setHighlight] = useState<{ from: number; to: number; nonce: number }>();
  const [undo, setUndo] = useState<() => boolean>();
  return <div className="flex h-dvh flex-col gap-3 p-5">
    <div className="flex gap-2">
      <Button size="sm" onClick={() => setHighlight({ from: 9, to: 11, nonce: Date.now() })}>Highlight lines</Button>
      <Button size="sm" variant="secondary" onClick={() => undo?.()}>Undo edit</Button>
      <span role="status">{code === saved ? "Saved" : "Unsaved edits · ⌘/Ctrl S"}</span>
    </div>
    <Editor className="flex-1" tabs={<EditorTabs mode="learning" label="Lesson files" active="kata.ts" tabs={[{ path: "kata.ts", label: "kata.ts", dirty: code !== saved }]} onSelect={() => {}} />}
      status={<EditorStatus passed={2} total={3} />}>
      <CodeEditor code={code} onChange={setCode} onSave={setSaved} onUndoReady={fn => setUndo(() => fn)}
        filePath="kata.ts" language="typescript" readOnly={readOnly} coverage={coverage}
        lineHits={{ 9: 1, 10: 2 }} failedLines={[11]} highlight={highlight}
        lessonApiBase={lessonApiBase} documentationUrl={documentationUrl || undefined} />
    </Editor>
  </div>;
}
const meta = {
  title: "Components/Editor", component: EditorExample,
  parameters: { layout: "fullscreen" },
  args: { readOnly: false, coverage: true, lessonApiBase: "", documentationUrl: "" },
  argTypes: { readOnly: { control: "boolean" }, coverage: { control: "boolean" }, lessonApiBase: { control: "text" }, documentationUrl: { control: "text" } },
} satisfies Meta<typeof EditorExample>;
export default meta;
export const Playground: StoryObj<typeof meta> = {};
