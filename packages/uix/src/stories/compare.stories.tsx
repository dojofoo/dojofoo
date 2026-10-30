import type { Meta, StoryObj } from "@storybook/react-vite";
import { compareComponents, ComparePage, rivalMarks } from "../web/compare";
import { SiteContext, type SiteLinks } from "../web/site";

/**
 * Dojo.foo next to another way to learn (src/web/compare.tsx): a story of what the other does well and where Dojo.foo
 * differs, then the two side by side. On the site at /vs/<rival>, hidden: not linked and out of search; its words
 * there are apps/web/comparisons/<rival>.mdx, a shorter sample of them here.
 */
const { Story: Prose, Quote, Compare, Category, Row } = compareComponents;
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
  args: {
    rival: {
      name: "MasterClass",
      website: "https://www.masterclass.com",
      headline: "A craft is best learned from a master",
      lead: "MasterClass puts experts in front of the camera, and their mastery is what makes its classes worth watching. Dojo.foo builds on the same idea: every craft gets its master, a sensei who mentors you through it.",
      sources: [{ label: "Wikipedia", url: "https://en.wikipedia.org/wiki/MasterClass" }],
    },
    marks: rivalMarks.masterclass,
    toc: [{ id: "what-masterclass-does-well", text: "What MasterClass does well" }, { id: "where-dojo-foo-goes-further", text: "Where Dojo.foo goes further" }],
    children: <>
      <Prose>
        <h2 id="what-masterclass-does-well">What MasterClass does well</h2>
        <p>Its classes are the masters themselves – Gordon Ramsay in the kitchen, Chris Voss at the negotiating table. Reviewers praise the classes for</p>
        <Quote cite="Reviewers, as Wikipedia sums them up">their high production values, and for inspiring students to continue to pursue the subject matter.</Quote>
        <h2 id="where-dojo-foo-goes-further">Where Dojo.foo goes further</h2>
        <p>Mastery is passed on by mentors, so in a dojo the mentor isn't an extra. It is the course.</p>
      </Prose>
      <Compare>
        <Category name="Mentoring" icon="handshake">
          <Row name="AI mentor" dojo="In every course" rival="Select instructors, in On Call">Dojo.foo: every course comes with its sensei. MasterClass: On Call, AI versions of select instructors.</Row>
          <Row name="Feedback on your work" dojo="Every lesson" rival="In Sessions">Dojo.foo's sensei checks your work as you go.</Row>
        </Category>
        <Category name="Production" icon="clapperboard">
          <Row name="Award-winning films" dojo={false} rival={true}>MasterClass: a James Beard Award (2019) and Webby Awards (2020, 2021).</Row>
        </Category>
      </Compare>
    </>,
  },
  argTypes: { rival: { table: { disable: true } }, marks: { table: { disable: true } }, toc: { table: { disable: true } }, children: { table: { disable: true } } },
  decorators: [(Story) => { document.body.classList.remove("overflow-hidden"); return <SiteContext.Provider value={links}><Story /></SiteContext.Provider>; }],
} satisfies Meta<typeof ComparePage>;
export default meta;

export const MasterClass: StoryObj<typeof meta> = {};
