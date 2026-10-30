import type { UIMessage } from "@tanstack/ai-client";
import { StreamedChatMessage as Message } from "@dojofoo/uix/components/streamed-message";
import type { AskUserAnswer } from "@dojofoo/ui/ask-user-questions";
import { CourseContent } from "@/components/course-content";
import { isInternalLessonMessage } from "@/lib/chat-internal";
import type { CodeHighlight } from "@/lib/code-highlight";
import type { ChatWorkTiming } from "@/lib/chat-work-timing";
import { agentQuestion } from "./agent-question";
import { projectEveToolCall } from "@dojofoo/authoring/eve/messages";

// The message renders in uix (components/streamed-message); here is what only the app knows: Eve's tool calls and
// questions, the lesson's own messages to the Sensei (hidden), and the authored lesson fragments it shows
export { evaluationSummary } from "@dojofoo/uix/components/streamed-message";

export function StreamedChatMessage({
  fragments,
  message,
  onToolAnswer,
  onHighlight,
  streaming = false,
  workspaceId,
}: {
  fragments: Record<string, string>;
  message: UIMessage;
  onToolAnswer?: (answers: Record<string, AskUserAnswer>) => void | Promise<void>;
  onHighlight?: (highlight: CodeHighlight) => void;
  streaming?: boolean;
  timing?: ChatWorkTiming;
  workspaceId: string;
}) {
  const parts = message.parts
    .map(part => part.type === "tool-call" ? projectEveToolCall(part) : part)
    .filter(part => part.type !== "text" || !isInternalLessonMessage(part.content));
  return <Message message={{ ...message, parts }} onToolAnswer={onToolAnswer} onHighlight={onHighlight} streaming={streaming} question={agentQuestion}
    renderFragment={id => fragments[id]
      ? <div className="w-full rounded-[var(--box-radius)] bg-[var(--surface-3)] p-4 shadow-[var(--shadow-2)]"><CourseContent basePath={null} workspaceId={workspaceId} diagrams={false}>{fragments[id]}</CourseContent></div>
      : undefined} />;
}
