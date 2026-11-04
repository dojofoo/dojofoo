import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveRequestWorkspace } from "./workspace";

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

