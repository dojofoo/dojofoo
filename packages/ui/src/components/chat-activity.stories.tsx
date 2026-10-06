import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ReasoningTrace } from "./ui/ReasoningTrace";
import { ToolCallCard } from "./ui/ToolCallCard";
import { AgentQuestion } from "./chat/agent-question";
import { ApprovalCard, type ApprovalDecision } from "./ui/ApprovalCard";
import { InlineDiff } from "./ui/InlineDiff";
import { ThinkingIndicator } from "./ui/thinking-indicator";
import { activityLabels, type ActivityKind } from "@/lib/chat-activity-labels";
import { StreamedChatMessage } from "@/routes/index";

function StreamedActivity() {
  const [stage, setStage] = useState(0);
  return <div className="w-full max-w-xl bg-background text-foreground">
    <button onClick={() => setStage(stage + 1)}>Next chunk</button>
    <ReasoningTrace autoPlay={false} streaming={stage < 2} steps={stage === 0 ? ["Inspecting the course"] : ["Inspecting the course", "Checking the lesson files"]} />
    {stage >= 2 && <ToolCallCard name="read_file" autoPlay={false} status="done" args={{ path: "SENSEI.md" }} result="Lesson instructions loaded" />}
    {stage >= 2 && <ToolCallCard name="failed_read" autoPlay={false} status="error" error="File not found" />}
  </div>;
}
export default { title: "Chat/Activity", component: StreamedActivity } satisfies Meta<typeof StreamedActivity>;
export const Streaming: StoryObj<typeof StreamedActivity> = {};

export const DynamicIndicator: StoryObj<{ activity: ActivityKind; active: boolean }> = {
  args: { activity: "thinking", active: true },
  argTypes: {
    activity: { control: "select", options: Object.keys(activityLabels) },
    active: { control: "boolean" },
  },
  render: ({ activity, active }) => <ThinkingIndicator activity={activity} active={active}
    label={active ? activityLabels[activity].label : "Finished"} />,
};

export const ToolActivityLabels: StoryObj<typeof StreamedActivity> = {
  render: () => <div className="w-full max-w-xl bg-background text-foreground">
    {[
      { name: "read_file", path: "DOJO.md" },
      { name: "edit_file", path: "SENSEI.mdx" },
      { name: "edit_file", path: "kata.test.ts" },
      { name: "run_tests", path: "" },
      { name: "sleep", path: "" },
    ].map((tool, index) => <StreamedChatMessage key={index} fragments={{}} workspaceId="storybook" streaming
      message={{ id: `tool-${index}`, role: "assistant", parts: [{ type: "tool-call", id: `call-${index}`, name: tool.name, arguments: JSON.stringify({ path: tool.path }), input: { path: tool.path }, state: "input-complete" }] }} />)}
  </div>,
};

export const ToolOutputs: StoryObj<typeof StreamedActivity> = {
  render: () => <div className="w-full max-w-xl bg-background text-foreground">
    <ToolCallCard name="inspect_result" autoPlay={false} status="done" defaultOpen
      result={'{"passed":3,"total":4,"message":"<script>not executable</script>"}'} />
    <ToolCallCard name="read_file" autoPlay={false} status="done" defaultOpen resultLanguage="typescript"
      result={'export const count: number = 3;'} />
    <ToolCallCard name="status" autoPlay={false} status="done" defaultOpen result="Lesson instructions loaded" />
  </div>,
};

export const LongReasoning: StoryObj<typeof StreamedActivity> = {
  render: () => <div className="w-full max-w-xl bg-background text-foreground">
    <ReasoningTrace autoPlay={false} durationMs={12500} steps={Array.from({ length: 24 }, (_, index) =>
      `Step ${index + 1}: Review the available lesson evidence and identify the next useful concept. ${"long-reference/".repeat(12)}`)} />
    <p>The assistant response stays below the compact reasoning panel.</p>
  </div>,
};

export const ExpandableChain: StoryObj<typeof StreamedActivity> = {
  render: () => <div className="w-full max-w-xl bg-background text-foreground">
    <StreamedChatMessage fragments={{}} workspaceId="storybook" message={{ id: "long-chain", role: "assistant", parts: [
      { type: "thinking", content: "Inspect the lesson evidence before choosing the next step.\n".repeat(40) },
      { type: "tool-call", id: "read", name: "read_file", arguments: "{}", state: "complete", output: "Lesson instructions loaded" },
      { type: "thinking", content: "Review the learner's previous attempts.\n".repeat(40) },
    ] }} />
  </div>,
};

function DirectQuestionPreview() {
  const [answer, setAnswer] = useState<string>();
  return <div className="w-full max-w-xl space-y-3 bg-background text-foreground">
    <ReasoningTrace autoPlay={false} steps={["Reviewed the lesson checks."]} />
    <div className="w-full">
    <ToolCallCard name="read_file" autoPlay={false} status="done" args={{ path: "SENSEI.md" }} result="Lesson instructions loaded" />
    <ToolCallCard name="lesson_checks" autoPlay={false} status="done" result="All checks passed" />
    <ToolCallCard name="failed_read" autoPlay={false} status="error" error="File not found" />
    </div>
    <p>Your checks pass. How would you like to continue?</p>
    <AgentQuestion className="w-full" questions={[{
      id: "next",
      title: "What would you like to do next?",
      options: [
        { id: "review", title: "Review", description: "Explore your approach together." },
        { id: "move-on", title: "Move on", description: "Start the next lesson." },
        { id: "pause", title: "Pause", description: "Continue another time." },
      ],
    }]} onAnswer={(answers) => setAnswer(answers.next.selectedIds[0])} />
    {answer && <p role="status">Selected: {answer}</p>}
  </div>;
}

export const DirectQuestion: StoryObj<typeof StreamedActivity> = {
  render: () => <DirectQuestionPreview />,
};

const beforeLesson = "# First lesson\n\nAsk the learner to implement the function.";
const afterLesson = "# First lesson\n\nStart with a concrete example.\nTeach unfamiliar syntax before asking the learner to apply it.";

function EditingPreview() {
  const [decision, setDecision] = useState<ApprovalDecision | null>(null);
  return <div className="w-full max-w-xl space-y-3 bg-background text-foreground">
    <p>I'd clarify the first teaching step before introducing the exercise.</p>
    <ApprovalCard title="Update the lesson guidance?"
      description="Storybook preview only. No files are changed."
      className="max-w-none rounded-none"
      allowAlways={false} autoApproveIn={0} collapseOnDecide={false}
      decision={decision} onDecide={setDecision}>
      <InlineDiff before={beforeLesson} after={afterLesson} fileName="SENSEI.md"
        autoPlay={false} showActions={false} className="max-w-none rounded-none" />
    </ApprovalCard>
    {decision === "allow" && <ToolCallCard name="edit_file" args={{ path: "SENSEI.md" }}
      status="done" autoPlay={false}>
      <InlineDiff before={beforeLesson} after={afterLesson} fileName="SENSEI.md"
        autoPlay={false} showActions={false} className="max-w-none rounded-none" />
    </ToolCallCard>}
  </div>;
}

export const EditingApproval: StoryObj<typeof StreamedActivity> = {
  render: () => <EditingPreview />,
};
