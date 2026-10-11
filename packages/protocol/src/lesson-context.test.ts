import { expect, it } from "vitest";
import { formatLessonContext, type DojoLessonContext } from "./index";

it("renders authoritative one-based line references without changing raw context", () => {
  const context: DojoLessonContext = {
    phase: "start",
    course: { id: "course", completedLessons: [] },
    lesson: { id: "lesson", title: "Lesson", objective: "Practice", state: "ongoing" },
    learner: {
      file: { path: "kata.ts", language: "typescript", content: "\r\n// note\r\n\r\nreturn [];\r\n" },
      latestCheck: null,
    },
  };
  const original = structuredClone(context);
  const text = formatLessonContext(context);
  expect(text).toContain("L1: \nL2: // note\nL3: \nL4: return [];\nL5: ");
  expect(text).toContain("1-based");
  expect(text).toContain('"path":"kata.ts"');
  expect(text).not.toContain('"content":');
  expect(context).toEqual(original);
});
