import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { expect, userEvent, within } from "storybook/test";
import { SegmentedControl } from "~/components/segmented-control";

/*
 * Segmented control – every variant the app uses, on the surfaces it sits on, and squeezed: the sizes (default 36px,
 * compact 32px, which grows to 36px on a touch screen), `fill` across a panel and sized to its longest label, tabs, and
 * widths too narrow for the labels, where they shorten with an ellipsis. The rings show the corners are concentric:
 * the track's radius is the pill's plus the padding.
 */
const meta = {
  title: "Components/Segmented Control",
  component: SegmentedControl,
  parameters: { layout: "fullscreen" },
  args: { label: "Range", options: ["Day", "Week", "Month", "Year"], value: "Week", onChange: () => {}, size: "default", fill: false, kind: "radio" },
  argTypes: { size: { control: "inline-radio", options: ["default", "compact"] }, kind: { control: "inline-radio", options: ["radio", "tabs"] } },
} satisfies Meta<typeof SegmentedControl>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Holds the value, so each example switches on its own */
function Live(props: Omit<Parameters<typeof SegmentedControl>[0], "value" | "onChange"> & { initial?: string }) {
  const [value, setValue] = useState(props.initial ?? props.options[0]);
  return <SegmentedControl {...props} value={value} onChange={setValue} />;
}

export const Playground: Story = {
  render: function Render(args) {
    const [value, setValue] = useState(args.value);
    return <Page><SegmentedControl {...args} value={value} onChange={setValue} /></Page>;
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "Month" }));
    await expect(canvas.getByRole("radio", { name: "Month" })).toHaveAttribute("aria-checked", "true");
    // Arrow keys move the choice and the focus, and wrap around
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    await expect(canvas.getByRole("radio", { name: "Day" })).toHaveAttribute("aria-checked", "true");
    await expect(canvas.getByRole("radio", { name: "Day" })).toHaveFocus();
  },
};

const filters = ["All", "Pass 22", "Partial 2", "Fail 1"];
const sections = ["Lesson", "Sensei", "Assets"];

export const Variants: Story = {
  render: () => (
    <Page>
      <Row title="Sizes" note="Default 4 + 28 = 36px; compact 3 + 26 = 32px – 36px on a touch screen">
        <Live label="Default" options={filters} />
        <Live label="Compact" size="compact" options={filters} />
      </Row>
      <Row title="Fill" note="Equal columns: across the width given, or with width: auto (the evals filter), each as wide as the longest label">
        <div style={{ width: "100%" }}><Live label="Across" fill kind="tabs" options={sections} /></div>
        <Live label="Longest label" fill size="compact" options={filters} className="sc-auto" />
      </Row>
      <Row title="Two options" note="The appearance switch in the settings">
        <div style={{ width: 320 }}><Live label="Appearance" fill options={["Light", "Dark"]} initial="Dark" /></div>
      </Row>
      <Row title="On the surfaces" note="The track is a tint of what's below; the pill is a surface with shadow 3">
        <Surface level={2}><Live label="On the window" size="compact" options={filters} /></Surface>
        <Surface level={3}><Live label="On a card" size="compact" options={filters} /></Surface>
      </Row>
      <Row title="Out of room" note="Labels shorten with an ellipsis; nothing spills or scrolls">
        {[320, 240, 180].map((width) => (
          <div key={width} className="sc-squeeze" style={{ width }}>
            <Live label={`${width}px`} fill size="compact" options={filters} />
            <span>{width}px</span>
          </div>
        ))}
      </Row>
      <Row title="Corners" note="Concentric: the track's radius is the pill's plus the padding">
        <div className="sc-corners"><Live label="Corners default" options={["One", "Two"]} /></div>
        <div className="sc-corners"><Live label="Corners compact" size="compact" options={["One", "Two"]} /></div>
      </Row>
    </Page>
  ),
};

/** The phone's width: the evals filter on its own row, the settings' tabs across the drawer */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  render: () => (
    <Page>
      <Row title="Evals filter" note="Its own row below the heading, each option a quarter">
        <Live label="Filter test cases" fill size="compact" options={filters} />
      </Row>
      <Row title="Settings" note="Tabs across the drawer">
        <Live label="Settings sections" fill kind="tabs" options={sections} />
        <Live label="Appearance" fill options={["Light", "Dark"]} initial="Dark" />
      </Row>
    </Page>
  ),
};

function Page({ children }: { children: ReactNode }) {
  return (
    <div className="sc">
      <style>{css}</style>
      {children}
    </div>
  );
}

function Row({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section className="sc-row">
      <h2>{title}</h2>
      <p>{note}</p>
      <div className="sc-row__items">{children}</div>
    </section>
  );
}

function Surface({ level, children }: { level: number; children: ReactNode }) {
  return <div className="sc-surface" style={{ background: `var(--surface-${level})` }}>{children}<span>Surface {level}</span></div>;
}

const css = /* css */ `
.sc { display: grid; gap: 32px; min-height: 100dvh; padding: 32px 24px; background: var(--surface-2); color: var(--fluid-foreground); font-size: var(--fs-body); }
.sc-row { display: grid; gap: 4px; }
.sc-row h2 { margin: 0; font-size: 10px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--fluid-muted); }
.sc-row p { margin: 0 0 10px; color: var(--fluid-muted); }
.sc-row__items { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 16px; }
.sc-surface { display: grid; gap: 8px; padding: 16px; border-radius: 12px; box-shadow: var(--shadow-3); }
.sc-surface > span, .sc-squeeze > span { color: var(--fluid-muted); font-size: 11px; font-family: var(--font-mono); }
.sc-squeeze { display: grid; gap: 6px; }
.sc .ui-seg.sc-auto { width: auto; }
/* A hairline on the track and on the pill's corner, to compare the curves */
.sc-corners { padding: 16px; }
.sc-corners .ui-seg { outline: 1px dashed color-mix(in oklab, var(--brand) 60%, transparent); outline-offset: 0; }
.sc-corners .ui-seg__pill { outline: 1px dashed color-mix(in oklab, var(--brand) 60%, transparent); }
`;
