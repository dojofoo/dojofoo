import { describe, expect, it } from "vitest";
import { transcriptToUIMessages, visibleTranscriptText } from "./service";
import { senseiTurn } from "./instructions";

describe("visibleTranscriptText", () => {
  it("removes the internal check resource marker from learner text", () => {
    expect(visibleTranscriptText({
      role: "user",
      text: "[dojo://lessons/001-normalize-handle/checks/latest]Use the Dojofoo dojo_lesson_complete tool now.",
    })).toBe("Use the Dojofoo dojo_lesson_complete tool now.");
  });

  it("hides injected lesson policy and completed-check observations", () => {
    expect(visibleTranscriptText({ role: "user", text: `${senseiTurn("learner-evidence")}\nNo test run has been recorded yet.` })).toBe("");
    expect(visibleTranscriptText({ role: "user", text: "Preserve ownership of the kata. Older evidence." })).toBe("");
    expect(visibleTranscriptText({
      role: "user",
      text: '{"instruction":"This check already completed. Inspect the attached evidence."}',
    })).toBe("");
  });
});

describe("transcriptToUIMessages", () => {
  it("keeps a tool after a hidden user observation out of preceding assistant prose", () => {
    const messages = transcriptToUIMessages([
      { role: "assistant", kind: "message", text: "Try the first small step." },
      { role: "assistant", kind: "tool", text: JSON.stringify({ name: "dojo_lesson_verify", input: {}, output: { passed: 0, failed: 1, skipped: 0, total: 1, tests: [] } }) },
      { role: "user", kind: "message", text: "[dojo://lessons/001-normalize-handle/checks/check-123]" },
      { role: "assistant", kind: "message", text: "The first failure gives us a useful place to begin." },
    ], "session-1");

    expect(messages).toHaveLength(3);
    expect(messages[0]?.parts).toEqual([{ type: "text", content: "Try the first small step." }]);
    expect(messages[1]?.parts.map((part) => part.type)).toEqual(["tool-call"]);
    expect(messages[2]?.parts).toEqual([{ type: "text", content: "The first failure gives us a useful place to begin." }]);
  });
});
