import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { ToolCallCard } from "~/components/tool-call-card";

const meta = {
  title: "Components/Tool Call Card",
  component: ToolCallCard,
  parameters: { layout: "padded" },
  args: { name: "read_file", summary: "Read SENSEI.md", status: "success", duration: 420,
    args: { path: "SENSEI.md" }, result: { content: "Teach the principle; let the learner choose the edit." }, onRetry: fn() },
  argTypes: { status: { control: "inline-radio", options: ["running", "success", "error"] } },
} satisfies Meta<typeof ToolCallCard>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
