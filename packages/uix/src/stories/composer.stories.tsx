import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AppShell, Dropdown } from "../components/app-shell";
import { BrandLogo } from "../components/brand-logo";
import { ComposerSurface } from "../components/composer";
import { ClaudeIcon, CodexIcon, OpenCodeIcon } from "../components/harness-icons";
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
/** The agent's session is still loading: the agent and model pickers wait with a spinner */
export const LoadingSession: StoryObj<typeof meta> = {
  render: () => <div className="mx-auto w-full max-w-xl p-6">
    <Composer tray={false} attachments={false} dictation={false} plugins={false} placeholder="Ask your Sensei…" disabled loading
      agent={{ value: "opencode", name: "OpenCode", icon: OpenCodeIcon }} onAgentChange={() => undefined} models={[]}
      agents={[{ value: "opencode", name: "OpenCode", icon: OpenCodeIcon }, { value: "codex", name: "Codex", icon: CodexIcon }]} />
  </div>,
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

/** A coding agent's model menu: each model's name with its version, its description and its own effort levels, as Claude Code
 *  (the Agent SDK's supportedModels) and Codex (its model catalog) list them */
const claudeModels = [
  { value: "default", name: "Default (recommended)", description: "Opus 5.5 · Best for everyday, complex tasks", efforts: ["low", "medium", "high", "xhigh", "max"] },
  { value: "opus", name: "Opus 5.5", description: "For complex work and everyday tasks", efforts: ["low", "medium", "high", "xhigh", "max"] },
  { value: "fable", name: "Fable 5.1", description: "For your toughest challenges", efforts: ["low", "medium", "high", "xhigh", "max"] },
  { value: "sonnet", name: "Sonnet 5.5", description: "Most efficient for simpler tasks", efforts: ["low", "medium", "high", "xhigh", "max"] },
  { value: "haiku", name: "Haiku 4.5", description: "Fastest for quick answers", efforts: [] },
].map(model => ({ ...model, icon: ClaudeIcon }));
const codexModels = [
  { value: "gpt-6.1-sol", name: "GPT-6.1-Sol", description: "Latest workhorse model for coding and everyday work.", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"], effort: "low" },
  { value: "gpt-6-astra", name: "GPT-6-Astra", description: "Frontier intelligence for the most demanding work.", efforts: ["low", "medium", "high", "xhigh", "max", "ultra"], effort: "medium" },
  { value: "gpt-6-luna", name: "GPT-6-Luna", description: "Fast and affordable model for easier tasks.", efforts: ["low", "medium", "high", "xhigh", "max"], effort: "medium" },
].map(model => ({ ...model, icon: CodexIcon }));
type AgentModel = { value: string; name: string; description: string; efforts: string[]; effort?: string; icon: typeof CodexIcon };
function AgentModels({ agent, models, initial }: { agent: { name: string; icon: typeof CodexIcon }; models: AgentModel[]; initial?: string }) {
  const [model, setModel] = useState(initial ?? models[0]!.value);
  const [effort, setEffort] = useState<string>();
  return <div className="mx-auto flex min-h-[520px] w-full max-w-xl flex-col justify-end p-6">
    <Composer tray={false} dictation={false} plugins={false} attachments="unavailable" agent={agent} models={models}
      model={model} onModelChange={next => { setModel(next); setEffort(undefined); }} effort={effort} onEffortChange={setEffort} />
  </div>;
}
export const ClaudeCodeModels: StoryObj<typeof meta> = { render: () => <AgentModels agent={{ name: "Claude Code", icon: ClaudeIcon }} models={claudeModels} initial="default" /> };
export const CodexModels: StoryObj<typeof meta> = { render: () => <AgentModels agent={{ name: "Codex", icon: CodexIcon }} models={codexModels} /> };
