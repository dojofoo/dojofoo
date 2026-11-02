import type { Meta, StoryObj } from "@storybook/react-vite";
import { CourseSidebarSandbox } from "./fixtures/course-sidebar-sandbox";

const meta = {
  title: "Pages/Course sidebar sandbox",
  component: CourseSidebarSandbox,
  parameters: { layout: "fullscreen", docs: { description: { component: "An authoring-only sidebar sandbox in the shared application shell, using the Créance file tree. Root course files precede Chapters → chapter → lesson → files. Learner navigation remains the simplified chapters-and-lessons view. Install candidate components in UIX and mount them with the fixture’s renderTree prop; the logo, course card, editor, menus and account footer stay in context. All changes are in memory." } } },
  args: { courseTitle: "How to run a dojo", chapterCount: 2, lessonsPerChapter: 2, sidebarWidth: "18rem", showCard: true },
  argTypes: {
    courseTitle: { control: "text" },
    chapterCount: { control: { type: "number", min: 1, max: 8, step: 1 } },
    lessonsPerChapter: { control: { type: "number", min: 0, max: 12, step: 1 } },
    sidebarWidth: { control: "select", options: ["16rem", "18rem", "20rem", "22rem"] },
    showCard: { control: "boolean" },
    renderTree: { control: false, table: { disable: true } },
  },
  render: args => <CourseSidebarSandbox key={JSON.stringify(args)} {...args} />,
} satisfies Meta<typeof CourseSidebarSandbox>;

export default meta;
export const Playground: StoryObj<typeof meta> = {};
