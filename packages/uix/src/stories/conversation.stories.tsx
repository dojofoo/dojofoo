import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { AppShell } from "../components/app-shell";
import { BrandLogo } from "../components/brand-logo";
import { Button } from "../components/button";
import { ChatMessage } from "../components/chat-message";
import { ThinkingPanel } from "../components/thinking-panel";
import { ToolCallCard, type ToolCallStatus } from "../components/tool-call-card";

function Conversation() {
  const [status, setStatus] = useState<ToolCallStatus>("running");
  return <section aria-label="Conversation" className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
    <ChatMessage role="user">Can you check my solution?</ChatMessage>
    <ChatMessage role="assistant">
      <ThinkingPanel title={status === "running" ? "Checking solution" : "Checked solution"} done={status !== "running"} defaultOpen={false}>
        <ToolCallCard name="lesson.check" status={status} args={{ file: "answer.ts" }} error={status === "error" ? "The runner could not start." : undefined}
          result="Raw fallback" duration={status === "running" ? undefined : 42}>
          {status === "success" ? <section aria-label="Structured result"><strong>2 tests passed</strong><p>The solution returns the expected answer.</p></section> : null}
        </ToolCallCard>
      </ThinkingPanel>
      <p className="ui-as-msg__p">The check output stays with the tool call.</p>
    </ChatMessage>
    <div className="flex gap-2">
      <Button onClick={() => setStatus("running")}>Start check</Button>
      <Button onClick={() => setStatus("success")}>Finish check</Button>
      <Button onClick={() => setStatus("error")}>Fail check</Button>
    </div>
  </section>;
}
const meta = {
  title: "Components/Organisms/Conversation", component: Conversation,
  parameters: { layout: "fullscreen" },
  decorators: [Story => <div style={{ height: "100dvh" }}><AppShell brand={<BrandLogo />} navigation={[]} showUser={false} showNews={false} showFooter={false} showOnboarding={false}><Story /></AppShell></div>],
} satisfies Meta<typeof Conversation>;
export default meta;
export const Controlled: StoryObj<typeof meta> = {};
