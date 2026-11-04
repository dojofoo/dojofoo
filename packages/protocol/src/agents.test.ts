import { describe, expect, it } from "vitest";
import { agentIds, agentRow, agentRows, isAcpAgentId, isAgentId, isolationPlaceholders, offeredAgents, personaForKind } from ".";

describe("coding-agent registry", () => {
  it("has one row per agent id, in onboarding order", () => {
    expect(agentRows.map(row => row.id)).toEqual([...agentIds]);
    expect(agentIds).toEqual(["claude", "codex", "cursor", "agy", "grok", "opencode", "fx", "pi"]);
  });

  it("offers exactly the rows today's ACP lesson runtime runs", () => {
    expect(offeredAgents().map(row => row.id)).toEqual(["claude", "codex", "cursor", "grok", "opencode", "fx"]);
    expect(offeredAgents().every(row => isAcpAgentId(row.id))).toBe(true);
  });

  it("every offered row has an adapter and a read-only profile", () => {
    for (const row of offeredAgents()) {
      expect(row.adapterId, row.id).toBeDefined();
      expect(row.readOnly, row.id).toBeDefined();
      expect(row.modelDiscovery, row.id).toBeDefined();
    }
  });

  it("every isolation placeholder is one the harness resolves", () => {
    const values = agentRows.flatMap(row => {
      const isolation = row.readOnly?.userConfig;
      return isolation ? [...Object.values(isolation.environment), ...Object.values(isolation.home?.links ?? {}), ...Object.keys(isolation.home?.links ?? {}),
        ...Object.keys(isolation.home?.files ?? {})] : [];
    });
    const named = values.flatMap(value => [...value.matchAll(/\{([A-Za-z]+)\}/gu)].map(match => match[1]));
    expect(named.length).toBeGreaterThan(0);
    for (const placeholder of named) expect(isolationPlaceholders as readonly string[]).toContain(placeholder);
    // Codex's config.toml is literal TOML; no placeholder hides in it
    expect(agentRow("codex").readOnly?.userConfig.home?.files?.[".codex/config.toml"]).toContain("[features]");
  });

  it("Grok's private home is per session", () => {
    expect(agentRow("grok").readOnly?.userConfig.home?.scope).toBe("session");
    expect(agentRow("grok").readOnly?.userConfig.environment).toMatchObject({ HOME: "{home}", GROK_HOME: "{home}/.grok" });
    for (const row of agentRows) if (row.id !== "grok") expect(row.readOnly?.userConfig.home?.scope ?? "agent", row.id).toBe("agent");
  });

  it("Claude Code offers only Read among its read-only built-ins (claude-spike.md)", () => {
    expect(agentRow("claude").readOnly?.builtinTools).toEqual(["read"]);
  });

  it("Codex runs allow-all because its adapter accepts nothing else", () => {
    expect(agentRow("codex").readOnly).toMatchObject({ permissionMode: "allow-all", builtinTools: [] });
    for (const row of offeredAgents()) if (row.id !== "codex") expect(row.readOnly?.permissionMode, row.id).toBe("allow-reads");
  });

  it("every offered row names how to log in", () => {
    for (const row of offeredAgents()) expect(row.login.trim(), row.id).not.toBe("");
  });

  it("Cursor resolves cursor-agent, not the agent command Grok also installs", () => {
    expect(agentRow("cursor").command).toBe("cursor-agent");
    expect(agentRows.some(row => row.command === "agent")).toBe(false);
  });

  it("rejects prototype keys as agent ids", () => {
    for (const key of ["constructor", "__proto__", "toString"]) {
      expect(isAgentId(key)).toBe(false);
      expect(isAcpAgentId(key)).toBe(false);
    }
    expect(isAgentId("codex")).toBe(true);
    expect(isAgentId(1)).toBe(false);
  });

  it("a draft runs Kyoshi; learner workspaces and evaluation trials run Sensei", () => {
    expect(personaForKind("draft")).toBe("kyoshi");
    expect(personaForKind("learner")).toBe("sensei");
    expect(personaForKind("evaluation-trial")).toBe("sensei");
  });
});
