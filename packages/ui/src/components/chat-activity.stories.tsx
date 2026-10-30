import type { Meta, StoryObj } from "@storybook/react-vite";
import { StreamedChatMessage } from "@/components/chat/streamed-message";

// The Sensei's chat renders in uix: its stories are uix's Components/Organisms/Sensei Chat. These two keep the app's
// own wrapper (Eve's tool calls, its fragments) in view.
function Activity() { return null; }
export default { title: "Chat/Activity", component: Activity } satisfies Meta<typeof Activity>;

export const ToolActivityLabels: StoryObj<typeof Activity> = {
  render: () => <div className="w-full max-w-xl bg-background text-foreground">
    {[
      { name: "read_file", path: "DOJO.md" },
      { name: "edit_file", path: "SENSEI.mdx" },
      { name: "edit_file", path: "kata.test.ts" },
      { name: "run_tests", path: "" },
      { name: "sleep", path: "" },
    ].map((tool, index) => <StreamedChatMessage key={index} fragments={{}} workspaceId="storybook" streaming
      message={{ id: `tool-${index}`, role: "assistant", parts: [{ type: "tool-call", id: `call-${index}`, name: tool.name, arguments: JSON.stringify({ path: tool.path }), input: { path: tool.path }, state: "input-complete" }] }} />)}
  </div>,
};

export const ExpandableChain: StoryObj<typeof Activity> = {
  render: () => <div className="w-full max-w-xl bg-background text-foreground">
    <StreamedChatMessage fragments={{}} workspaceId="storybook" message={{ id: "long-chain", role: "assistant", parts: [
      { type: "thinking", content: "Inspect the lesson evidence before choosing the next step.\n".repeat(40) },
      { type: "tool-call", id: "read", name: "read_file", arguments: "{}", state: "complete", output: "Lesson instructions loaded" },
      { type: "thinking", content: "Review the learner's previous attempts.\n".repeat(40) },
    ] }} />
  </div>,
};
