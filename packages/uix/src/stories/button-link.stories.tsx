import type { Meta, StoryObj } from "@storybook/react-vite";
import { ButtonLink } from "../components/button";

const meta = {
  title: "Components/Atoms/ButtonLink", component: ButtonLink,
  parameters: { layout: "centered" },
  args: { children: "Get started", href: "/docs/quickstart", variant: "primary", size: "md" },
  argTypes: { variant: { control: "select", options: ["primary", "secondary", "ghost", "destructive"] }, size: { control: "select", options: ["sm", "md", "lg"] } },
} satisfies Meta<typeof ButtonLink>;
export default meta;
export const Default: StoryObj<typeof meta> = {};
