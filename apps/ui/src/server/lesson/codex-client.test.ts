import { describe, expect, it } from "vitest";
import { CodexClient } from "./codex-client";

type IncomingMessage = {
  method: string;
  params: Record<string, unknown>;
};

function receive(client: CodexClient, message: IncomingMessage) {
  (client as unknown as { onMessage(message: IncomingMessage): void }).onMessage(message);
}

describe("CodexClient agent activity", () => {
  it("shows reasoning content without inventing a Complete response step", () => {
    const client = new CodexClient();
    const base = { threadId: "thread-1", turnId: "turn-1" };

    receive(client, { method: "turn/started", params: base });
    receive(client, {
      method: "item/started",
      params: { ...base, item: { id: "reasoning-1", type: "reasoning", summary: [], content: [] } },
    });
    receive(client, {
      method: "item/reasoning/summaryTextDelta",
      params: { ...base, itemId: "reasoning-1", summaryIndex: 0, delta: "Short summary" },
    });
    receive(client, {
      method: "item/reasoning/textDelta",
      params: { ...base, itemId: "reasoning-1", contentIndex: 0, delta: "Detailed reasoning" },
    });

    expect(client.activity("thread-1").steps).toContainEqual(expect.objectContaining({
      id: "reasoning-1",
      description: "Detailed reasoning",
      status: "active",
    }));

    receive(client, {
      method: "item/completed",
      params: {
        ...base,
        item: {
          id: "reasoning-1",
          type: "reasoning",
          summary: ["Completed summary"],
          content: ["Completed detailed reasoning"],
        },
      },
    });
    receive(client, {
      method: "item/completed",
      params: { ...base, item: { id: "message-1", type: "agentMessage", text: "Final answer" } },
    });

    expect(client.activity("thread-1").steps).toEqual([
      expect.objectContaining({
        id: "reasoning-1",
        label: "Thinking",
        description: "Completed detailed reasoning",
        status: "complete",
      }),
    ]);
  });
});
