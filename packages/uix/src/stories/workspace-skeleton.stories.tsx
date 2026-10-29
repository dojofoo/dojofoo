import type { Meta, StoryObj } from "@storybook/react-vite";
import { WorkspaceSkeleton } from "../components/workspace-skeleton";

const meta = { title: "Components/Atoms/Workspace Skeleton", component: WorkspaceSkeleton,
  parameters: { layout: "padded" }, decorators: [Story => <div className="h-64 max-w-xl bg-[var(--surface-2)]"><Story /></div>],
} satisfies Meta<typeof WorkspaceSkeleton>;
export default meta;
export const Files: StoryObj<typeof meta> = {};
