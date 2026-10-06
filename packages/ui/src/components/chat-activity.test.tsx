import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StreamedChatMessage } from "../routes";
import { AssistantResponse, groupAssistantMessages } from "./chat/assistant-response";
import type { UIMessage } from "@tanstack/ai-react";

it("never groups assistant activity across a student's response", () => {
  const messages: UIMessage[] = [
    { id: "before", role: "assistant", parts: [{ type: "thinking", content: "Prepare question" }] },
    { id: "student", role: "user", parts: [{ type: "text", content: "Review" }] },
    { id: "after", role: "assistant", parts: [{ type: "thinking", content: "Review answer" }] },
  ];
  expect(groupAssistantMessages(messages)).toEqual(messages);
});

it("groups reasoning and tools across message IDs, with replies as boundaries", () => {
  const messages: UIMessage[] = [
    { id: "reasoning-a", role: "assistant", parts: [{ type: "thinking", content: "Inspect course" }] },
    { id: "reasoning-a2", role: "assistant", parts: [{ type: "thinking", content: "Identify prerequisites" }] },
    { id: "tool-a", role: "assistant", parts: [{ type: "tool-call", id: "read", name: "read_file", arguments: "{}", state: "complete", output: "Loaded" }] },
    { id: "reasoning-b", role: "assistant", parts: [{ type: "thinking", content: "Check lesson" }] },
    { id: "reply", role: "assistant", parts: [{ type: "text", content: "Try a new input." }] },
    { id: "reasoning-c", role: "assistant", parts: [{ type: "thinking", content: "Review new evidence" }] },
  ];
  const original = JSON.stringify(messages);
  const html = renderToStaticMarkup(<AssistantResponse messages={messages} streaming={false}
    renderMessage={(message, streaming) => <StreamedChatMessage message={message} streaming={streaming} fragments={{}} workspaceId="fixture" />} />);
  expect(html.match(/data-thinking-dot="complete"/g)).toHaveLength(2);
  expect(html).toContain("Worked");
  expect(html.indexOf("Inspect course")).toBeLessThan(html.indexOf("read_file"));
  expect(html.indexOf("read_file")).toBeLessThan(html.indexOf("Check lesson"));
  expect(html.indexOf("Check lesson")).toBeLessThan(html.indexOf("Try a new input."));
  expect(html.indexOf("Try a new input.")).toBeLessThan(html.indexOf("Review new evidence"));
  expect(JSON.stringify(messages)).toBe(original);
});

it("keeps historical reasoning, tools and replies in order; only the tail thinks", () => {
  const html = renderToStaticMarkup(<StreamedChatMessage fragments={{}} workspaceId="fixture" streaming message={{
    id: "turn", role: "assistant", parts: [
      { type: "thinking", content: "Inspect course" },
      { type: "tool-call", id: "read", name: "read_file", arguments: '{"path":"DOJO.md"}', input: { path: "DOJO.md" }, state: "complete", output: "Course loaded" },
      { type: "text", content: "Ready to begin." },
      { type: "thinking", content: "Inspect lesson" },
    ],
  }} />);
  expect(html.indexOf("Inspect course")).toBeLessThan(html.indexOf("read_file"));
  expect(html.indexOf("read_file")).toBeLessThan(html.indexOf("Ready to begin."));
  expect(html.indexOf("Ready to begin.")).toBeLessThan(html.indexOf("Inspect lesson"));
  expect(html.match(/data-thinking-dot="active"/g)).toHaveLength(1);
  expect(html).toContain("Worked");
  expect(html).toContain('aria-expanded="false"');
});
