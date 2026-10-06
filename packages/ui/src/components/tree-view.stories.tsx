import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { TreeView, type TreeViewItem } from "./ui/tree-view";

const items: TreeViewItem[] = [
  {
    id: "src",
    label: "src",
    children: [
      {
        id: "app",
        label: "app",
        children: [
          { id: "layout", label: "layout.tsx" },
          { id: "page", label: "page.tsx" },
        ],
      },
      {
        id: "lib",
        label: "lib",
        children: [{ id: "utils", label: "utils.ts" }],
      },
    ],
  },
  {
    id: "public",
    label: "public",
    children: [{ id: "logo", label: "dojo.svg" }],
  },
  { id: "empty", label: "empty", children: [] },
  { id: "package", label: "package.json" },
  { id: "readme", label: "README.md" },
];
export default {
  title: "Components/Tree View",
  component: TreeView,
  parameters: { layout: "fullscreen" },
  args: {
    items,
    label: "Project files",
    defaultExpandedIds: ["src", "app"],
    defaultSelectedId: "page",
  },
} satisfies Meta<typeof TreeView>;
export const Files: StoryObj<typeof TreeView> = {
  render: (args) => (
    <div className="w-80 bg-background py-4 text-foreground">
      <TreeView {...args} />
    </div>
  ),
};
export const Controlled: StoryObj<typeof TreeView> = {
  render: (args) => <ControlledFixture {...args} />,
};
function ControlledFixture(args: React.ComponentProps<typeof TreeView>) {
  const [expanded, setExpanded] = useState(["src", "app"]);
  const [selected, setSelected] = useState<string | null>("page");
  return (
    <div className="w-80 bg-background py-4 text-foreground">
      <button type="button" onClick={() => setExpanded([])}>
        Collapse externally
      </button>
      <TreeView
        {...args}
        expandedIds={expanded}
        onExpandedChange={setExpanded}
        selectedId={selected}
        onSelect={setSelected}
      />
      <output aria-label="Selected file">{selected}</output>
    </div>
  );
}
