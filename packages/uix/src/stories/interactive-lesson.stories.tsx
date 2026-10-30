import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { InteractiveLesson } from "../components/interactive-lesson";
import { AgentChatWorkspace } from "../containers/learning-workspace";
import { BrandLogo } from "../components/brand-logo";
import { ChatTranscript } from "../components/chat-transcript";
import { StreamedChatMessage } from "../components/streamed-message";
import { sensei, text, user } from "./fixtures/sensei-chat";
import { Composer } from "../containers/assistant-home";
import { OpenCodeIcon } from "../components/harness-icons";

const conversation = [
  user("u1", "Where do I find the lesson's references?"),
  sensei("a1", text("Open **Resources** below the material. It contains the links supplied by the author.")),
];

function InteractiveExample({ initialStep = 0 }: { initialStep?: number }) {
  const [step, setStep] = useState(initialStep);
  const [answer, setAnswer] = useState("");
  const [response, setResponse] = useState<{ answer: string; correct: boolean }>();
  const [message, setMessage] = useState("");
  return <div style={{ height: "100dvh" }}><AgentChatWorkspace brand={<BrandLogo />} workspace="Dojo" navigation={[]}
    showUser={false} showNews={false} showFooter={false} showOnboarding={false}
    crumbs={[{ label: "Courses" }, { label: "How to run a dojo" }]} contentKind="material" editor={null} askAssistant={false}
    details={<InteractiveLesson title={step === 0 ? "Find your way around" : step === 1 ? "Find resources" : "Course complete"}
      step={step} totalSteps={2} complete={step === 2} question={step === 1} answer={answer} onAnswerChange={setAnswer}
      response={response} explanation={<p>The Resources section contains the lesson's authored links.</p>}
      onAnswer={() => setResponse({ answer, correct: answer.trim().toLowerCase() === "resources" })}
      onNext={() => setStep(value => value + 1)}>
      <p>{step === 0 ? "Read the material here, and ask Sensei whenever you need a hand." : "Which view contains the lesson's authored links?"}</p>
    </InteractiveLesson>}
    header={<span className="ui-as-chat__route ui-as-chat__speaker"><span className="ui-as-chat__dot" aria-hidden="true" /><b>Sensei</b><span className="ui-as-chat__speaker-note">Teaches this lesson</span></span>}
    composer={<Composer tray={false} attachments="unavailable" dictation={false} plugins={false} agent={{ value: "opencode", name: "OpenCode", icon: OpenCodeIcon }}
      id="interactive-sensei" label="Message the sensei" placeholder="Ask your Sensei…" value={message} onValueChange={setMessage} onSend={() => setMessage("")} />}>
    <div className="ui-as-chat__turns">
      <ChatTranscript streaming={false} messages={conversation} renderMessage={(message, streaming) => <StreamedChatMessage key={message.id} message={message} streaming={streaming} />} />
    </div>
  </AgentChatWorkspace></div>;
}

const meta = { title: "Components/Organisms/Interactive lesson", component: InteractiveExample, parameters: { layout: "fullscreen" } } satisfies Meta<typeof InteractiveExample>;
export default meta;
export const PresentAndQuestion: StoryObj<typeof meta> = {};
export const Question: StoryObj<typeof meta> = { args: { initialStep: 1 } };
export const Complete: StoryObj<typeof meta> = { args: { initialStep: 2 } };
