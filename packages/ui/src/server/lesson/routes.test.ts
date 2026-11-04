import { Hono } from "hono";
import { afterEach, expect, it, vi } from "vitest";
import * as service from "./service";
import { lessonRoutes } from "./routes";

vi.mock("../control/workspace", () => ({ resolveWorkspaceId: () => "/course" }));
afterEach(() => vi.restoreAllMocks());

it.each(["introduction", "text"])("accepts the shipped client wire format for %s turns", async kind => {
  vi.spyOn(service, "getLesson").mockResolvedValue({ dojo: "course" } as service.LessonSnapshot);
  const introduce = vi.spyOn(service, "streamLessonIntroduction").mockResolvedValue(undefined);
  const send = vi.spyOn(service, "streamSensei").mockResolvedValue(undefined);
  const response = await lessonRoutes.request("/workspace/courses/course/lessons/first/messages", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      threadId: "native-session", runId: "turn-1", state: {},
      messages: [{ id: "message-1", role: "user", content: "Help me understand" }],
      tools: [], context: [], forwardedProps: { kind },
    }),
  });
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("RUN_FINISHED");
  if (kind === "introduction") {
    expect(introduce).toHaveBeenCalledWith("/course", "first", expect.any(Function), expect.any(AbortSignal));
    expect(send).not.toHaveBeenCalled();
  } else {
    expect(send).toHaveBeenCalledWith("/course", "first", "Help me understand", expect.any(Function), expect.any(AbortSignal));
    expect(introduce).not.toHaveBeenCalled();
  }
});

it("starts a new session on the workspace's coding agent, ignoring an agent in the body", async () => {
  const start = vi.spyOn(service, "startLessonSession").mockResolvedValue({ sessionId: "trial" } as service.LessonSnapshot);
  const response = await new Hono().route("/", lessonRoutes).request("/workspace/courses/course/lessons/first/sessions", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ harness: "codex" }),
  });
  expect(response.status).toBe(201);
  expect(start).toHaveBeenCalledWith("/course", "first", "course");
});

it("lets an explicit new session recover without resuming the broken old conversation", async () => {
  const read = vi.spyOn(service, "getLesson").mockRejectedValue(new Error("Provider unavailable"));
  const start = vi.spyOn(service, "startLessonSession").mockResolvedValue({ sessionId: "new-session" } as service.LessonSnapshot);
  const app = new Hono().route("/", lessonRoutes);
  const response = await app.request("/workspace/courses/course/lessons/first/sessions", { method: "POST" });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ sessionId: "new-session" });
  expect(start).toHaveBeenCalledWith("/course", "first", "course");
  expect(read).not.toHaveBeenCalled();
});

it("returns an explicit new-session failure as JSON without a fake empty conversation", async () => {
  vi.spyOn(service, "startLessonSession").mockRejectedValue(new Error("Provider unavailable"));
  const response = await lessonRoutes.request("/workspace/courses/course/lessons/first/sessions", { method: "POST" });
  expect(response.status).toBe(502);
  expect(await response.json()).toEqual({ error: "Provider unavailable" });
});

it("GET checks and files serve a course that is not current", async () => {
  const read = vi.spyOn(service, "readLesson").mockResolvedValue({ dojo: "other-course", result: { passed: 1, total: 1 } } as service.LessonSnapshot);
  const file = vi.spyOn(service, "readLessonFile").mockResolvedValue({ type: "lesson-files", id: "solution" } as service.LessonFileResource);
  const prepared = vi.spyOn(service, "getLesson");
  const checks = await lessonRoutes.request("/workspace/courses/other-course/lessons/first/checks");
  expect(checks.status).toBe(200);
  expect(await checks.json()).toEqual({ data: [{ type: "checks", id: "latest", attributes: { passed: 1, total: 1 } }] });
  expect(read).toHaveBeenCalledWith("/course", "other-course", "first");
  expect((await lessonRoutes.request("/workspace/courses/other-course/lessons/first/files/solution")).status).toBe(200);
  expect(file).toHaveBeenCalledWith("/course", "other-course", "first", "solution");
  expect(prepared).not.toHaveBeenCalled();
});
