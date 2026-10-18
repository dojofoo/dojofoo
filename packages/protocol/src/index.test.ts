import { describe, expect, it } from "vitest";
import { formatLessonContext, lessonCapabilities, uiCapabilities, type DojoLessonContext } from ".";

describe("lesson capability registry", () => {
  it("contains only production lesson tools", () => {
    expect(Object.values(lessonCapabilities).map(({ tool }) => tool)).toEqual([
      "dojo_context",
      "dojo_lesson_verify",
      "dojo_lesson_complete",
      "dojo_learner_observe",
    ]);
  });

  it("names UI capabilities under the dojo namespace", () => {
    expect(uiCapabilities.ask).toEqual({
      method: "dojo.ui.ask",
      tool: "dojo_ui_ask",
      description: expect.any(String),
    });
    expect(uiCapabilities.show).toEqual({
      method: "dojo.ui.show",
      tool: "dojo_ui_show",
      description: expect.any(String),
    });
  });
});

it("preserves source-linked historical statements without converting them into mastery claims", () => {
  const context: DojoLessonContext = {
    phase: "resume", course: { id: "course", completedLessons: [] },
    lesson: { id: "second", title: "Second", objective: "Practice", state: "ongoing" },
    learner: {
      file: { path: "kata.ts", language: "typescript", content: "const n = 1;" }, latestCheck: null,
      evidence: [{ kind: "transcript-excerpt", role: "user", text: "I am still unsure.", truncated: false,
        source: { lessonId: "first", sessionId: "native-session", messageId: "native-session:1", sha256: "captured-hash" } }],
    },
  };
  const [metadata] = formatLessonContext(context).split("\n");
  expect(JSON.parse(metadata!).learner.evidence).toEqual(context.learner.evidence);
  expect(JSON.parse(metadata!).learner).not.toHaveProperty("mastery");
  expect(context.learner.file.content).toBe("const n = 1;");
});
