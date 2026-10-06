import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRequestWorkspace, threadOwnsSession } from "./workspace";

describe("configured workspace root", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the explicit course root instead of the UI server working directory", () => {
    const root = resolve("/tmp", "dojo authoring regression");
    vi.stubEnv("DOJO_PROJECT_ROOT", root);
    expect(resolveRequestWorkspace(new Request("http://localhost/api/authoring/workspace"))).toBe(root);
  });

  it("does not fall back to another course when the configured folder is unavailable", () => {
    const root = resolve("/tmp", "dojo-missing-workspace-regression");
    vi.stubEnv("DOJO_PROJECT_ROOT", root);
    expect(resolveRequestWorkspace(new Request("http://localhost/api/authoring/workspace"))).toBe(root);
  });
});

describe("session route ownership", () => {
  it("only resolves the exact native transcript named by the URL", () => {
    const thread = { sessionId: "current", aliases: ["superseded"] };
    expect(threadOwnsSession(thread, "current")).toBe(true);
    expect(threadOwnsSession(thread, "superseded")).toBe(false);
    expect(threadOwnsSession(thread, "unrelated")).toBe(false);
  });
});
