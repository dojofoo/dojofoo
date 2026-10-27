import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { UIMessage } from "@tanstack/ai-client";
import { describe, expect, it, vi } from "vitest";
import { parseAgentQuestions } from "@/components/chat/agent-question";
import { StreamedChatMessage } from "./index";
import { eveChatMessages } from "@dojofoo/authoring/eve/messages";

// This suite verifies routing, not the effect-driven Markdown compiler.
// Real Markdown rendering is covered by the teaching-content browser tests.
vi.mock("@/components/teaching-markdown", () => ({
  TeachingMarkdown: ({ source }: { source: string }) => <div data-teaching-source>{source}</div>,
}));

const fixture = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../../e2e/fixtures/chat-kitchen-sink.json"), "utf8"),
) as UIMessage[];

describe("TanStack AI UIMessage renderer", () => {
  for (const freeText of [false, true]) it(`renders a replayed Eve answer in its locked question component (freeText=${freeText})`, () => {
    const [message] = eveChatMessages([{ id: "eve-assistant", role: "assistant", parts: [{
      type: "dynamic-tool", toolName: "dojo_ui_ask", toolCallId: "call-question", input: {},
      state: "approval-responded", approval: { id: "request-question" },
      toolMetadata: { eve: { kind: "tool-call", name: "dojo_ui_ask", inputRequest: {
        requestId: "request-question", kind: "question", prompt: "Where should we focus?",
        display: freeText ? "text" : "select",
        options: freeText ? undefined : [{ id: "review", label: "Review" }, { id: "next", label: "Continue" }],
      }, inputResponse: freeText
        ? { requestId: "request-question", text: "Explain the prerequisites" }
        : { requestId: "request-question", optionId: "review" },
      } },
    }] }]);
    const html = renderToStaticMarkup(<StreamedChatMessage fragments={{}} message={message} onToolAnswer={async () => undefined} workspaceId="fixture" />);
    expect(html).toContain("Where should we focus?");
    expect(html).toContain('data-disabled="true"');
    expect(html).toContain("text-blue-600");
    if (freeText) expect(html).toContain("Explain the prerequisites");
    else {
      expect(html).toContain("Review");
      expect(html).toContain("Continue");
      expect(html).toContain('data-state="checked"');
    }
  });

  it("renders kitchen-sink message parts in protocol order", () => {
    const html = fixture.map((message) => renderToStaticMarkup(
      <StreamedChatMessage
        fragments={{ "regex-whitespace": "Whitespace runs use the **one-or-more** quantifier." }}
        message={message}
        onToolAnswer={async () => undefined}
        workspaceId="fixture-workspace"
      />,
    )).join("");

    const ordered = [
      "Help me understand this failure.",
      "Thought",
      "Trimming now works",
      "2/3 lesson checks passed",
      "Whitespace runs use the",
      "All checks pass",
    ];
    let cursor = -1;
    for (const text of ordered) {
      const next = html.indexOf(text);
      expect(next, `expected rendered output to contain ${text}`).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(html).toContain("Which kind of hint would help?");
    const question = fixture.flatMap((message) => message.parts)
      .find((part) => part.type === "tool-call" && part.name === "elicitation");
    expect(question?.type === "tool-call" && parseAgentQuestions(question.input)[0]?.title)
      .toBe("Which kind of hint would help?");
    expect(html).not.toContain("Lesson checks · 3/3 passed");
    expect(html).not.toContain("Parameters");
  });

  it("groups reasoning and chained tool calls into one collapsed timeline", () => {
    const message = {
      id: "assistant-tools",
      role: "assistant",
      parts: [
        { type: "thinking", content: "**Inspecting the lesson**", state: "complete" },
        { type: "tool-call", id: "read-1", name: "read_file", state: "complete", input: { path: "KATA.md" }, output: "brief" },
        { type: "tool-result", toolCallId: "read-1", state: "complete", content: "brief" },
        { type: "tool-call", id: "search-1", name: "search_files", state: "complete", input: { path: "src" }, output: ["src/kata.ts"] },
        { type: "tool-result", toolCallId: "search-1", state: "complete", content: "src/kata.ts" },
        { type: "tool-call", id: "check-1", name: "run_command", state: "complete", input: { command: "dojofoo kata --check" }, output: { passed: 3 } },
        { type: "tool-result", toolCallId: "check-1", state: "complete", content: "3 passed" },
      ],
    } as UIMessage;

    const html = renderToStaticMarkup(
      <StreamedChatMessage fragments={{}} message={message} streaming workspaceId="fixture-workspace" />,
    );

    expect(html.match(/aria-label="Activity details"/gu)).toHaveLength(1);
    expect(html).toContain("Inspecting the lesson");
    expect(html).toContain('inert="" aria-hidden="true"');
    expect(html).not.toContain("Parameters &amp; result");
    expect(html.match(/aria-expanded="false"/gu)).toHaveLength(5);
  });

  it.each([false, true])("retains persisted activity duration (tool=%s)", (tool) => {
    const message = {
      id: "timed-work",
      role: "assistant",
      parts: [tool
        ? { type: "tool-call", id: "timed-tool", name: "read_file", arguments: "{}", state: "complete", durationMs: 3_700 }
        : { type: "thinking", content: "private", state: "complete", durationMs: 3_700 }],
    } as unknown as UIMessage;
    const html = renderToStaticMarkup(
      <StreamedChatMessage fragments={{}} message={message} workspaceId="fixture-workspace" />,
    );
    expect(html).toContain(`${tool ? "Worked" : "Thought"} for 4s`);
    expect(html).toContain('inert="" aria-hidden="true"');
  });

  it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])("does not invent a duration from %s", (durationMs) => {
    const message = {
      id: "untimed", role: "assistant",
      parts: [{ type: "thinking", content: "Inspect lesson", durationMs }],
    } as unknown as UIMessage;
    const html = renderToStaticMarkup(
      <StreamedChatMessage fragments={{}} message={message} workspaceId="fixture" />,
    );
    expect(html).toContain("Thought");
    expect(html).not.toContain("Thought for");
  });

  it("does not sum overlapping tool durations into a chain timer", () => {
    const message = {
      id: "parallel-tools", role: "assistant",
      parts: ["read-1", "read-2"].map(id => ({
        type: "tool-call", id, name: "read_file", arguments: "{}", state: "complete", durationMs: 3_700,
      })),
    } as unknown as UIMessage;
    const html = renderToStaticMarkup(
      <StreamedChatMessage fragments={{}} message={message} workspaceId="fixture" />,
    );
    expect(html).toContain("Worked");
    expect(html.replace(/<style[^>]*>[\s\S]*?<\/style>/gu, "")).not.toContain("Worked for");
    expect(html.match(/3\.7s/gu)).toHaveLength(2);
  });

  it.each([true, false])("shows the native tool outcome from its structured error flag (%s)", error => {
    const message = { id: "native-result", role: "assistant", parts: [{ type: "tool-call", id: "native-call", name: "execute", state: "complete", input: {},
      output: { toolCallId: "native-call", status: "completed", content: [{ type: "content", content: { type: "text", text: "Permission.DeclinedError" } }], rawOutput: { metadata: { error } } },
    }] } as UIMessage;
    const html = renderToStaticMarkup(<StreamedChatMessage fragments={{}} message={message} workspaceId="fixture" />).replace(/<style[^>]*>[\s\S]*?<\/style>/gu, "");
    expect(html).toContain(`data-status="${error ? "error" : "success"}"`);
    if (error) expect(html).toContain('<p class="ui-tc__error-text">Permission.DeclinedError</p>');
  });

  it("renders dojo_ui_show as its authored fragment instead of tool machinery", () => {
    const message = {
      id: "assistant-fragment",
      role: "assistant",
      parts: [{
        type: "tool-call",
        id: "show-1",
        name: "dojofoo_dojo_ui_show",
        state: "complete",
        input: { fragmentId: "regex-whitespace" },
        output: { fragmentId: "regex-whitespace" },
      }],
    } as UIMessage;

    const html = renderToStaticMarkup(
      <StreamedChatMessage
        fragments={{ "regex-whitespace": "Whitespace runs use the **one-or-more** quantifier." }}
        message={message}
        workspaceId="fixture-workspace"
      />,
    );

    expect(html).toContain("Whitespace runs use the");
    expect(html).not.toContain("dojo_ui_show");
    expect(html).not.toContain("data-slot=\"tool-call\"");
  });
});
