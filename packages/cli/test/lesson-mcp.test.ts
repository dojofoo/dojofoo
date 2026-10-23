import { afterEach, expect, it, vi } from "vitest";

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    registerTool(name: string, _schema: unknown, handler: (...args: unknown[]) => Promise<unknown>) {
      handlers.set(name, handler);
    }
    async connect() {}
  },
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  handlers.clear();
});

it("sends learning observations through the current run rather than exposing routing credentials", async () => {
  vi.stubEnv("DOJO_PROJECT_ROOT", "/test-course");
  vi.stubEnv("DOJO_CLI", "/test-cli.js");
  vi.stubEnv("DOJOFOO_TOOL_PROFILE", "lesson");
  vi.stubEnv("DOJOFOO_COORDINATOR_URL", "http://coordinator.test");
  vi.stubEnv("DOJOFOO_RUN_CAPABILITY", "test-only");
  const observation = { category: "uncertainty", interpretation: "Learner reports a gap.", status: "active", source: { sessionId: "source", messageId: "1", sha256: "a".repeat(64) } };
  const saved = { ...observation, id: "saved-note" };
  const fetch = vi.fn().mockResolvedValue(Response.json({ observation: saved }));
  vi.stubGlobal("fetch", fetch);
  await import("../src/lesson-mcp");
  const handler = handlers.get("dojo_learner_observe");
  expect(handler).toBeDefined();
  expect(await handler!(observation)).toEqual({ content: [{ type: "text", text: JSON.stringify(saved) }], structuredContent: { observation: saved } });
  expect(fetch).toHaveBeenCalledWith(new URL("http://coordinator.test/api/run-command"), expect.objectContaining({
    body: JSON.stringify({ method: "dojo.learner.observe", params: { observation } }),
  }));
});

it("does not install the learning observation tool in an authoring-only profile", async () => {
  vi.stubEnv("DOJO_PROJECT_ROOT", "/test-course");
  vi.stubEnv("DOJO_CLI", "/test-cli.js");
  vi.stubEnv("DOJOFOO_TOOL_PROFILE", "authoring");
  await import("../src/lesson-mcp");
  expect(handlers.has("dojo_learner_observe")).toBe(false);
});

it("preserves a server failure message instead of returning a boolean error flag", async () => {
  vi.stubEnv("DOJO_PROJECT_ROOT", "/test-course");
  vi.stubEnv("DOJO_CLI", "/test-cli.js");
  vi.stubEnv("DOJOFOO_COORDINATOR_URL", "http://coordinator.test");
  vi.stubEnv("DOJOFOO_RUN_CAPABILITY", "test-only");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: true, message: "Coordinator route unavailable" }, { status: 500 })));
  await import("../src/lesson-mcp");
  await expect(handlers.get("dojo_lesson_complete")!()).rejects.toThrow("Coordinator route unavailable (HTTP 500)");
});

it("provides numbered MCP text and unchanged structured learner source", async () => {
  vi.stubEnv("DOJO_PROJECT_ROOT", "/test-course");
  vi.stubEnv("DOJO_CLI", "/test-cli.js");
  vi.stubEnv("DOJOFOO_TOOL_PROFILE", "lesson");
  vi.stubEnv("DOJOFOO_COORDINATOR_URL", "http://coordinator.test");
  vi.stubEnv("DOJOFOO_RUN_CAPABILITY", "test-only");
  const context = {
    phase: "start",
    course: { id: "course", completedLessons: [] },
    lesson: { id: "lesson", title: "Lesson", objective: "Practice", state: "ongoing" },
    learner: {
      file: { path: "kata.ts", language: "typescript", content: "\r\nreturn [];\r\n" },
      latestCheck: null,
    },
  };
  const fetch = vi.fn().mockResolvedValue(Response.json({ context }));
  vi.stubGlobal("fetch", fetch);
  await import("../src/lesson-mcp");
  const handler = handlers.get("dojo_context");
  expect(handler).toBeDefined();
  expect(await handler!()).toEqual({
    content: [{ type: "text", text: expect.stringContaining("L1: \nL2: return [];\nL3: ") }],
    structuredContent: context,
  });
  expect(fetch).toHaveBeenCalledWith(new URL("http://coordinator.test/api/run-command"), expect.objectContaining({
    body: JSON.stringify({ method: "dojo.context", params: {} }),
  }));
});
