import { useEffect, useState } from "react";
import type { Persona, SessionRecord } from "@dojofoo/harness/api";
import { agentRow, isAgentId } from "@dojofoo/protocol";
import { Icon, Popover } from "@dojofoo/uix/components/app-shell";
import { Button as UIXButton } from "@dojofoo/uix/components/button";
import { BubbleChatIcon } from "@dojofoo/uix/icons";
import type { WorkspaceAgent } from "@/hooks/use-workspace-agent";

/** A conversation the learner or author picked: its agent, and whether it opens read-only (an ended Kyoshi one, D32) */
export type HistoryPick = { id: string; agent: string; readOnly: boolean };
type HistoryRecord = Pick<SessionRecord, "id" | "agent" | "createdAt" | "model" | "firstMessage" | "endedAt" | "replacedBy" | "unavailable">;
/** What a row shows and does, from the record alone (D31); `action` is absent when the row can't be opened */
export type HistoryRow = { id: string; agent: string; agentName: string; model?: string; createdAt: string; firstMessage: string; state: string;
  action?: { switchTo?: string; readOnly: boolean } };

export function historyRow(record: HistoryRecord, persona: Persona, agents: WorkspaceAgent[]): HistoryRow {
  const listed = agents.find(agent => agent.id === record.agent);
  const agentName = listed?.name ?? (isAgentId(record.agent) ? agentRow(record.agent).name : record.agent);
  const row = { id: record.id, agent: record.agent, agentName, ...(record.model ? { model: record.model } : {}), createdAt: record.createdAt,
    firstMessage: record.firstMessage ?? "No messages yet" };
  // Opening a conversation on another agent switches the workspace to it first
  const action = (readOnly: boolean) => ({ action: { ...(listed?.selected ? {} : { switchTo: record.agent }), readOnly } });
  if (!listed) return { ...row, state: `${agentName} isn't available` };
  if (record.unavailable) return { ...row, state: "no longer available" };
  // Sensei never reopens a conversation that ended; Kyoshi shows one read-only
  if (record.replacedBy) return { ...row, state: "replaced", ...(persona === "kyoshi" ? action(true) : {}) };
  if (record.endedAt) return { ...row, state: "ended", ...(persona === "kyoshi" ? action(true) : {}) };
  return { ...row, state: "live", ...action(false) };
}

/** The rows of the menu: a picked row opens, or asks to switch first; the rest only show their state */
export function ConversationRows({ rows, current, onPick }: { rows: HistoryRow[]; current?: string; onPick(row: HistoryRow): void }) {
  if (!rows.length) return <p className="px-2 py-1 text-xs text-muted-foreground">No conversations yet.</p>;
  return <ul aria-label="Conversations" className="grid max-h-80 gap-1 overflow-auto">
    {rows.map(row => {
      const content = <>
        <span className="block truncate text-sm">{row.firstMessage}</span>
        <span className="block text-xs text-muted-foreground">{row.agentName}{row.model ? ` · ${row.model}` : ""} · {new Date(row.createdAt).toLocaleDateString()} · {row.state}</span>
      </>;
      return <li key={row.id} aria-current={row.id === current ? "true" : undefined}>
        {row.action ? <button type="button" className="w-full rounded-md px-2 py-1 text-left hover:bg-[var(--surface-3)]" onClick={() => onPick(row)}>{content}</button>
          : <div className="px-2 py-1 opacity-70">{content}</div>}
      </li>;
    })}
  </ul>;
}

/** The page's conversations on every agent, next to the persona's dot (D31): `GET /sessions` for the persona (and a Sensei page's
 *  course and lesson). A pick on the selected agent opens; on another agent the page confirms the switch first. */
export function ConversationHistory({ workspaceId, persona, page, current, agents, onPick }: {
  workspaceId: string; persona: Persona;
  /** A Sensei page's key: its course, and its kata lesson (none for an interactive course) */
  page?: { course: string; lesson?: string };
  /** The conversation open now */
  current?: string;
  agents: WorkspaceAgent[];
  /** The page opens a pick on the selected agent, and asks to switch for one on another (`useWorkspaceAgent.request`) */
  onPick(pick: HistoryPick): void;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [records, setRecords] = useState<HistoryRecord[]>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ persona, per_page: "100", ...(page ? { course: page.course, lesson: page.lesson ?? "" } : {}) });
    setFailed(false);
    void fetch(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/sessions?${query}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`The conversations could not be read (${response.status}).`);
        return (await response.json() as { data: HistoryRecord[] }).data;
      })
      .then(data => { if (!controller.signal.aborted) setRecords(data); }, () => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [open, attempt, workspaceId, persona, page?.course, page?.lesson]);
  const rows = (records ?? []).map(record => historyRow(record, persona, agents));
  return <span className="ui-as-anchor">
    <button type="button" className="ui-as-icon-btn" aria-label="Conversations" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Icon icon={BubbleChatIcon} size={15} />
    </button>
    <Popover open={open} onClose={() => setOpen(false)} className="ui-as-menu w-80 p-2">
      {failed ? <div role="alert" className="grid gap-2 p-1 text-sm">
        <span>Couldn't load the conversations.</span>
        <UIXButton size="sm" variant="secondary" onClick={() => setAttempt(value => value + 1)}>Try again</UIXButton>
      </div> : records ? <ConversationRows rows={rows} current={current} onPick={row => {
        setOpen(false);
        onPick({ id: row.id, agent: row.agent, readOnly: row.action!.readOnly });
      }} /> : <p role="status" className="px-2 py-1 text-xs text-muted-foreground">Loading conversations…</p>}
    </Popover>
  </span>;
}
