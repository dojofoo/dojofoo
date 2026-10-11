import { codex } from "@ai-sdk/harness-codex";
import { cursor } from "@ai-sdk/harness-cursor";
import { fx } from "@ai-sdk/harness-fx";
import { grokBuild } from "@ai-sdk/harness-grok-build";
import { openCode } from "@ai-sdk/harness-opencode";
import { createPi, pi } from "@ai-sdk/harness-pi";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { authoringHarness } from "./harness";

vi.mock("@ai-sdk/harness-pi", async (original) => {
  const actual = await original<typeof import("@ai-sdk/harness-pi")>();
  return { ...actual, createPi: vi.fn(actual.createPi) };
});

describe("authoring harness selection", () => {
  it("reads Pi's native provider/model settings without copying credentials", () => {
    authoringHarness({ DOJOFOO_HARNESS: "pi" });
    expect(createPi).toHaveBeenLastCalledWith({ agentDir: join(homedir(), ".pi", "agent") });
    authoringHarness({ DOJOFOO_HARNESS: "pi", PI_CODING_AGENT_DIR: "/tmp/custom-pi" });
    expect(createPi).toHaveBeenLastCalledWith({ agentDir: "/tmp/custom-pi" });
  });
  it.each([
    ["codex", codex],
    ["cursor", cursor],
    ["fx", fx],
    ["grok", grokBuild],
    ["pi", pi],
  ] as const)("uses the official %s adapter contract", (name, adapter) => {
    const selected = authoringHarness({ DOJOFOO_HARNESS: name });
    expect(selected.harnessId).toBe(adapter.harnessId);
    expect(selected.specificationVersion).toBe(adapter.specificationVersion);
    expect(Object.keys(selected)).toEqual(Object.keys(adapter));
  });

  it("preserves the existing OpenCode default", () => {
    const selected = authoringHarness({ DOJOFOO_HARNESS: "opencode" });
    expect(selected.harnessId).toBe(openCode.harnessId);
    expect(Object.keys(selected)).toEqual(Object.keys(openCode));
    expect(authoringHarness({})).toBe(selected);
    expect(authoringHarness({ DOJOFOO_HARNESS: "" })).toBe(selected);
  });

  it.each(["unknown", "claude", "constructor", "__proto__", "toString"])(
    "rejects %s rather than silently switching harnesses",
    (name) => {
      expect(() => authoringHarness({ DOJOFOO_HARNESS: name }))
        .toThrow(`Unsupported Dojofoo authoring harness: ${name}`);
    },
  );
});
