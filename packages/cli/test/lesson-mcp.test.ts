import { afterEach, expect, it, vi } from "vitest";

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, () => Promise<unknown>>(),
}));
vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    registerTool(name: string, _schema: unknown, handler: () => Promise<unknown>) {
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
