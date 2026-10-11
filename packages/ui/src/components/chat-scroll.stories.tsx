import { useState } from "react";
import type { UIMessage } from "@tanstack/ai-react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AuthoringChat } from "./authoring-chat";

const textMessage = (id: string, content: string, role: "assistant" | "user" = "assistant"): UIMessage => ({
  id, role, parts: [{ type: "text", content }],
});

function ScrollExample({ freeText = false }: { freeText?: boolean }) {
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<UIMessage[]>([
    textMessage("intro", "Earlier course discussion.\n\n".repeat(25)),
    { id: "choice", role: "assistant", parts: [{
      type: "tool-call", id: "question", name: "ask_user", state: "input-complete", arguments: "{}",
      input: { questions: [{ id: "next", title: "How should we continue?", freeText,
        options: freeText ? [] : [{ id: "review", title: "Review" }, { id: "next", title: "Next lesson" }] }] },
    }] },
    textMessage("later", "Later course discussion.\n\n".repeat(25)),
  ]);
  const append = (content: string, role: "assistant" | "user" = "assistant") =>
    setMessages(current => [...current, textMessage(String(current.length), content, role)]);
  return <main className="flex h-[36rem] w-[30rem] flex-col">
    <button onClick={() => append("New streamed output.\n\n".repeat(8))}>Append output</button>
    <AuthoringChat messages={messages} status="ready" busy={false} value={value} onValueChange={setValue}
      onSend={text => { append(text, "user"); setValue(""); }}
      onAnswer={() => append("Your answer was received.\n\n".repeat(8))} />
  </main>;
}

export default { title: "Chat/Scrolling", component: ScrollExample } satisfies Meta<typeof ScrollExample>;
export const MultipleChoice: StoryObj<typeof ScrollExample> = {};
export const FreeText: StoryObj<typeof ScrollExample> = { args: { freeText: true } };
