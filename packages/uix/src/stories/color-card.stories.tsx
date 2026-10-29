import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Icon } from "../components/app-shell";
import { AddCard, CardDetails, CardFigure, CardKicker, CardMark, CardText, CardTitle, ColorCard, ColorCardButton, ColorCardCheck, ColorCardTag } from "../components/color-card";
import { CertificateCard, CourseCard, type CourseInfo } from "../components/course-card";
import { DoneIcon, PlusSignIcon } from "../lib/icons";
import { BrandLogo } from "../components/brand-logo";

/*
 * ColorCard – every card's look, in two sizes: small (a rectangle, fixed sizes) and big (a square whose type grows with
 * it). What it says goes in header, main and footer, built from its parts; `progress` adds the bar, `flip` turns it to
 * its back, `centered` sets it on the middle. CourseCard and CertificateCard are compositions of it. Playground's
 * controls set the card's own options; Variants shows every card the app uses, then each with a long title.
 */
const meta = {
  title: "Components/Molecules/Color Card",
  component: ColorCard,
  parameters: { layout: "centered" },
  args: { color: "oklch(0.58 0.2 350)", size: "small", shader: false, progress: undefined, centered: false, flip: false },
  argTypes: {
    color: { control: "color" },
    size: { control: "inline-radio", options: ["small", "big"] },
    shader: { control: "inline-radio", options: [false, "topography", "network", "waves", "opal"] },
    progress: { control: { type: "range", min: 0, max: 100 } },
    centered: { control: "boolean" },
    flip: { control: "boolean" },
  },
} satisfies Meta<typeof ColorCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {
  render: (args) => (
    <div style={{ width: args.size === "big" ? 260 : 240 }}>
      <ColorCard {...args} aria-label="Everyday TypeScript"
        header={<><CardMark><BrandLogo mono /></CardMark><CardFigure>★ 4.9</CardFigure></>}
        main={<><CardKicker>Arrays, objects and types</CardKicker><CardTitle>Everyday TypeScript</CardTitle></>}
        footer={args.progress !== undefined
          ? <><CardText label="02 · Objects" value="Merge settings" /><CardFigure>{args.progress}%</CardFigure></>
          : <><CardText label="Updated" value="12 Oct 2026" /><ColorCardButton>Install</ColorCardButton></>}>
        <CardDetails items={[["Version", "v1.4.0"], ["Language", "TypeScript"], ["Lessons", 12]]} />
      </ColorCard>
    </div>
  ),
};

/* ---------- Variants: every card the app uses ---------- */

const pink = "oklch(0.58 0.2 350)";
const blue = "oklch(0.58 0.2 255)";
const teal = "oklch(0.58 0.2 190)";
const violet = "oklch(0.55 0.2 300)";
const green = "oklch(0.55 0.17 160)";
const sky = "oklch(0.6 0.15 220)";
const long = "Build your own Large Language Model";
/** As long as a title gets: Udemy caps course titles at 60 characters, and this real one uses all of them */
const longest = "The Ultimate React Course 2025: React, Next.js, Redux & More";
/** Longer than any catalog allows – past four lines a title ends in an ellipsis */
const tooLong = "The Complete Web Developer Bootcamp: HTML, CSS, JavaScript, React, Node.js, MongoDB, PostgreSQL, Docker and Kubernetes";

const course = (info: Partial<CourseInfo> & Pick<CourseInfo, "title">): CourseInfo => ({
  repo: "dojofoo/everyday-typescript", author: "Dojo.foo", rating: 4.9, version: "v1.4.0", updated: "12 Oct 2026", language: "TypeScript", chapters: 4, lessons: 12, hours: 6, art: { hue: 350, glyph: "TS" }, ...info,
});
const everyday = course({ title: "Everyday TypeScript" });
const advanced = course({ title: "Advanced TypeScript", repo: "dojofoo/advanced-typescript", rating: 4.6, version: "v0.9.2", shader: "waves", art: { hue: 255, glyph: "ATS" } });
const llm = course({ title: long, repo: "rasbt/llms-from-scratch", author: "Sebastian Raschka", language: "Python", chapters: 7, lessons: 38, hours: 24, shader: "network", art: { hue: 160, glyph: "LLM" } });
const react = course({ title: longest, repo: "jonasschmedtmann/ultimate-react-course", author: "Jonas Schmedtmann", rating: 4.8, language: "JavaScript", chapters: 12, lessons: 84, hours: 68, art: { hue: 220, glyph: "R" } });
const digest = "d1d0ac5f87007c80c7a0d1773773b4ac9361c8aba3c175473f46bff44da78f8d";

function Section({ title, size = "small", children }: { title: string; size?: "small" | "big"; children: ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 12, marginBottom: 40 }}>
      <h3 style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", opacity: 0.6 }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, ${size === "big" ? 260 : 230}px)`, gap: 16 }}>{children}</div>
    </section>
  );
}

/** Small cards as the app composes them */
const Catalog = ({ color, title, mark = <BrandLogo />, rating = "4.9", installed = false, shader }: { color: string; title: string; mark?: ReactNode; rating?: string; installed?: boolean; shader?: "topography" | "network" | "waves" | "opal" }) => (
  <ColorCard color={color} shader={shader} aria-label={title}
    header={<><CardMark>{mark}</CardMark><CardFigure>★ {rating}</CardFigure></>} main={<CardTitle>{title}</CardTitle>}
    footer={<><CardText label="Updated" value="12 Oct 2026" />{installed ? <ColorCardTag><Icon icon={DoneIcon} size={13} />Installed</ColorCardTag> : <ColorCardButton>Install</ColorCardButton>}</>} />
);
const Studying = ({ color, title, mark = <BrandLogo />, at, next, pct }: { color: string; title: string; mark?: ReactNode; at: string; next: string; pct: number }) => (
  <ColorCard color={color} onClick={() => {}} aria-label={`${title}, ${pct}% done`} progress={pct}
    header={<CardMark>{mark}</CardMark>} main={<CardTitle>{title}</CardTitle>}
    footer={<><CardText label={at} value={next} /><CardFigure>{pct}%</CardFigure></>} />
);
const Authoring = ({ color, title, mark = <BrandLogo />, status, kicker }: { color: string; title: string; mark?: ReactNode; status: string; kicker?: string }) => (
  <ColorCard color={color} onClick={() => {}} aria-label={`Open ${title}`}
    header={<><CardMark>{mark}</CardMark><CardFigure>{status}</CardFigure></>} main={<>{kicker && <CardKicker>{kicker}</CardKicker>}<CardTitle>{title}</CardTitle></>}
    footer={<CardText label={status === "Draft" ? "Not published" : "128 learners"} value="Edited today" />} />
);
const Pick = ({ color, title, mark = <BrandLogo />, checked, shader }: { color: string; title: string; mark?: ReactNode; checked: boolean; shader?: "topography" | "network" | "waves" | "opal" }) => (
  <label style={{ display: "grid", cursor: "pointer" }}>
    <ColorCard color={color} shader={shader}
      header={<><CardMark>{mark}</CardMark><CardFigure>★ 4.9</CardFigure></>} main={<CardTitle>{title}</CardTitle>}
      footer={<><CardText label="38 lessons" value={"~24\u00a0h"} /><ColorCardCheck checked={checked} /></>} />
  </label>
);

export const Variants: Story = {
  parameters: { layout: "padded" },
  render: () => (
    <div style={{ maxWidth: 1100 }}>
      <Section title="Small · catalog – install, installed">
        <Catalog color={pink} title="Everyday TypeScript" />
        <Catalog color={blue} title="Advanced TypeScript" rating="4.6" installed />
      </Section>
      <Section title="Small · studying – progress">
        <Studying color={teal} title="Async JavaScript" at="02 · Promises" next="Chain them" pct={40} />
        <Studying color={pink} title="Everyday TypeScript" at="01 · Arrays" next="Not started" pct={0} />
      </Section>
      <Section title="Small · authoring">
        <Authoring color={pink} title="Everyday TypeScript" status="Published" />
        <Authoring color={blue} title="Advanced TypeScript" status="Draft" />
      </Section>
      <Section title="Small · setup pick – checkbox">
        <Pick color={pink} title="Everyday TypeScript" checked={false} />
        <Pick color={teal} title="Async JavaScript" checked shader="network" />
      </Section>
      <Section title="Small · shaders">
        <Catalog color={violet} title="Regex Katas" mark="Community" rating="4.4" shader="topography" />
        <Catalog color={teal} title="Async JavaScript" rating="4.8" shader="network" />
        <Catalog color={sky} title="Testing with Vitest" mark="Vitest" rating="4.7" shader="waves" />
        <Catalog color={violet} title="Rust for TypeScript devs" mark="Community" rating="4.5" shader="opal" />
      </Section>
      <Section title="Small · add">
        <AddCard icon={<Icon icon={PlusSignIcon} size={18} />} title="New course" label="Start from a template" />
      </Section>

      <Section title="Big · course – turn it over" size="big">
        <CourseCard course={everyday} mark={<BrandLogo mono />} />
        <CourseCard course={advanced} mark={<BrandLogo mono />} />
      </Section>
      <Section title="Big · course you study – update, up to date, progress" size="big">
        <CourseCard course={everyday} mark={<BrandLogo mono />} enrolled={{ version: "v1.4.0", latest: "v1.5.0", progress: 33, label: "02 · Objects", value: "Merge settings" }} />
        <CourseCard course={advanced} mark={<BrandLogo mono />} enrolled={{ version: "v0.9.2", progress: 0, label: "01 · Narrowing shapes", value: "Narrow by tag" }} />
      </Section>
      <Section title="Big · certificate – turn it over" size="big">
        <CertificateCard certificate={{ id: "js-foundations", title: "JavaScript Foundations", learner: "Sam Rivera", issued: "12 Sep 2026", lessons: 24, score: 96, art: { hue: 35, glyph: "JS" }, digest }} />
        <CertificateCard certificate={{ id: "ts-arrays", title: "Everyday TypeScript · Arrays", learner: "Sam Rivera", issued: "3 Oct 2026", lessons: 3, score: 100, art: { hue: 350, glyph: "TS" }, digest: "8aabeef599580a6a9cb47c2b59b7b722db0194054c0f297fc824944b738c0026" }} />
      </Section>
      <Section title="Big · add" size="big">
        <AddCard size="big" icon={<Icon icon={PlusSignIcon} size={18} />} title="Add a course" label="Find one in Explore" />
      </Section>

      <Section title="Long titles · small">
        <Catalog color={green} title={long} mark="Sebastian Raschka" shader="topography" />
        <Studying color={green} title={long} mark="Sebastian Raschka" at="03 · Attention" next="Self-attention by hand" pct={35} />
        <Pick color={green} title={long} mark="Sebastian Raschka" checked shader="waves" />
        <Authoring color={green} title={long} mark="Sebastian Raschka" status="Draft" kicker="With a kicker" />
        <Catalog color={sky} title={longest} mark="Jonas Schmedtmann" rating="4.8" />
        <Studying color={sky} title={longest} mark="Jonas Schmedtmann" at="05 · Redux Toolkit" next="Slices and thunks" pct={62} />
        <Pick color={sky} title={longest} mark="Jonas Schmedtmann" checked={false} />
        <Catalog color={violet} title={tooLong} mark="Community" rating="4.6" />
      </Section>
      <Section title="Long titles · big" size="big">
        <CourseCard course={llm} />
        <CourseCard course={react} enrolled={{ version: "v1.4.0", progress: 62, label: "05 · Redux Toolkit", value: "Slices and thunks" }} />
        <CertificateCard certificate={{ id: "react", title: longest, learner: "Sam Rivera", issued: "17 Oct 2026", lessons: 84, score: 91, art: { hue: 220, glyph: "R" }, digest: "35".repeat(32) }} />
      </Section>
    </div>
  ),
};
