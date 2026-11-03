import { describe, expect, it } from "vitest";
import { normalizeLessonThreads } from "./service";
import { threadOwnsSession } from "../control/workspace";

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

  it("never treats a superseded session as the current transcript", () => {
    const thread = {
      sessionId: "thread-current",
      aliases: ["thread-superseded"],
    };

    expect(threadOwnsSession(thread, "thread-current")).toBe(true);
    expect(threadOwnsSession(thread, "thread-superseded")).toBe(false);
  });
});
