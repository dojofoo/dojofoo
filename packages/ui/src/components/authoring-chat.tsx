import type { UIMessage } from "@tanstack/ai-react";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { ChatContainer, ChatContainerContent, ChatContainerFooter } from "@dojofoo/ui/chat-container";
import { Composer } from "@dojofoo/uix/containers/assistant-home";
import { AiBrain01Icon } from "@dojofoo/uix/icons";
import { ConversationContent } from "@dojofoo/uix/containers/learning-workspace";
import { Button } from "@dojofoo/uix/components/button";
import { MessageQueue, type QueuedMessage } from "@dojofoo/uix/components/message-queue";
import { StreamedChatMessage } from "@/components/chat/streamed-message";
import { ChatTranscript } from "./chat/assistant-response";
import { useChatScroll } from "@/hooks/use-chat-scroll";

/** Shared presentation for ACP and Eve. Neither backend owns a separate layout. */
export function AuthoringChat({ messages, status, busy, inputDisabled = false, readOnly = false, value, onValueChange, onSend, onStop, onAnswer, error, onRetryAnswer, onRetryLoad, queue = [], onCancelQueued, queueLabel = "Kyoshi is responding", embedded = false, attachments = false, files, onFilesChange, placeholder = "Shape this lesson with Kyoshi…" }: {
  embedded?: boolean;
  placeholder?: string;
  messages: UIMessage[];
  status: string;
  busy: boolean;
  inputDisabled?: boolean;
  readOnly?: boolean;
  value: string;
  onValueChange(value: string): void;
  onSend(value: string, files: File[]): void | Promise<void>;
  attachments?: boolean;
  files?: File[];
  onFilesChange?: (files: File[]) => void;
  onStop?: () => void;
  onAnswer(answers: Record<string, AskUserAnswer>): void | Promise<void>;
  error?: string;
  onRetryAnswer?: () => void;
  onRetryLoad?: () => void;
  queue?: QueuedMessage[];
  onCancelQueued?: (id: string) => void;
  queueLabel?: string;
}) {
  const { viewportRef, scrollToBottom } = useChatScroll();
  const active = busy || status === "submitted" || status === "streaming";
  const transcript = <div data-testid="authoring-chat-pane" className="contents">
      <ChatTranscript messages={messages} streaming={status === "submitted" || status === "streaming"}
        renderMessage={(message, streaming) => <StreamedChatMessage fragments={{}} message={message} onToolAnswer={readOnly ? undefined : answers => { scrollToBottom(); return onAnswer(answers); }} streaming={streaming} workspaceId="" />} />
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {!active && onRetryAnswer ? <Button onClick={() => { scrollToBottom(); onRetryAnswer(); }}>Retry answer</Button> : null}
      {!active && error && onRetryLoad ? <Button onClick={onRetryLoad}>Reload conversation</Button> : null}
    </div>;
  const composer = <div data-testid="authoring-chat-composer">
      {queue.length > 0 ? <MessageQueue running={queueLabel} queued={queue} onCancel={onCancelQueued} /> : null}
      <Composer tray={false} attachments={attachments || "unavailable"} files={files} onFilesChange={onFilesChange} dictation={false} plugins={false} models={[]} agent={{ name: "Coding agent", icon: AiBrain01Icon }}
        disabled={inputDisabled || readOnly} busy={active} onStop={onStop} queueing={Boolean(onCancelQueued)}
        history={messages.filter(({ role }) => role === "user").map(entry => entry.parts.flatMap(part => part.type === "text" ? [part.content] : []).join(""))}
        onSend={(text, selected) => { scrollToBottom(); return onSend(text, selected); }} onValueChange={onValueChange} placeholder={placeholder} value={value} />
    </div>;
  if (embedded) return <ConversationContent scroller={viewportRef} composer={composer}>{transcript}</ConversationContent>;
  return <ChatContainer><ChatContainerContent viewportRef={viewportRef}>{transcript}</ChatContainerContent>
    <ChatContainerFooter>{composer}</ChatContainerFooter></ChatContainer>;
}
