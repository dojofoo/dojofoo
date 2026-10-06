import type { UIMessage } from "@tanstack/ai-react";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { ChatContainer, ChatContainerContent, ChatContainerFooter } from "@dojofoo/ui/chat-container";
import { InputMessage } from "@dojofoo/ui/input-message";
import { Button } from "@dojofoo/ui/button";
import { StreamedChatMessage } from "@/routes/index";
import { ChatTranscript } from "./chat/assistant-response";

/** Shared presentation for ACP and Eve. Neither backend owns a separate layout. */
export function AuthoringChat({ messages, status, busy, value, onValueChange, onSend, onAnswer, error, onRetryAnswer }: {
  messages: UIMessage[];
  status: string;
  busy: boolean;
  value: string;
  onValueChange(value: string): void;
  onSend(value: string): void;
  onAnswer(answers: Record<string, AskUserAnswer>): void | Promise<void>;
  error?: string;
  onRetryAnswer?: () => void;
}) {
  return <ChatContainer data-testid="authoring-chat-pane">
    <ChatContainerContent>
      <ChatTranscript messages={messages} streaming={busy || status === "submitted" || status === "streaming"}
        renderMessage={(message, streaming) => <StreamedChatMessage fragments={{}} message={message} onToolAnswer={onAnswer} streaming={streaming} workspaceId="" />} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {onRetryAnswer ? <Button disabled={busy} onClick={onRetryAnswer}>Retry answer</Button> : null}
    </ChatContainerContent>
    <ChatContainerFooter data-testid="authoring-chat-composer">
      <InputMessage disabled={busy}
        history={messages.filter(({ role }) => role === "user").map(entry => entry.parts.flatMap(part => part.type === "text" ? [part.content] : []).join(""))}
        onSend={onSend} onValueChange={onValueChange} placeholder="Shape the course with Kyoshi…" sendLabel="Send"
        status={busy || status === "streaming" || status === "submitted" ? "streaming" : "idle"} value={value} />
    </ChatContainerFooter>
  </ChatContainer>;
}
