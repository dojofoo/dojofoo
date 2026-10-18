import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import type { UIMessage } from "@tanstack/ai-client";
import { lessonEvidence, retainLearnerEvidence } from "./learner-evidence";

function message(id: string, role: "user" | "assistant", content: string): UIMessage {
  return { id, role, parts: [{ type: "text", content }] };
}

it("keeps the speaker and source instead of inferring mastery from a teacher's words", () => {
  const evidence = retainLearnerEvidence([], [
    message("1", "user", "I do not understand callbacks."),
    message("2", "assistant", "A callback is a function passed to another function."),
    message("3", "user", "I understand now, but I want to try a different example."),
  ], "first", "session-1");
  expect(evidence.map(entry => [entry.role, entry.text])).toEqual([
    ["user", "I do not understand callbacks."],
    ["assistant", "A callback is a function passed to another function."],
    ["user", "I understand now, but I want to try a different example."],
  ]);
  expect(evidence[0]).toMatchObject({ kind: "transcript-excerpt", source: {
    lessonId: "first", sessionId: "session-1", messageId: "1",
    sha256: createHash("sha256").update("I do not understand callbacks.").digest("hex"),
  } });
});

it("does not turn reasoning or tool output into learner evidence", () => {
  const evidence = retainLearnerEvidence([], [{ id: "private", role: "assistant", parts: [
    { type: "thinking", content: "Private reasoning" },
    { type: "tool-call", id: "check", name: "check", state: "complete", arguments: "{}", output: "All tests passed" },
  ] }], "first", "session");
  expect(evidence).toEqual([]);
});

it("is bounded, marks truncated excerpts, and retains the full-message hash", () => {
  const messages = Array.from({ length: 20 }, (_, i) => message(String(i), "user", `${i}: ${"x".repeat(500)}`));
  const evidence = retainLearnerEvidence([], messages, "first", "session");
  expect(evidence).toHaveLength(8);
  expect(evidence.map(entry => entry.source.messageId)).toEqual(["12", "13", "14", "15", "16", "17", "18", "19"]);
  expect(evidence.every(entry => entry.text.length === 400 && entry.truncated)).toBe(true);
  expect(evidence.at(-1)?.source.sha256).toBe(createHash("sha256").update(`19: ${"x".repeat(500)}`).digest("hex"));
});

it("deduplicates replay but retains prior help when a new session starts empty", () => {
  const messages = [message("1", "assistant", "We already discussed expression bodies.")];
  const initial = retainLearnerEvidence([], messages, "first", "old-session");
  expect(retainLearnerEvidence(initial, messages, "first", "old-session")).toEqual(initial);
  expect(retainLearnerEvidence(initial, [], "first", "new-session")).toEqual(initial);
  const resumed = retainLearnerEvidence(initial, [message("1", "user", "I still need help with the block body.")], "first", "new-session");
  expect(resumed).toHaveLength(2);
  expect(resumed[0]?.source.sessionId).toBe("old-session");
  expect(resumed[1]?.source.sessionId).toBe("new-session");
});

it("updates a streamed message instead of retaining every partial version", () => {
  const first = retainLearnerEvidence([], [message("reply", "assistant", "A callback")], "first", "session");
  const completed = retainLearnerEvidence(first, [message("reply", "assistant", "A callback is a function passed to another function.")], "first", "session");
  expect(completed).toHaveLength(1);
  expect(completed[0]?.text).toBe("A callback is a function passed to another function.");
  expect(completed[0]?.source.sha256).not.toBe(first[0]?.source.sha256);
});

it("limits the context to recent current and prior lesson evidence", () => {
  const current = retainLearnerEvidence([], Array.from({ length: 8 }, (_, i) => message(String(i), "user", `Current ${i}`)), "second", "s2");
  const previous = retainLearnerEvidence([], Array.from({ length: 8 }, (_, i) => message(String(i), "assistant", `Earlier ${i}`)), "first", "s1");
  const context = lessonEvidence(current, previous);
  expect(context).toHaveLength(8);
  expect(context.map(entry => entry.text)).toEqual(["Earlier 4", "Earlier 5", "Earlier 6", "Earlier 7", "Current 4", "Current 5", "Current 6", "Current 7"]);
});
