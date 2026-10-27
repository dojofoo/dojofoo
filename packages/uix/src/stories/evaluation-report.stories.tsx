import type { Meta, StoryObj } from "@storybook/react-vite";
import { EvalsReportPanel } from "../components/evals";
import { teachingReport } from "./fixtures/evaluation-report";

const meta = {
  title: "Components/Organisms/Evaluation Report",
  component: EvalsReportPanel,
  parameters: { layout: "fullscreen" },
  args: teachingReport,
} satisfies Meta<typeof EvalsReportPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Findings: Story = {};
export const Running: Story = { args: { title: "Evaluation running", findings: [], limitations: [], notice: undefined } };
export const ProviderFailure: Story = { args: { title: "Evaluation could not finish", findings: [], limitations: [], notice: undefined, error: "Provider unavailable" } };
export const Outdated: Story = { args: { title: "Evaluation report is out of date" } };
