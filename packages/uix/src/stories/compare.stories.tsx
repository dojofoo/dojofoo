import type { Meta, StoryObj } from "@storybook/react-vite";
import { ComparePage, rivals } from "../web/compare";
import { SiteContext, type SiteLinks } from "../web/site";

/**
 * Dojo.foo next to another way to learn (src/web/compare.tsx) – on the site at /compare/<rival>, hidden: not linked
 * and out of search until the other side's column is confirmed from its own site.
 */
const links: SiteLinks = {
  navigate: () => {},
  sectionHref: (section) => (section === "courses" ? "/dojos" : section === "help" ? "/docs" : "/"),
  openDoc: () => {},
  openCourse: () => {},
  courseHref: (course) => `/courses/${course.source}/${course.slug}`,
  openSearch: () => {},
};

const meta = {
  title: "Web/Compare",
  component: ComparePage,
  parameters: { layout: "fullscreen" },
  args: { rival: rivals[0] },
  argTypes: { rival: { table: { disable: true } } },
  decorators: [(Story) => { document.body.classList.remove("overflow-hidden"); return <SiteContext.Provider value={links}><Story /></SiteContext.Provider>; }],
} satisfies Meta<typeof ComparePage>;
export default meta;

export const MasterClass: StoryObj<typeof meta> = {};
