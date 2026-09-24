import { codex } from "@ai-sdk/harness-codex";
import { cursor } from "@ai-sdk/harness-cursor";
import { fx } from "@ai-sdk/harness-fx";
import { grokBuild } from "@ai-sdk/harness-grok-build";
import { openCode } from "@ai-sdk/harness-opencode";
import { pi } from "@ai-sdk/harness-pi";
import { describe, expect, it } from "vitest";
import { authoringHarness } from "./harness";

describe("authoring harness selection", () => {
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
