import { Fragment, type ReactNode, useEffect, useState } from "react";
import type { UIMessage } from "@tanstack/ai-react";

/** Keep a response slot alive from waiting through completion in every chat surface. */
export function ChatTranscript({ messages, streaming, renderMessage }: {
  messages: UIMessage[];
  streaming: boolean;
  renderMessage(message: UIMessage, streaming: boolean): ReactNode;
}) {
  const turns: { key: string; user?: UIMessage; response: UIMessage[] }[] = [{ key: "initial", response: [] }];
  for (const message of messages) {
    if (message.role === "user") turns.push({ key: message.id, user: message, response: [] });
    else turns[turns.length - 1].response.push(message);
  }
  return turns.map((turn, index) => <Fragment key={turn.key}>
    {turn.user && renderMessage(turn.user, false)}
    <AssistantResponse messages={turn.response} streaming={streaming && index === turns.length - 1} renderMessage={renderMessage} />
  </Fragment>);
}

/** A stable response slot exists before the first streamed message has an ID. */
export function AssistantResponse({ messages, streaming, renderMessage }: {
  messages: UIMessage[];
  streaming: boolean;
  renderMessage(message: UIMessage, streaming: boolean): ReactNode;
}) {
  const [started, setStarted] = useState(streaming);
  useEffect(() => {
    if (streaming) setStarted(true);
  }, [streaming]);

  // Message IDs can change between reasoning and tools. Group their display,
  // without rewriting the underlying transcript or crossing a user response.
  const responses = groupAssistantMessages(messages);
  if (streaming || started) {
    if (!responses.length) responses.push({ id: "pending", role: "assistant", parts: [] });
    const first = responses[0];
    if (first.role === "assistant" && first.parts[0]?.type !== "thinking") {
      first.parts.unshift({ type: "thinking", content: "" });
    }
  }
  return <>
    {responses.map((message, index) => message.parts.length
      ? <div className="w-full min-w-0" key={index === 0 ? "response" : message.id}>
        {renderMessage({ ...message, id: index === 0 ? "response" : message.id }, streaming && index === responses.length - 1)}
      </div> : null)}
  </>;
}

/** Rendering projection only: keep source messages and their IDs untouched. */
export function groupAssistantMessages(messages: UIMessage[]): UIMessage[] {
  const groups: UIMessage[] = [];
  for (const message of messages) {
    const previous = groups.at(-1);
    if (previous?.role === "assistant" && message.role === "assistant") {
      previous.parts.push(...message.parts);
    } else {
      groups.push({ ...message, parts: [...message.parts] });
    }
  }
  return groups;
}
