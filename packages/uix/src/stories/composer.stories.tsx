import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AppShell, Dropdown } from "../components/app-shell";
import { BrandLogo } from "../components/brand-logo";
import { ComposerSurface } from "../components/composer";

function ControlledComposer({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState("");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [model, setModel] = useState("Available model A");
  return <div className="mx-auto w-full max-w-xl p-6">
    <ComposerSurface value={value} onValueChange={setValue} label="Message the Sensei" placeholder="Ask about the lesson…"
      busy={working} disabled={disabled || working} history={["Where are my files?", "Can I have a hint?"]}
      onSend={text => { setValue(""); setWorking(true); setStatus(`Sent: ${text}`); }}
      onStop={() => { setWorking(false); setStatus("Stopped"); }} leading={<span>Sensei</span>}
      controls={<Dropdown title="Harness model" align="end" items={["Available model A", "Available model B"].map(label => ({
        label, checked: model === label, onSelect: () => setModel(label),
      }))} trigger={({ open, toggle }) => <button type="button" className="ui-as-ghost ui-as-ghost--model"
        aria-label="Harness model" aria-haspopup="menu" aria-expanded={open} disabled={disabled || working} onClick={toggle}>{model}</button>} />} />
    <p role="status" className="mt-4">{status}</p>
  </div>;
}
const meta = {
  title: "Components/Molecules/Composer",
  component: ControlledComposer,
  parameters: { layout: "fullscreen" },
  args: { disabled: false },
  decorators: [Story => <AppShell brand={<BrandLogo />} navigation={[]} showUser={false} showNews={false} showFooter={false} showOnboarding={false}><Story /></AppShell>],
} satisfies Meta<typeof ControlledComposer>;
export default meta;
export const Controlled: StoryObj<typeof meta> = {};
export const Unavailable: StoryObj<typeof meta> = { args: { disabled: true } };
