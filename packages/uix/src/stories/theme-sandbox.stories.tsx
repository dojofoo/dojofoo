import type { Meta, StoryObj } from "@storybook/react-vite";
import { ThemeSandbox } from "../templates/theme-sandbox";

const meta = { title: "Templates/Theme Sandbox", component: ThemeSandbox, parameters: { layout: "fullscreen" } } satisfies Meta<typeof ThemeSandbox>;
export default meta;
export const Sandbox: StoryObj<typeof meta> = {};
