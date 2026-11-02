import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { LocalErrorPage } from "../pages/local-error";

const trace = "Error: Could not load the course\n    at readCourse (courses.ts:42:7)\n    at openLesson (lessons.ts:18:3)";

const meta = {
  title: "Pages/Local UI Error",
  component: LocalErrorPage,
  parameters: { layout: "fullscreen" },
  args: { trace, onRetry: fn() },
} satisfies Meta<typeof LocalErrorPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Something went wrong" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Copy code" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(args.onRetry).toHaveBeenCalledOnce();
  },
};
export const LongTrace: Story = { args: { trace: `${trace}\n${Array.from({ length: 40 }, (_, index) => `    at loadModule${index} (/workspace/dojo/node_modules/runtime/module-${index}/index.mjs:128:12)`).join("\n")}` } };
export const MessageOnly: Story = { args: { trace: "The local server is unavailable. Restart dojofoo and try again." } };
