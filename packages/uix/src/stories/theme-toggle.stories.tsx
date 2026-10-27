import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { ThemeToggle, type ThemeToggleProps } from "../components/theme-toggle";
import { setPageMode } from "../lib/ui-preferences";

const meta = {
  title: "Components/Molecules/ThemeToggle", component: ThemeToggle,
  parameters: { layout: "centered" },
  args: { mode: "dark", resolvedMode: "dark", onModeChange: () => {} },
  argTypes: { mode: { control: "select", options: ["light", "dark", "system"] }, resolvedMode: { control: "select", options: ["light", "dark"] } },
  render: function Render(args) {
    const [, updateArgs] = useArgs<ThemeToggleProps>();
    return <ThemeToggle {...args} onModeChange={mode => {
      const resolvedMode = mode === "system" ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : mode;
      updateArgs({ mode, resolvedMode });
      setPageMode(resolvedMode);
    }} />;
  },
} satisfies Meta<typeof ThemeToggle>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
