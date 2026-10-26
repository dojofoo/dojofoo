import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { allPages } from "~/docs/content";
import { Website } from "~/web/website";

/**
 * The docs (dojo.foo/docs) as the site lays them out – the Fumadocs notebook layout – in UIX's look: Usage, Authoring,
 * Developers, API and Help & Support. The pages are the website's own content (apps/web/content), so what's edited there
 * shows here; Help & Support's pages are new (src/docs/help). Click through the tabs, the tree, the links and the pager;
 * ⌘K searches the docs (Tab switches to the courses).
 */
const meta = {
  title: "Docs/Documentation",
  component: Website,
  parameters: { layout: "fullscreen" },
  args: { start: "docs", docPath: "/docs" },
  argTypes: {
    start: { table: { disable: true } },
    courseId: { table: { disable: true } },
    docPath: { name: "Page", control: "select", options: allPages.map((entry) => entry.page.path) },
  },
  // Pages scroll as a website's do, not as the app's fixed window
  decorators: [(Story) => { document.body.classList.remove("overflow-hidden"); return <Story />; }],
} satisfies Meta<typeof Website>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Usage: Story = {
  args: { docPath: "/docs" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const pages = within(canvas.getByRole("complementary", { name: "Pages" }));
    await userEvent.click(pages.getByRole("link", { name: "Quickstart" }));
    await expect(await canvas.findByRole("heading", { level: 1, name: "Quickstart" })).toBeVisible();
  },
};
export const CLI: Story = { name: "CLI reference", args: { docPath: "/docs/commands/install" } };
export const Authoring: Story = { args: { docPath: "/authoring" } };
export const Developers: Story = { args: { docPath: "/developers" } };
export const API: Story = { name: "API", args: { docPath: "/docs/api" } };
export const APIEndpoint: Story = { name: "API endpoint", args: { docPath: "/docs/api/list-courses" } };
export const APIEvent: Story = { name: "API event", args: { docPath: "/docs/api/record-course-event" } };
export const HelpAndSupport: Story = { name: "Help & Support", args: { docPath: "/help" } };
