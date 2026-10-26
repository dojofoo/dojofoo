import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { catalog } from "~/web/catalog";
import { Website } from "~/web/website";

/**
 * The website (dojo.foo) in UIX's styling: the landing, the course catalog as a search, and a course's page with its
 * numbers. The pages link to each other – click through them as on the site. Sample courses (src/web/catalog.ts).
 */
const meta = {
  title: "Web/Site",
  component: Website,
  parameters: { layout: "fullscreen" },
  args: { start: "landing", courseId: "effect-ts" },
  argTypes: {
    start: { table: { disable: true } },
    courseId: { name: "Course", control: "select", options: catalog.map((course) => course.id) },
    docPath: { table: { disable: true } },
  },
  // Pages scroll as a website's do, not as the app's fixed window
  decorators: [(Story) => { document.body.classList.remove("overflow-hidden"); return <Story />; }],
} satisfies Meta<typeof Website>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Landing: Story = {
  args: { start: "landing" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // Interview first and in front; picking another mode brings its window forward
    await expect(canvas.getByRole("tab", { name: "Interview Mode" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("tab", { name: "Course Mode" }));
    await expect(canvas.getByRole("tab", { name: "Course Mode" })).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("group", { name: /Course Mode in front/ })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Authoring Mode" }));
    await expect(canvas.getByRole("tab", { name: "Authoring Mode" })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(canvas.getByRole("tab", { name: "Interview Mode" }));
    canvas.getByRole("tab", { name: "Interview Mode" }).blur();
  },
};

export const Courses: Story = {
  args: { start: "courses" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search courses" }), "effect");
    await expect(canvas.getByText(/1 course/)).toBeVisible();
    await userEvent.clear(canvas.getByRole("searchbox", { name: "Search courses" }));
  },
};

export const Course: Story = { args: { start: "course" } };
