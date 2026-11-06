import type { ChatClientState, UIMessage } from "@tanstack/ai-client";

const INTERNAL_DOJO_REFERENCE = /^\[(?:dojo|dojofoo):\/\/[^\]]+\]/u;

export function isInternalLessonMessage(content: string): boolean {
  return content === "[dojo:begin-lesson]"
    || content === "[dojo:check-observation]"
    || INTERNAL_DOJO_REFERENCE.test(content);
}

export function chatAcceptsInput(status: ChatClientState): boolean {
  return status === "ready" || status === "error";
}

export function lessonNeedsIntroduction(messages: readonly UIMessage[]): boolean {
  return !messages.some((message) => message.parts.some((part) => (
    part.type === "text"
    && part.content.trim().length > 0
    && !isInternalLessonMessage(part.content)
    && !(message.role === "assistant" && part.content.trim().toLowerCase() === "cancelled")
  )));
}

export function lessonIntroductionCanStart(status: ChatClientState, messages: readonly UIMessage[]): boolean {
  return status === "ready" && lessonNeedsIntroduction(messages);
}
