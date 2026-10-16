import type { Meta, StoryObj } from "@storybook/react-vite";
import { FolderScreen } from "~/components/folder";
import { OnboardingScreen } from "~/components/onboarding";
import { SettingsBillingScreen } from "~/components/settings-billing";

/** affectUI's screens as installed: onboarding, settings & billing, and a folder – the look for installed courses */
const meta = { title: "Screens/affectUI", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const shell = { workspace: "Dojofoo", user: { name: "You" } };

export const Onboarding: Story = { render: () => <div className="h-dvh"><OnboardingScreen {...shell} /></div> };
export const Settings: Story = { render: () => <div className="h-dvh"><SettingsBillingScreen {...shell} defaultTab="General" /></div> };
export const Billing: Story = { render: () => <div className="h-dvh"><SettingsBillingScreen {...shell} /></div> };
export const Courses: Story = { render: () => <div className="h-dvh"><FolderScreen {...shell} /></div> };
