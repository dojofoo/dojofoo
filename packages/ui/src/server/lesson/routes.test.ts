import { Hono } from "hono";
import { afterEach, expect, it, vi } from "vitest";
import * as service from "./service";
import { lessonRoutes } from "./routes";

vi.mock("../control/workspace", () => ({ resolveWorkspaceId: () => "/course" }));
afterEach(() => vi.restoreAllMocks());

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
