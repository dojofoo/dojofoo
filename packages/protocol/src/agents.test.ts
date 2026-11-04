import { describe, expect, it } from "vitest";
import { agentIds, agentRow, agentRows, isAcpAgentId, isAgentId, offeredAgents, personaForKind } from ".";

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
