import type { Meta, StoryObj } from "@storybook/react-vite";
import { Switch } from "../components/switch";

const meta = {
  title: "Components/Atoms/Switch",
  component: Switch,
  parameters: { layout: "centered" },
  args: { "aria-label": "Toggle", defaultChecked: false, disabled: false },
} satisfies Meta<typeof Switch>;
export default meta;
export const Default: StoryObj<typeof meta> = {
  render: args => <label style={{ display: "flex", alignItems: "center", gap: 12 }}>Enable feature <Switch {...args} /></label>,
};
export const States: StoryObj<typeof meta> = {
  render: () => <div style={{ display: "flex", gap: 32 }}>
    {(["light", "dark"] as const).map(mode => <section key={mode} className={mode} aria-label={`${mode} switches`} style={{ background: "var(--surface-2)", color: "var(--fluid-foreground)", padding: 24, display: "grid", gap: 16 }}>
      <span>{mode === "light" ? "Light" : "Dark"}</span>
      <label style={{ display: "flex", gap: 12 }}>Off <Switch aria-label={`${mode} off`} /></label>
      <label style={{ display: "flex", gap: 12 }}>On <Switch defaultChecked aria-label={`${mode} on`} /></label>
      <label style={{ display: "flex", gap: 12 }}>Disabled off <Switch disabled aria-label={`${mode} disabled off`} /></label>
      <label style={{ display: "flex", gap: 12 }}>Disabled on <Switch defaultChecked disabled aria-label={`${mode} disabled on`} /></label>
    </section>)}
  </div>,
};
