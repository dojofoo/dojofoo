import { useState } from "react";
import { Composer, type ComposerAgent, type ComposerModel } from "../containers/assistant-home";
import { CodexIcon, OpenCodeIcon, PiIcon } from "../components/harness-icons";
import { AiMagicIcon } from "../lib/icons";

// Pages preview data only. Native hosts supply their own advertised capabilities.
const agents: ComposerAgent[] = [
  { value: "opencode", name: "OpenCode", icon: OpenCodeIcon },
  { value: "codex", name: "Codex", icon: CodexIcon },
  { value: "pi", name: "Pi", icon: PiIcon },
];
const deepseek: ComposerModel = { value: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro", description: "DeepSeek", icon: AiMagicIcon };
const astra: ComposerModel = { value: "openai/gpt-6.1-astra", name: "GPT-6.1-Astra", description: "OpenAI", effort: "medium", icon: AiMagicIcon };
const catalogs: Record<string, ComposerModel[]> = { opencode: [deepseek, astra], codex: [astra], pi: [deepseek, astra] };

/** Current Pages controller; production uses Composer with its native catalog. */
export function CourseComposer({ authoring = false, ...props }: Omit<Parameters<typeof Composer>[0], "agent" | "agents" | "onAgentChange" | "model" | "models" | "onModelChange"> & { authoring?: boolean }) {
  const [agentId, setAgentId] = useState("opencode");
  const [model, setModel] = useState(catalogs.opencode[0].value!);
  const available = authoring ? agents : agents.filter(agent => agent.value !== "pi");
  return <Composer {...props} dictation={false} plugins={false} agent={available.find(agent => agent.value === agentId)!}
    agents={available} onAgentChange={value => { setAgentId(value); setModel(catalogs[value][0].value!); }}
    model={model} models={catalogs[agentId]} onModelChange={setModel} />;
}
