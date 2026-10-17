import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddCard, ColorCard, ColorCardButton, ColorCardCheck, ColorCardTag } from "~/components/color-card";
import { Icon } from "~/components/app-shell";
import { DoneIcon, PlusSignIcon } from "~/lib/icons";
import { BrandLogo } from "../../../ui/src/components/ui/brand-logo";

/*
 * ColorCard – one color, its lines always in the same places and sizes: the header (mark, figure), the main (kicker,
 * title) and the footer (label, value, action, progress). Playground's controls set each; Variants shows the uses, then
 * each again with a long title – it wraps, and still sits on the card's middle line.
 */
const long = "Build your own Large Language Model";
/** As long as a title gets: Udemy caps course titles at 60 characters, and this real one uses all of them */
const longest = "The Ultimate React Course 2025: React, Next.js, Redux & More";
const meta = {
  title: "Components/Color Card",
  component: ColorCard,
  parameters: { layout: "centered" },
  args: { color: "oklch(0.58 0.2 350)", shader: false, shape: "rect", title: "Everyday TypeScript", figure: "★ 4.9", kicker: "", label: "Updated", value: "12 Oct 2026", progress: undefined },
  argTypes: { color: { control: "color" }, shader: { control: "inline-radio", options: [false, "topography", "network", "waves", "opal"] }, shape: { control: "inline-radio", options: ["rect", "square"] }, progress: { control: { type: "range", min: 0, max: 100 } } },
  decorators: [(Story) => <div style={{ width: 240 }}><Story /></div>],
} satisfies Meta<typeof ColorCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { render: (args) => <ColorCard {...args} mark={<BrandLogo />} action={<ColorCardButton>Install</ColorCardButton>} /> };

export const Variants: Story = {
  parameters: { layout: "padded" },
  decorators: [(Story) => <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 230px)", gap: 16 }}><Story /></div>],
  render: () => (
    <>
      <ColorCard color="oklch(0.58 0.2 350)" mark={<BrandLogo />} figure="★ 4.9" title="Everyday TypeScript" label="Updated" value="12 Oct 2026" action={<ColorCardButton>Install</ColorCardButton>} />
      <ColorCard color="oklch(0.58 0.2 255)" mark={<BrandLogo />} figure="★ 4.6" title="Advanced TypeScript" label="Updated" value="30 Sep 2026" action={<ColorCardTag><Icon icon={DoneIcon} size={13} />Installed</ColorCardTag>} />
      <ColorCard color="oklch(0.58 0.2 190)" mark={<BrandLogo />} title="Async JavaScript" label="02 · Promises" value="Chain them" action={<span className="ui-card__figure">40%</span>} progress={40} onClick={() => {}} />
      <ColorCard color="#7c3aed" shader mark="Community" figure="Draft" kicker="With the contour map" title="Regex Katas" label="Not published" value="Edited today" action={<ColorCardButton>Edit</ColorCardButton>} />
      <ColorCard color="oklch(0.6 0.18 35)" shader shape="square" mark={<BrandLogo />} figure="96%" kicker="Certificate of completion" title="JavaScript Foundations" label="Issued" value="12 Sep 2026" />
      <ColorCard color="oklch(0.55 0.19 200)" shader="network" mark={<BrandLogo />} figure="★ 4.8" kicker="With the network" title="Async JavaScript" label="Updated" value="8 Oct 2026" action={<ColorCardButton>Install</ColorCardButton>} />
      <ColorCard color="oklch(0.52 0.2 285)" shader="network" shape="square" mark={<BrandLogo />} figure="100%" kicker="Certificate of completion" title="Everyday TypeScript · Arrays" label="Issued" value="3 Oct 2026" />
      <ColorCard color="oklch(0.55 0.17 230)" shader="waves" mark={<BrandLogo />} figure="★ 4.7" kicker="With the waves" title="Testing with Vitest" label="Updated" value="2 Oct 2026" action={<ColorCardButton>Install</ColorCardButton>} />
      <ColorCard color="oklch(0.55 0.2 320)" shader="opal" mark={<BrandLogo />} figure="★ 4.5" kicker="With the opal" title="Rust for TypeScript devs" label="Updated" value="14 Sep 2026" action={<ColorCardButton>Install</ColorCardButton>} />
      <AddCard icon={<Icon icon={PlusSignIcon} size={18} />} title="New course" label="Start from a template" />
      {/* A long title, on every kind of card */}
      <ColorCard color="oklch(0.55 0.17 160)" shader mark="Sebastian Raschka" figure="★ 4.9" title={long} label="Updated" value="16 Oct 2026" action={<ColorCardButton>Install</ColorCardButton>} />
      <ColorCard color="oklch(0.55 0.17 160)" shader="network" mark="Sebastian Raschka" figure="★ 4.9" title={long} label="Updated" value="16 Oct 2026" action={<ColorCardTag><Icon icon={DoneIcon} size={13} />Installed</ColorCardTag>} />
      <ColorCard color="oklch(0.55 0.17 160)" mark="Sebastian Raschka" title={long} label="03 · Attention" value="Self-attention by hand" action={<span className="ui-card__figure">35%</span>} progress={35} onClick={() => {}} />
      <label style={{ display: "grid", cursor: "pointer" }}><ColorCard color="oklch(0.55 0.17 160)" shader="waves" mark="Sebastian Raschka" figure="★ 4.9" title={long} label="38 lessons" value="~24 h" action={<ColorCardCheck checked={false} />} /></label>
      <label style={{ display: "grid", cursor: "pointer" }}><ColorCard color="oklch(0.55 0.17 160)" shader="opal" mark="Sebastian Raschka" figure="★ 4.9" title={long} label="38 lessons" value="~24 h" action={<ColorCardCheck checked />} /></label>
      <ColorCard color="oklch(0.55 0.17 160)" mark="Sebastian Raschka" figure="Draft" kicker="With a kicker" title={long} label="Not published" value="Edited today" action={<ColorCardButton>Edit</ColorCardButton>} />
      <ColorCard color="oklch(0.55 0.17 160)" shader shape="square" mark={<BrandLogo />} figure="98%" kicker="Certificate of completion" title={long} label="Issued" value="17 Oct 2026" />
      {/* The longest a title gets (60 characters) */}
      <ColorCard color="oklch(0.6 0.15 220)" shader mark="Jonas Schmedtmann" figure="★ 4.8" title={longest} label="Updated" value="9 Oct 2026" action={<ColorCardButton>Install</ColorCardButton>} />
      <ColorCard color="oklch(0.6 0.15 220)" mark="Jonas Schmedtmann" title={longest} label="05 · Redux Toolkit" value="Slices and thunks" action={<span className="ui-card__figure">62%</span>} progress={62} onClick={() => {}} />
      <label style={{ display: "grid", cursor: "pointer" }}><ColorCard color="oklch(0.6 0.15 220)" shader="waves" mark="Jonas Schmedtmann" figure="★ 4.8" title={longest} label="84 lessons" value="~68 h" action={<ColorCardCheck checked />} /></label>
      <ColorCard color="oklch(0.6 0.15 220)" shader="network" shape="square" mark={<BrandLogo />} figure="91%" kicker="Certificate of completion" title={longest} label="Issued" value="17 Oct 2026" />
    </>
  ),
};
