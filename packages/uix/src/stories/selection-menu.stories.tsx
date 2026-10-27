import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AppShell, MenuButton } from "../components/app-shell";
import { CodexIcon, OpenCodeIcon, PiIcon } from "../components/harness-icons";

function SelectionMenu({ disabled = false }: { disabled?: boolean }) {
  const [agent, setAgent] = useState("opencode");
  const options = [{ value: "opencode", label: "OpenCode", icon: OpenCodeIcon }, { value: "codex", label: "Codex", icon: CodexIcon }, { value: "pi", label: "Pi", icon: PiIcon }];
  return <div style={{ height: "100dvh" }}><AppShell workspace="Dojo" user={{ name: "You" }} navigation={[]} showNews={false} showOnboarding={false}>
    <div className="mx-auto max-w-lg p-6"><MenuButton label="Coding agent" value={agent} options={options} onChange={setAgent} disabled={disabled} icon={options.find(option => option.value === agent)?.icon} align="start" /></div>
  </AppShell></div>;
}

const meta = { title: "Components/Molecules/Selection Menu", component: SelectionMenu, parameters: { layout: "fullscreen" }, args: { disabled: false } } satisfies Meta<typeof SelectionMenu>;
export default meta;
export const Controlled: StoryObj<typeof meta> = {};
export const Disabled: StoryObj<typeof meta> = { args: { disabled: true } };
