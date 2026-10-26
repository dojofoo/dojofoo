import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "~/components/button";

const meta = {
  title: "Components/Atoms/Button", component: Button,
  parameters: { layout: "centered" },
  args: { children: "Continue", variant: "primary", size: "md", disabled: false, loading: false },
  argTypes: { variant: { control: "select", options: ["primary", "secondary", "ghost", "destructive"] }, size: { control: "select", options: ["sm", "md", "lg"] } },
} satisfies Meta<typeof Button>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
