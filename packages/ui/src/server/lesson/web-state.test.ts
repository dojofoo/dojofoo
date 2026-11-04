import { describe, expect, it } from "vitest";
import { normalizeLessonThreads } from "./service";

describe("lesson web state", () => {
  it("drops bare thread pointers and keeps native session identity", () => {
    expect(normalizeLessonThreads({
      "course/legacy": "thread-1",
      "course/current": { sessionId: "thread-2", contractHash: "sha256:abc" },
    })).toEqual({
      "course/current": { sessionId: "thread-2", harness: "codex", contractHash: "sha256:abc", aliases: [] },
    });
  });

  it("retains superseded session aliases and failed-resume state", () => {
    expect(normalizeLessonThreads({
      "course/lesson": {
        sessionId: "thread-2",
        harness: "codex",
        contractHash: "sha256:abc",
        aliases: ["thread-1"],
        resumeFailed: true,
      },
    })).toEqual({
      "course/lesson": {
        sessionId: "thread-2",
        harness: "codex",
        contractHash: "sha256:abc",
        aliases: ["thread-1"],
        resumeFailed: true,
      },
    });
  });
});
