import { describe, expect, it } from "vitest";
import type { LessonSnapshot } from "@/server/lesson/service";
import { lessonRead, staysOnLesson } from "./index";

const learn = "/learn/$runId/{-$lessonId}";
// The page shows lesson `first` of run `run-1`, whose address without a lesson opens `second`
const page = { runId: "run-1", lessonId: "first", runLesson: "second" };

describe("leaving a lesson page", () => {
  it("another conversation of the same lesson keeps the page", () => {
    expect(staysOnLesson({ routeId: learn, params: { runId: "run-1", lessonId: "first" } }, page)).toBe(true);
  });

  it("the run's address without a lesson keeps the page only when it opens the same lesson", () => {
    expect(staysOnLesson({ routeId: learn, params: { runId: "run-1" } }, { ...page, runLesson: "first" })).toBe(true);
    expect(staysOnLesson({ routeId: learn, params: { runId: "run-1" } }, page)).toBe(false);
    expect(staysOnLesson({ routeId: learn, params: { runId: "run-1" } }, { ...page, runLesson: undefined })).toBe(false);
  });

  it("another lesson, another run and another page leave it", () => {
    expect(staysOnLesson({ routeId: learn, params: { runId: "run-1", lessonId: "second" } }, page)).toBe(false);
    expect(staysOnLesson({ routeId: learn, params: { runId: "run-2", lessonId: "first" } }, page)).toBe(false);
    expect(staysOnLesson({ routeId: "/", params: {} }, page)).toBe(false);
  });
});

describe("a read of the page's lesson", () => {
  const snapshot = (code: string, kata = "first") => ({ dojo: "course", kata, code }) as LessonSnapshot;
  const saved = "export const answer = 0;\n";
  const newer = "export const answer = 42;\n";

  it("the first read shows the lesson's file", () => {
    expect(lessonRead(null, snapshot(saved))).toEqual({ refetch: false, code: saved });
  });

  it("a refetch keeps code the learner hasn't saved", () => {
    expect(lessonRead({ lesson: snapshot(saved), code: "// unsaved" }, snapshot(newer))).toEqual({ refetch: true, code: "// unsaved" });
  });

  it("a refetch shows the newer file when the editor holds the saved one", () => {
    expect(lessonRead({ lesson: snapshot(saved), code: saved }, snapshot(newer))).toEqual({ refetch: true, code: newer });
  });

  it("a read of another lesson shows its file", () => {
    expect(lessonRead({ lesson: snapshot(saved), code: "// unsaved" }, snapshot(newer, "second"))).toEqual({ refetch: false, code: newer });
    expect(lessonRead({ lesson: null, code: "" }, snapshot(newer))).toEqual({ refetch: false, code: newer });
  });
});
