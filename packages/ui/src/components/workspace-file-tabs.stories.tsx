import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { WorkspaceFileTabs } from "./workspace-file-tabs";
import { useAuthoringFiles } from "../hooks/use-authoring-files";

const files = [
  { path: "dojo.yaml", label: "dojo.yaml", content: "name: Example" },
  { path: "DOJO.md", label: "DOJO.md", content: "# Course" },
  { path: "lesson/SENSEI.md", label: "SENSEI.md", content: "# Teach" },
];
const meta = { title: "Components/Workspace Files", component: WorkspaceFileTabs, parameters: { layout: "fullscreen" } } satisfies Meta<typeof WorkspaceFileTabs>;
export default meta;
export const Authoring: StoryObj = { render: () => <AuthoringFixture /> };
export const Learning: StoryObj = { render: () => <LearningFixture /> };

function AuthoringFixture() {
  const state = useAuthoringFiles(files);
  return <div className="p-6">
    <nav className="mb-5 flex gap-4" aria-label="Available files">{files.map((file) => <button key={file.path} onClick={() => state.open(file.path)}>Open {file.label}</button>)}</nav>
    <div className="flex h-10"><WorkspaceFileTabs mode="authoring" label="Authoring workspace" active={state.tabs.active}
      tabs={state.tabs.paths.map((path) => ({ ...files.find((file) => file.path === path)!, dirty: state.dirty(files.find((file) => file.path === path)!) }))}
      onSelect={state.open} onClose={state.close} onMove={state.move} /></div>
    {state.activeFile ? <textarea className="h-40 w-full bg-background p-4" aria-label="File content" value={state.draft} onChange={(event) => state.setDraft(event.target.value)} /> : <p>No open files</p>}
  </div>;
}
function LearningFixture() {
  const [active, setActive] = useState("solution.ts");
  return <div className="flex h-10"><WorkspaceFileTabs mode="learning" label="Lesson workspace" active={active} onSelect={setActive} tabs={[{ path: "solution.ts", label: "solution.ts" }, { path: "tests", label: "Tests" }]} /></div>;
}
