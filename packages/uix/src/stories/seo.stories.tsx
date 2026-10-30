import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { SearchPreview } from "../web/search-preview";

/**
 * Dojo.foo in search (src/web/seo.ts): the Google result we'd like, laid out as MasterClass's – sitelinks, people also
 * ask – and each page's tags and cards, the JSON-LD, the AI crawlers and what's left before Google indexes the site.
 * The website's head is built from the same words, so this shows what it serves.
 */
const meta = {
  title: "Web/Search",
  component: SearchPreview,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => { document.body.classList.remove("overflow-hidden"); return <Story />; }],
} satisfies Meta<typeof SearchPreview>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // A question opens to its answer
    await userEvent.click(canvas.getByRole("button", { name: "What is Dojo.foo?" }));
    await expect(canvas.getByText(/turns your coding agent into a teacher/, { selector: ".ui-seo-serp__questions p" })).toBeVisible();
  },
};
