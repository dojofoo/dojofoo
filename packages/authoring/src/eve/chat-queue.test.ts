import { withInterruptBinding } from "@tanstack/ai";
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";
import { expect, it, vi } from "vitest";

function pendingQuestion(queue: "queue" | "drop" | "interrupt") {
  const fetchClient = vi.fn(async () => { throw new Error("A pending question must not send normal input"); });
  const chat = new ChatClient({
    persistence: false,
    threadId: "thread",
    queue,
    connection: fetchServerSentEvents("http://fixture.invalid/messages", { fetchClient }),
    initialResumeSnapshot: {
      resumeState: { threadId: "thread", runId: "paused" },
      pendingInterrupts: [withInterruptBinding({ id: "question", reason: "generic", message: "Review?" }, {
        v: 1, kind: "generic", interruptId: "question", interruptedRunId: "paused", generation: 0,
      })],
    },
  });
  return { chat, fetchClient };
}

it("queues normal input without answering, replacing or sending past a pending question", async () => {
  const { chat, fetchClient } = pendingQuestion("queue");
  try {
    await chat.sendMessage("Focus on arrays", { source: "body" });
    expect(chat.getQueue()).toMatchObject([{ content: "Focus on arrays" }]);
    expect(chat.getInterrupts().map(interrupt => interrupt.id)).toEqual(["question"]);
    expect(fetchClient).not.toHaveBeenCalled();
  } finally { chat.dispose(); }
});

it("respects drop policy while retaining the pending question", async () => {
  const { chat, fetchClient } = pendingQuestion("drop");
  try {
    await chat.sendMessage("Do not enqueue");
    expect(chat.getQueue()).toEqual([]);
    expect(chat.getInterrupts().map(interrupt => interrupt.id)).toEqual(["question"]);
    expect(fetchClient).not.toHaveBeenCalled();
  } finally { chat.dispose(); }
});

it("does not let interrupt policy silently discard an unanswered question", async () => {
  const { chat, fetchClient } = pendingQuestion("interrupt");
  try {
    await expect(chat.sendMessage("Replace this turn")).rejects.toThrow("pending interrupts");
    expect(chat.getInterrupts().map(interrupt => interrupt.id)).toEqual(["question"]);
    expect(fetchClient).not.toHaveBeenCalled();
  } finally { chat.dispose(); }
});
