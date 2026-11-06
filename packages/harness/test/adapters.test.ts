import { claudeCode } from "@ai-sdk/harness-claude-code";
import { codex } from "@ai-sdk/harness-codex";
import { cursor } from "@ai-sdk/harness-cursor";
import { fx } from "@ai-sdk/harness-fx";
import { grokBuild } from "@ai-sdk/harness-grok-build";
import { openCode } from "@ai-sdk/harness-opencode";
import { createPi, pi } from "@ai-sdk/harness-pi";
import type { AgentId } from "@dojofoo/protocol";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { agentAdapter } from "../src/adapters.ts";

vi.mock("@ai-sdk/harness-pi", async (original) => {
  const actual = await original<typeof import("@ai-sdk/harness-pi")>();
  return { ...actual, createPi: vi.fn(actual.createPi) };
});

describe("coding-agent adapters", () => {
  it("reads Pi's native provider/model settings without copying credentials", async () => {
    await agentAdapter("pi", { environment: {} });
    expect(createPi).toHaveBeenLastCalledWith({ agentDir: join(homedir(), ".pi", "agent"), reattachInProcess: false });
    await agentAdapter("pi", { environment: { PI_CODING_AGENT_DIR: "/tmp/custom-pi" } });
    expect(createPi).toHaveBeenLastCalledWith({ agentDir: "/tmp/custom-pi", reattachInProcess: false });
  });

  it("read-only adapters are cached apart from full ones", async () => {
    const full = await agentAdapter("opencode", { mode: "full" });
    const readOnly = await agentAdapter("opencode", { mode: "read-only" });
    expect(readOnly).not.toBe(full);
    expect(await agentAdapter("opencode", { mode: "read-only" })).toBe(readOnly);
    expect(await agentAdapter("opencode")).toBe(full);
  });

  it("Pi never reattaches in process", async () => {
    await agentAdapter("pi", { mode: "full", environment: {} });
    expect(createPi).toHaveBeenLastCalledWith(expect.objectContaining({ reattachInProcess: false }));
    await agentAdapter("pi", { mode: "read-only", environment: { PI_CODING_AGENT_DIR: "/tmp/missing-pi" } });
    expect(createPi).toHaveBeenLastCalledWith(expect.objectContaining({ reattachInProcess: false }));
  });

  it("a read-only Pi adapter has no agentDir", async () => {
    await agentAdapter("pi", { mode: "read-only", environment: { PI_CODING_AGENT_DIR: "/tmp/missing-pi" } });
    const settings = vi.mocked(createPi).mock.lastCall![0]!;
    expect(settings).not.toHaveProperty("agentDir");
    expect(settings).toHaveProperty("credentials");
  });
  it.each([
    ["claude", claudeCode],
    ["codex", codex],
    ["cursor", cursor],
    ["fx", fx],
    ["grok", grokBuild],
    ["pi", pi],
  ] as const)("uses the official %s adapter contract", async (name, adapter) => {
    const selected = await agentAdapter(name);
    expect(selected.harnessId).toBe(adapter.harnessId);
    expect(selected.specificationVersion).toBe(adapter.specificationVersion);
    expect(Object.keys(selected)).toEqual(Object.keys(adapter));
  });

  it("returns the same OpenCode adapter on every call", async () => {
    const selected = await agentAdapter("opencode");
    expect(selected.harnessId).toBe(openCode.harnessId);
    expect(Object.keys(selected)).toEqual(Object.keys(openCode));
    expect(await agentAdapter("opencode")).toBe(selected);
  });

  it.each(["unknown", "constructor", "__proto__", "toString", "agy"])(
    "rejects %s rather than silently switching agents",
    async (name) => {
      await expect(agentAdapter(name as AgentId)).rejects.toThrow(`Unsupported coding agent: ${name}`);
    },
  );
});
