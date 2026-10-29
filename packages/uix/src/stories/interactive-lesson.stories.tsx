import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { InteractiveLesson } from "../components/interactive-lesson";
import { AgentChatWorkspace } from "../containers/learning-workspace";
import { BrandLogo } from "../components/brand-logo";
import { ChatMessage } from "../components/chat-message";
import { ComposerSurface } from "../components/composer";

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
    header={<span className="ui-as-chat__route">Sensei</span>}
    composer={<ComposerSurface id="example-composer" label="Message the sensei" value={message} onValueChange={setMessage} onSend={() => undefined} disabled placeholder="Preview conversation" />}>
    <ChatMessage role="user">Where do I find the lesson's references?</ChatMessage>
    <ChatMessage role="assistant">Open Resources below the material. It contains the links supplied by the author.</ChatMessage>
  </AgentChatWorkspace></div>;
}

const meta = { title: "Components/Organisms/Interactive lesson", component: InteractiveExample, parameters: { layout: "fullscreen" } } satisfies Meta<typeof InteractiveExample>;
export default meta;
export const PresentAndQuestion: StoryObj<typeof meta> = {};
export const Question: StoryObj<typeof meta> = { args: { initialStep: 1 } };
export const Complete: StoryObj<typeof meta> = { args: { initialStep: 2 } };
