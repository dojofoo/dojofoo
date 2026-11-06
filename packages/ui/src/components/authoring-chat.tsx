import type { ReactNode } from "react";
import type { UIMessage } from "@tanstack/ai-react";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { ChatContainer, ChatContainerContent, ChatContainerFooter } from "@dojofoo/ui/chat-container";
import { Composer, type ComposerAgent, type ComposerModel } from "@dojofoo/uix/containers/assistant-home";
import { AiBrain01Icon } from "@dojofoo/uix/icons";
import { ConversationContent } from "@dojofoo/uix/containers/learning-workspace";
import { Button } from "@dojofoo/uix/components/button";
import { StreamedChatMessage } from "@/components/chat/streamed-message";
import { ChatTranscript } from "./chat/assistant-response";
import { useChatScroll } from "@/hooks/use-chat-scroll";
import type { ChatAction } from "@/lib/chat-failure";
import type { CodeHighlight } from "@/lib/code-highlight";

/** A failure with its actions (D33); "try-again" keeps the "Reload conversation" button the specs click */
export type ChatFailureView = { message: string; actions: ChatAction[]; refusedAgent?: string; login?: string; agentName?: string; retryAfter?: string };

/** An agent conversation's presentation */
export function AuthoringChat({ messages, status, busy, inputDisabled = false, readOnly = false, value, onValueChange, onSend, onStop, onAnswer, error, onRetryLoad, embedded = false, attachments = false, files, onFilesChange, placeholder = "Shape this lesson with Kyoshi…", agent, agents, onAgentChange, agentChanging, model, models, modelChanging, onModelChange, fragments, onHighlight, notice }: {
  embedded?: boolean;
  /** A status line or notice above the composer */
  notice?: ReactNode;
  agent?: ComposerAgent;
  agents?: ComposerAgent[];
  onAgentChange?(id: string): void;
  agentChanging?: boolean;
  /** The conversation's model menu (Sensei); without models the menu stays empty */
  model?: string;
  models?: ComposerModel[];
  modelChanging?: boolean;
  onModelChange?(value: string): void;
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
  error?: string | ChatFailureView;
  onRetryLoad?: () => void;
  /** A kata lesson's authored fragments (Sensei's dojo_ui_show) */
  fragments?: Record<string, string>;
  onHighlight?: (highlight: CodeHighlight) => void;
}) {
  const { viewportRef, scrollToBottom } = useChatScroll();
  const active = busy || status === "submitted" || status === "streaming";
  const transcript = <div data-testid="authoring-chat-pane" className="contents">
      <ChatTranscript messages={messages} streaming={status === "submitted" || status === "streaming"}
        renderMessage={(message, streaming) => <StreamedChatMessage fragments={fragments ?? {}} message={message} onHighlight={onHighlight} onToolAnswer={readOnly ? undefined : answers => { scrollToBottom(); return onAnswer(answers); }} streaming={streaming} workspaceId="" />} />
      {typeof error === "string" ? <>
        <p role="alert" className="text-sm text-destructive">{error}</p>
        {!active && onRetryLoad ? <Button onClick={onRetryLoad}>Reload conversation</Button> : null}
      </> : error ? <FailureActions failure={error} active={active} agents={agents} onAgentChange={onAgentChange} onRetryLoad={onRetryLoad} /> : null}
    </div>;
  const composer = <>{notice}<div data-testid="authoring-chat-composer">
      <Composer tray={false} attachments={attachments || "unavailable"} files={files} onFilesChange={onFilesChange} dictation={false} plugins={false} models={models ?? []} model={model} modelChanging={modelChanging} onModelChange={onModelChange} agent={agent ?? { name: "Coding agent", icon: AiBrain01Icon }}
        agents={agents} onAgentChange={onAgentChange} agentChanging={agentChanging}
        // A message sent while the agent works joins its turn, so the composer stays open
        disabled={inputDisabled || readOnly} busy={active} onStop={onStop} queueing
        history={messages.filter(({ role }) => role === "user").map(entry => entry.parts.flatMap(part => part.type === "text" ? [part.content] : []).join(""))}
        onSend={(text, selected) => { scrollToBottom(); return onSend(text, selected); }} onValueChange={onValueChange} placeholder={placeholder} value={value} />
    </div></>;
  if (embedded) return <ConversationContent scroller={viewportRef} composer={composer}>{transcript}</ConversationContent>;
  return <ChatContainer><ChatContainerContent viewportRef={viewportRef}>{transcript}</ChatContainerContent>
    <ChatContainerFooter>{composer}</ChatContainerFooter></ChatContainer>;
}

/** The failure's message, then its actions: try again, another agent, the agent's login, a page reload or the dashboard */
function FailureActions({ failure, active, agents, onAgentChange, onRetryLoad }: {
  failure: ChatFailureView; active: boolean; agents?: ComposerAgent[]; onAgentChange?(id: string): void; onRetryLoad?: () => void;
}) {
  const others = (agents ?? []).filter(choice => choice.value !== failure.refusedAgent);
  return <>
    <p role="alert" className="text-sm text-destructive">{failure.message}{failure.retryAfter ? ` Try again in ${failure.retryAfter}.` : ""}</p>
    {failure.actions.includes("login") && failure.login ? <p className="text-sm">Log in to {failure.agentName ?? "your coding agent"}: run <code>{failure.login}</code> in a terminal.</p> : null}
    <div className="flex flex-wrap gap-2">
      {failure.actions.includes("choose-agent") && onAgentChange ? others.map(choice => choice.value
        ? <Button key={choice.value} variant="secondary" onClick={() => onAgentChange(choice.value!)}>Choose {choice.name}</Button> : null) : null}
      {failure.actions.includes("try-again") && !active && onRetryLoad ? <Button onClick={onRetryLoad}>Reload conversation</Button> : null}
      {failure.actions.includes("reload-page") ? <Button onClick={() => window.location.reload()}>Reload the page</Button> : null}
      {failure.actions.includes("dashboard") ? <Button onClick={() => window.location.assign("/")}>Back to the dashboard</Button> : null}
    </div>
  </>;
}
