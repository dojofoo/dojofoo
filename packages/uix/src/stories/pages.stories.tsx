import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { expect, userEvent, within } from "storybook/test";
import { LearnerPage } from "../pages/learner";
import { CourseAuthoringPage } from "../pages/course-authoring";

type PageArgs = ComponentProps<typeof LearnerPage> & { initialCourse: string };

const meta = {
  title: "Pages/Dojo",
  component: LearnerPage,
  parameters: { layout: "fullscreen" },
  args: { initialCourse: "Everyday TypeScript", settings: false, documentationUrl: "/uix-language/files/solution/hover" },
  argTypes: { start: { table: { disable: true } }, slideSource: { control: "text" }, initialCourse: { control: "select", options: ["Everyday TypeScript", "Advanced TypeScript"] } },
} satisfies Meta<PageArgs>;
export default meta;
type Story = StoryObj<PageArgs>;

export const InstallationSetup: Story = { name: "Dojo Installation / Setup", args: { start: "Fresh" } };
export const LearnerIntro: Story = { name: "Course Learner · Intro", args: { start: "Intro" }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvasElement.querySelector("video")).not.toBeNull();
  await expect(canvas.queryByRole("button", { name: "Show evals" })).not.toBeInTheDocument();
} };
export const LearnerKata: Story = { name: "Course Learner · Kata", args: { start: "Kata" }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.queryByRole("button", { name: "Show evals" })).not.toBeInTheDocument();
  await expect(canvas.queryByRole("button", { name: /^Close .*kata/ })).not.toBeInTheDocument();
  const chapters = within(canvas.getByRole("group", { name: "Chapters" }));
  const locked = chapters.getByRole("button", { name: /^Narrowing \(/ });
  await expect(locked).toHaveAttribute("aria-disabled", "true");
  await userEvent.click(locked);
  await expect(locked).not.toHaveAttribute("aria-current", "page");
} };
export const LearnerSlides: Story = {
  name: "Course Learner · Slides",
  args: { start: "Slides", slideSource: "/slides/index.html?embedded=true" },
  parameters: { docs: { description: { story: "A locally built Slidev deck with the kata editor's Shiki theme and local fonts. No remote demo or runtime CDN. Set slideSource to a course deck." } } },
};
export const CourseAuthoring: Story = {
  name: "Course Authoring",
  args: { start: "Kata" },
  render: args => <CourseAuthoringPage key={args.initialCourse} initialCourse={args.initialCourse} documentationUrl={args.documentationUrl} settings={args.settings} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Show evals" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Show evals" }));
    await expect(canvas.getByRole("region", { name: "Evals" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Hide evals" }));
  },
};
export const Certificates: Story = { args: { start: "Certificates" }, play: async ({ canvasElement }) => {
  await expect(within(canvasElement).getAllByRole("img", { name: "Dojo certificate seal" })).toHaveLength(2);
} };
export const Explore: Story = { args: { start: "Explore" }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(within(canvas.getByRole("list", { name: "Featuring" })).getAllByRole("listitem")).toHaveLength(1);
  await expect(canvas.queryByText("Materials", { exact: true })).not.toBeInTheDocument();
} };

export const Settings: Story = { args: { start: "Settings" } };

export const ContentWindowSettings: Story = { name: "Content Window Settings", args: { start: "Kata", settings: true } };
