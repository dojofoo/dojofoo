import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { agentIds, agentRow, offeredAgents } from "@dojofoo/protocol";
import { ConversationRows, historyRow } from "./conversation-history";

// The agents GET /agents lists: the offered ones, as the shipped record says, the first selected
const offered = offeredAgents().map(row => row.id);
const [selected, other] = offered as [string, string];
const agents = offered.map(id => ({ id, name: agentRow(id).name, selected: id === selected }));
const notOffered = agentIds.find(id => !offered.includes(id))!;
const record = (overrides: Partial<Parameters<typeof historyRow>[0]> = {}) => ({ id: "s1", agent: selected, createdAt: "2026-11-04T00:00:00.000Z", ...overrides });
const html = (row: ReturnType<typeof historyRow>) => renderToStaticMarkup(<ConversationRows rows={[row]} onPick={() => {}} />);

describe("the history menu's rows (D31)", () => {
  it("a live conversation on the selected agent is live and opens", () => {
    for (const persona of ["sensei", "kyoshi"] as const) {
      const row = historyRow(record({ firstMessage: "Outline the course", model: "fixture-model" }), persona, agents);
      expect(row).toMatchObject({ state: "live", action: { readOnly: false }, firstMessage: "Outline the course", model: "fixture-model" });
      expect(row.action).not.toHaveProperty("switchTo");
      expect(html(row)).toContain("<button");
    }
  });

  it("a live conversation on another agent is live and offers the switch, then opens", () => {
    for (const persona of ["sensei", "kyoshi"] as const) {
      expect(historyRow(record({ agent: other }), persona, agents)).toMatchObject({ state: "live", agentName: agentRow(other as never).name,
        action: { switchTo: other, readOnly: false } });
    }
  });

  it("an unavailable conversation is no longer available and can't be opened", () => {
    for (const persona of ["sensei", "kyoshi"] as const) {
      const row = historyRow(record({ endedAt: "2026-11-05T00:00:00.000Z", unavailable: true }), persona, agents);
      expect(row).toMatchObject({ state: "no longer available" });
      expect(row).not.toHaveProperty("action");
      expect(html(row)).not.toContain("<button");
    }
  });

  it("a replaced conversation can't be opened by Sensei; Kyoshi opens it read-only, as an ended one", () => {
    const replaced = record({ endedAt: "2026-11-05T00:00:00.000Z", replacedBy: "s2" });
    expect(historyRow(replaced, "sensei", agents)).not.toHaveProperty("action");
    expect(historyRow(replaced, "sensei", agents).state).toBe("replaced");
    expect(historyRow(replaced, "kyoshi", agents)).toMatchObject({ state: "replaced", action: { readOnly: true } });
  });

  it("an ended conversation can't be opened by Sensei; Kyoshi opens it read-only, switching first on another agent", () => {
    const ended = record({ endedAt: "2026-11-05T00:00:00.000Z" });
    const sensei = historyRow(ended, "sensei", agents);
    expect(sensei.state).toBe("ended");
    expect(sensei).not.toHaveProperty("action");
    expect(html(sensei)).not.toContain("<button");
    expect(historyRow(ended, "kyoshi", agents)).toMatchObject({ state: "ended", action: { readOnly: true } });
    expect(historyRow({ ...ended, agent: other }, "kyoshi", agents)).toMatchObject({ state: "ended", action: { switchTo: other, readOnly: true } });
  });

  it("a conversation on an agent GET /agents doesn't list isn't available, with no open and no switch", () => {
    for (const persona of ["sensei", "kyoshi"] as const) {
      const row = historyRow(record({ agent: notOffered }), persona, agents);
      expect(row.state).toBe(`${agentRow(notOffered).name} isn't available`);
      expect(row).not.toHaveProperty("action");
      expect(html(row)).not.toContain("<button");
    }
  });

  it("a conversation with no message yet says so, and the open one is marked current", () => {
    const row = historyRow(record(), "kyoshi", agents);
    expect(row.firstMessage).toBe("No messages yet");
    expect(renderToStaticMarkup(<ConversationRows rows={[row]} current="s1" onPick={() => {}} />)).toContain('aria-current="true"');
  });
});
