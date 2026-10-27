import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { AppShell } from "../components/app-shell";
import { BrandLogo } from "../components/brand-logo";
import { LearningLibrary } from "../containers/learning-library";

const meta = {
  title: "Components/Organisms/Learning Library",
  component: LearningLibrary,
  parameters: { layout: "fullscreen" },
  args: {
    courses: [{ id: "local", title: "Everyday TypeScript", mark: "TypeScript", caption: "Objects", detail: "Merge settings", progress: 42, onOpen: fn() }],
    drafts: [{ id: "draft", title: "My first dojo", caption: "Draft", detail: "Resume authoring", onOpen: fn() }],
    onExplore: fn(),
  },
  decorators: [Story => <div style={{ height: "100dvh" }}><AppShell workspace="Dojo" brand={<BrandLogo />} navigation={[]} showUser={false} showNews={false} showFooter={false} showOnboarding={false}><Story /></AppShell></div>],
} satisfies Meta<typeof LearningLibrary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Installed: Story = {};
export const UnknownProgress: Story = { args: { courses: [{ id: "local", title: "An installed course", caption: "First lesson", detail: "Local workspace", onOpen: fn() }], drafts: [] } };
export const Loading: Story = { args: { courses: [], drafts: [], loading: true } };
export const Empty: Story = { args: { courses: [], drafts: [] } };
export const Unavailable: Story = { args: { courses: [], drafts: [], error: "The course directory is unavailable." } };
