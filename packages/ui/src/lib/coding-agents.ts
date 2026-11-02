import { agentIcons } from "@dojofoo/uix/components/harness-icons";
import { agentDefinitions } from "@dojofoo/config/agents";
import type { ComposerAgent } from "@dojofoo/uix/containers/assistant-home";

/** Names and marks only; runtime owners decide which choices are supported. */
export const codingAgents: ComposerAgent[] = agentDefinitions.map(agent => ({ value: agent.id, name: agent.name, icon: agentIcons[agent.id] }));
