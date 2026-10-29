import type { Meta, StoryObj } from "@storybook/react-vite";
import { TerminalOutput } from "../components/terminal-output";

const meta = {
  title: "Components/Organisms/Terminal Output",
  component: TerminalOutput,
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ maxWidth: 520 }}><Story /></div>],
  args: { label: "2/3 lesson checks passed", status: "error", exitCode: 1, lines: ["✓ keeps the input unchanged", "× handles an empty list", "  Expected [] but received undefined. Return an empty list when there are no positive values; keep the original input unchanged.", "✓ keeps positive values"] },
  argTypes: { status: { control: "inline-radio", options: ["running", "success", "error"] } },
} satisfies Meta<typeof TerminalOutput>;
export default meta;
export const Failed: StoryObj<typeof meta> = {};
export const Passed: StoryObj<typeof meta> = { args: { label: "3/3 lesson checks passed", status: "success", exitCode: 0, lines: ["✓ keeps the input unchanged", "✓ handles an empty list", "✓ keeps positive values"] } };
export const Running: StoryObj<typeof meta> = { args: { label: "Running lesson checks", status: "running", exitCode: undefined, lines: ["✓ keeps the input unchanged"] } };
