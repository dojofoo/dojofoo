import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderScreen } from "./folder";
import { OnboardingScreen } from "./onboarding";
import { SettingsBillingScreen } from "./settings-billing";
import { AgentChatScreen } from "~/containers/agent-chat";
import { AssistantHomeScreen } from "~/containers/assistant-home";
import { ChatComposer } from "~/components/chat-composer";

/** affectUI's screens as installed: onboarding, settings & billing, and a folder – the look for installed courses */
const meta = { title: "Archive/AffectUI", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const shell = { workspace: "Dojofoo", user: { name: "You" } };

export const Onboarding: Story = { render: () => <div className="h-dvh"><OnboardingScreen {...shell} /></div> };
export const Settings: Story = { render: () => <div className="h-dvh"><SettingsBillingScreen {...shell} defaultTab="General" /></div> };
export const Billing: Story = { render: () => <div className="h-dvh"><SettingsBillingScreen {...shell} /></div> };
export const Courses: Story = { render: () => <div className="h-dvh"><FolderScreen {...shell} /></div> };
export const AgentChat: Story = { render: () => <div className="h-dvh"><AgentChatScreen {...shell} /></div> };
export const AssistantHome: Story = { render: () => <div className="h-dvh"><AssistantHomeScreen {...shell} /></div> };
export const Composer: Story = { render: () => <div className="mx-auto max-w-3xl p-10"><ChatComposer /></div> };
