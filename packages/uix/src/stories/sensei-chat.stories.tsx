import type { Meta, StoryObj } from "@storybook/react-vite";
import type { UIMessage } from "@tanstack/ai-client";
import { useEffect, useRef, useState } from "react";
import { AgentChatWorkspace } from "../containers/learning-workspace";
import { Composer } from "../containers/assistant-home";
import { CodeEditor, Editor, EditorTabs } from "../containers/editor";
import { BrandLogo } from "../components/brand-logo";
import { Icon } from "../components/app-shell";
import { LessonBrief } from "../components/lesson-brief";
import { ChatTranscript } from "../components/chat-transcript";
import { StreamedChatMessage } from "../components/streamed-message";
import { OpenCodeIcon } from "../components/harness-icons";
import type { AskUserAnswer } from "../components/ask-user-questions";
import type { CodeHighlight } from "../lib/code-highlight";
import { BackIcon } from "../lib/icons";
import * as chat from "./fixtures/sensei-chat";

/**
 * The Sensei's chat, on the right of a lesson, as the app renders it: AgentChatWorkspace's conversation column with
 * the Sensei's header and composer, its messages through StreamedChatMessage (components/streamed-message) – the
 * renderer packages/ui's lesson uses. Each story is a moment of a lesson (fixtures/sensei-chat.ts): thinking, working
 * through tools, waiting, the checks, the questions it asks, line references that highlight the editor, and its
 * Markdown. Answer a question or click a line chip: the chat and the editor respond as they do in the app.
 */
function SenseiChat({ messages: initial, streaming = false, typing }: { messages: UIMessage[]; streaming?: boolean; typing?: string }) {
  const [messages, setMessages] = useState(initial);
  useEffect(() => setMessages(initial), [initial]);
  const [highlight, setHighlight] = useState<CodeHighlight & { nonce: number }>();
  const [question, setQuestion] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const typed = useTyping(typing);
  const shown = typing === undefined ? messages : [...messages, chat.sensei("typing", chat.text(typed))];
  const working = streaming || (typing !== undefined && typed.length < typing.length);

  // An answer completes the question's tool call, as the agent's reply to it would
  const answer = (answers: Record<string, AskUserAnswer>) => setMessages((all) => all.map((message) => ({
    ...message,
    parts: message.parts.map((part) => part.type === "tool-call" && part.state !== "complete"
      ? { ...part, state: "complete" as const, output: { answers: Object.fromEntries(Object.values(answers).map((item) => [item.questionId, [...item.selectedIds, ...(item.otherText ? [item.otherText] : [])]])) } }
      : part),
  })));

  return (
    <div style={{ height: "100dvh" }}>
      <AgentChatWorkspace brand={<BrandLogo />} workspace="Dojo" navigation={[]} showUser={false} showNews={false} showFooter={false} showOnboarding={false}
        crumbs={[{ label: "Dashboard", icon: <Icon icon={BackIcon} size={14} /> }, { label: "Objects" }, { label: "Merge settings" }]}
        editor={<Editor flush tabs={<EditorTabs mode="learning" label="Lesson files" active="kata.ts" tabs={[{ path: "kata.ts", label: "kata.ts" }]} onSelect={() => {}} />}>
          <CodeEditor code={chat.kata} filePath="src/objects/merge-settings/kata.ts" language="typescript" lessonApiBase="" readOnly={false} coverage={false} highlight={highlight} onChange={() => {}} />
        </Editor>}
        details={<LessonBrief title="Merge settings" lead="Fill in what a person leaves out with the defaults."><h3>Goal</h3><p>The person's settings win over the defaults.</p></LessonBrief>}
        header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Sensei</b><span className="ui-as-chat__speaker-note">Teaches this lesson</span></span>}
        scroller={scroller}
        composer={<Composer tray={false} attachments="unavailable" dictation={false} plugins={false} agent={{ value: "opencode", name: "OpenCode", icon: OpenCodeIcon }}
          id="course-message" label="Message the sensei" value={question} onValueChange={setQuestion} placeholder="Ask your Sensei…"
          busy={working} onStop={() => {}} onSend={(text) => { setQuestion(""); setMessages((all) => [...all, chat.user(`u${all.length + 1}`, text)]); }}
          history={messages.filter((item) => item.role === "user").flatMap((item) => item.parts.flatMap((part) => part.type === "text" ? [part.content] : []))} />}>
        <div data-testid="chat-pane" className="ui-as-chat__turns">
          <ChatTranscript messages={shown} streaming={working} renderMessage={(message, live) => (
            <StreamedChatMessage key={message.id} message={message} streaming={live} onToolAnswer={answer}
              onHighlight={(lines) => setHighlight({ ...lines, nonce: Date.now() })} />
          )} />
        </div>
      </AgentChatWorkspace>
    </div>
  );
}

/** `text`, a few characters at a time, as a reply streams in */
function useTyping(text: string | undefined) {
  const [length, setLength] = useState(0);
  useEffect(() => {
    setLength(0);
    if (text === undefined) return;
    const timer = window.setInterval(() => setLength((at) => {
      if (at >= text.length) { window.clearInterval(timer); return at; }
      return Math.min(text.length, at + 3);
    }), 40);
    return () => window.clearInterval(timer);
  }, [text]);
  return text?.slice(0, length) ?? "";
}

const meta = {
  title: "Components/Organisms/Sensei Chat",
  component: SenseiChat,
  parameters: { layout: "fullscreen" },
  args: { messages: chat.lesson },
  argTypes: { messages: { table: { disable: true } }, typing: { table: { disable: true } } },
} satisfies Meta<typeof SenseiChat>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Lesson: Story = {};
export const Thinking: Story = { args: { messages: chat.thinkingNow, streaming: true } };
export const Working: Story = { args: { messages: chat.working, streaming: true } };
export const Waiting: Story = { args: { messages: chat.waiting, streaming: true } };
export const Testing: Story = { args: { messages: chat.testing, streaming: true } };
export const ChecksFailed: Story = { args: { messages: chat.checksFailed } };
export const ChecksPassed: Story = { args: { messages: chat.checksPassed } };
export const ToolCalls: Story = { args: { messages: chat.toolCalls } };
export const AskOneAnswer: Story = { args: { messages: chat.askChoice } };
export const AskSeveralAnswers: Story = { args: { messages: chat.askMany } };
export const AskOpenQuestion: Story = { args: { messages: chat.askText } };
export const AskAnswered: Story = { args: { messages: chat.askAnswered } };
export const LineHighlights: Story = { args: { messages: chat.highlights } };
export const Markdown: Story = { args: { messages: chat.markdown } };
export const Streaming: Story = { args: { messages: [chat.user("u1", "Why does the order matter?")], typing: chat.streamingReply } };
