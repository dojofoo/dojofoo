import { describe, expect, it } from "vitest";
import { runtimeIdentity } from "../src/runtime";

describe("agent runtime identity", () => {
  it("uses the selected OpenCode harness when a parent Codex ID leaks into its environment", () => {
    expect(runtimeIdentity({
      OPENCODE: "1",
      OPENCODE_SESSION_ID: "opencode-session",
      CODEX_THREAD_ID: "parent-codex-session",
    })).toEqual({ name: "opencode", sessionId: "opencode-session" });
  });

  it("prefers an explicit Dojofoo session identity", () => {
    expect(runtimeIdentity({
      DOJOFOO_SESSION_ID: "explicit-session",
      OPENCODE_SESSION_ID: "opencode-session",
    })).toEqual({ name: "opencode", sessionId: "explicit-session" });
  });

  it("detects an OpenCode child before an inherited Codex parent", () => {
    expect(runtimeIdentity({
      OPENCODE: "1",
      OPENCODE_SESSION_ID: "opencode-session",
      CODEX_THREAD_ID: "parent-codex-session",
    })).toEqual({ name: "opencode", sessionId: "opencode-session" });
  });

  it.each([
    ["claude", { CLAUDECODE: "1", CLAUDE_SESSION_ID: "session" }],
    ["pi", { PI_CODING_AGENT: "1", PI_SESSION_ID: "session" }],
    ["codex", { CODEX_THREAD_ID: "session" }],
  ] as const)("detects the %s runtime", (name, environment) => {
    expect(runtimeIdentity(environment)).toEqual({ name, sessionId: "session" });
  });

  it("represents an unidentified process without inventing a session", () => {
    expect(runtimeIdentity({})).toEqual({ name: "unknown", sessionId: undefined });
  });
});
