import type { Meta, StoryObj } from "@storybook/react-vite";
import { AddCard, ColorCard, ColorCardButton, ColorCardTag } from "~/components/color-card";
import { Icon } from "~/components/app-shell";
import { DoneIcon, PlusSignIcon } from "~/lib/icons";
import { BrandLogo } from "../../../ui/src/components/ui/brand-logo";

/*
 * ColorCard – one color, its lines always in the same places and sizes: the header (mark, figure), the main (kicker,
 * title) and the footer (label, value, action, progress). Playground's controls set each; Variants shows the uses.
 */
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
    </>
  ),
};
