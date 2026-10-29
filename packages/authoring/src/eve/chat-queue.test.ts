import { withInterruptBinding } from "@tanstack/ai";
import { ChatClient, fetchServerSentEvents } from "@tanstack/ai-client";
import { expect, it, vi } from "vitest";

function pendingQuestion(queue: "queue" | "drop" | "interrupt") {
  const fetchClient = vi.fn<typeof fetch>(async () => { throw new Error("A pending question must not send normal input"); });
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

it("retains queued notes after a failed answer and delivers them in order after retry", async () => {
  const { chat, fetchClient } = pendingQuestion("queue");
  const delivered: string[] = [];
  let attempts = 0;
  fetchClient.mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    if (body.resume && attempts++ === 0) throw new Error("Answer temporarily unavailable");
    if (!body.resume) delivered.push(body.messages.at(-1).content);
    return new Response([
      { type: "RUN_STARTED", threadId: body.threadId, runId: body.runId },
      { type: "RUN_FINISHED", threadId: body.threadId, runId: body.runId },
    ].map(event => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
  });
  try {
    await chat.sendMessage("First note");
    await chat.sendMessage("Second note");
    const question = chat.getInterrupts()[0];
    if (question.kind !== "generic" || !question.canResolve) throw new Error("Expected the pending question");
    question.resolveInterrupt({ text: "Review" });
    await vi.waitFor(() => expect(chat.getStatus()).toBe("error"));
    expect(chat.getQueue().map(item => item.content)).toEqual(["First note", "Second note"]);
    chat.retryInterrupts();
    await vi.waitFor(() => expect(delivered).toEqual(["First note", "Second note"]));
    expect(chat.getQueue()).toEqual([]);
  } finally { chat.dispose(); }
});

it("stop clears notes queued behind a pending question", async () => {
  const { chat } = pendingQuestion("queue");
  try {
    await chat.sendMessage("Do not deliver this note");
    chat.stop();
    expect(chat.getQueue()).toEqual([]);
  } finally { chat.dispose(); }
});

it("aborting an in-flight answer clears queued notes without delivering them", async () => {
  const { chat, fetchClient } = pendingQuestion("queue");
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  fetchClient.mockImplementation((_input, init) => new Promise((_resolve, reject) => {
    if (!init?.signal) throw new Error("Expected the client's cancellation signal");
    init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    started();
  }));
  try {
    await chat.sendMessage("First note");
    await chat.sendMessage("Second note");
    const question = chat.getInterrupts()[0];
    if (question.kind !== "generic" || !question.canResolve) throw new Error("Expected the pending question");
    question.resolveInterrupt({ text: "Review" });
    await ready;
    chat.stop();
    await vi.waitFor(() => expect(chat.getStatus()).toBe("ready"));
    expect(chat.getQueue()).toEqual([]);
    expect(fetchClient).toHaveBeenCalledTimes(1);
  } finally { chat.dispose(); }
});
