import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AppShell, Dropdown } from "../components/app-shell";
import { BrandLogo } from "../components/brand-logo";
import { ComposerSurface } from "../components/composer";
import { Composer } from "../containers/assistant-home";

function ControlledComposer({ disabled = false, longModels = false }: { disabled?: boolean; longModels?: boolean }) {
  const [value, setValue] = useState("");
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState("");
  const [model, setModel] = useState(longModels ? "Available model 001" : "Available model A");
  const models = longModels ? Array.from({ length: 100 }, (_, index) => `Available model ${String(index + 1).padStart(3, "0")}`) : ["Available model A", "Available model B"];
  return <div className="mx-auto w-full max-w-xl p-6">
    <ComposerSurface value={value} onValueChange={setValue} label="Message the Sensei" placeholder="Ask about the lesson…"
      busy={working} disabled={disabled || working} history={["Where are my files?", "Can I have a hint?"]}
      onSend={text => { setValue(""); setWorking(true); setStatus(`Sent: ${text}`); }}
      onStop={() => { setWorking(false); setStatus("Stopped"); }} leading={<span>Sensei</span>}
      controls={<Dropdown title="Harness model" align="end" items={models.map(label => ({
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
  args: { disabled: false, longModels: false },
  decorators: [Story => <div style={{ height: "100dvh" }}><AppShell brand={<BrandLogo />} navigation={[]} showUser={false} showNews={false} showFooter={false} showOnboarding={false}><Story /></AppShell></div>],
} satisfies Meta<typeof ControlledComposer>;
export default meta;
export const Controlled: StoryObj<typeof meta> = {};
export const Unavailable: StoryObj<typeof meta> = { args: { disabled: true } };
export const LongModelList: StoryObj<typeof meta> = { args: { longModels: true } };
export const UnavailableAttachments: StoryObj<typeof meta> = {
  render: () => <div className="mx-auto w-full max-w-xl p-6"><Composer tray={false} attachments="unavailable" dictation={false} plugins={false} models={[]} placeholder="Ask your Sensei…" /></div>,
};

function AttachmentComposer({ failOnce = false }: { failOnce?: boolean }) {
  const [sent, setSent] = useState("");
  const [reject, setReject] = useState(failOnce);
  return <div className="mx-auto w-full max-w-xl p-6">
    <Composer tray={false} dictation={false} plugins={false} models={[]} onSend={async (text, files: File[] = []) => {
      if (reject) { setReject(false); throw new Error("Try sending again."); }
      const attachments = await Promise.all(files.map(async file => ({ name: file.name, content: await file.text() })));
      setSent(JSON.stringify({ text, attachments }));
    }} />
    <output aria-label="Sent message">{sent}</output>
  </div>;
}
export const Attachments: StoryObj<typeof meta> = { render: () => <AttachmentComposer /> };
export const AttachmentRetry: StoryObj<typeof meta> = { render: () => <AttachmentComposer failOnce /> };
