import { useEffect, useState, type ReactNode } from "react";
import type { Persona } from "@dojofoo/agent/api";
import type { ComposerAgent } from "@dojofoo/uix/containers/assistant-home";
import { Button as UIXButton } from "@dojofoo/uix/components/button";
import { AiMagicIcon } from "@dojofoo/uix/icons";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dojofoo/ui/dialog";
import { codingAgents } from "@/lib/coding-agents";
import { launchFetch, LaunchTokenError } from "@/lib/launch-token";

export type WorkspaceAgent = { id: string; name: string; selected: boolean };
/** A history pick on another agent: the conversation the page opens once the switch is done (D31) */
export type AgentPick = { id: string; readOnly: boolean };

/** Selects the coding agent, then hands the switch, with the pick it was for, to the page */
export async function switchWorkspaceAgent(workspaceId: string, agentId: string, pick: AgentPick | undefined,
  onSwitched: (agentId: string, pick?: AgentPick) => void): Promise<void> {
  const response = await launchFetch(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}/select`, { method: "POST" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: unknown };
    throw new Error(typeof body.message === "string" ? body.message : `The coding agent could not be switched (${response.status}).`);
  }
  onSwitched(agentId, pick);
}

/** The workspace's coding agent, chosen in the composer's agent menu or by a history pick after a confirmation; both personas run on it. */
export function useWorkspaceAgent({ workspaceId, persona, onSwitched }: {
  workspaceId?: string;
  persona: Persona;
  /** After a switch; with the pick it was for, which the page opens in the same update (decision 17) */
  onSwitched(agentId: string, pick?: AgentPick): void;
}): {
  agents: ComposerAgent[];
  /** `GET /agents` as it lists them */
  list: WorkspaceAgent[];
  selected?: string;
  switching: boolean;
  /** Opens the confirmation, for a history pick when `pick` is given; a no-op for the selected agent */
  request(agentId: string, pick?: AgentPick): void;
  /** The confirmation, rendered by the page */
  dialog: ReactNode;
  /** Why the last switch failed, with "Reload the page" when the page's launch token is out of date */
  notice: ReactNode;
} {
  const [list, setList] = useState<WorkspaceAgent[]>([]);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<{ agentId: string; pick?: AgentPick }>();
  const [switching, setSwitching] = useState(false);
  const [failure, setFailure] = useState<{ message: string; stale: boolean }>();
  useEffect(() => { setList([]); }, [workspaceId]);
  useEffect(() => {
    if (!workspaceId) return;
    const controller = new AbortController();
    // Pages whose API doesn't list agents keep the menu empty
    void fetch(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/agents`, { signal: controller.signal })
      .then(response => response.ok ? response.json() as Promise<{ data?: unknown }> : undefined)
      .then(body => { if (!controller.signal.aborted && Array.isArray(body?.data)) setList(body.data as WorkspaceAgent[]); })
      .catch(() => {});
    return () => controller.abort();
  }, [workspaceId, reload]);
  const selected = list.find(agent => agent.selected)?.id;
  const name = (agentId?: string) => list.find(agent => agent.id === agentId)?.name ?? agentId ?? "";

  async function confirm() {
    if (!workspaceId || !pending || switching) return;
    const { agentId, pick } = pending;
    setSwitching(true);
    setFailure(undefined);
    try {
      await switchWorkspaceAgent(workspaceId, agentId, pick, (switched, picked) => {
        setPending(undefined);
        setReload(attempt => attempt + 1);
        onSwitched(switched, picked);
      });
    } catch (cause) {
      setPending(undefined);
      setFailure({ message: cause instanceof Error ? cause.message : String(cause), stale: cause instanceof LaunchTokenError });
    } finally { setSwitching(false); }
  }

  return {
    agents: list.map(agent => ({ value: agent.id, name: agent.name, icon: codingAgents.find(item => item.value === agent.id)?.icon ?? AiMagicIcon })),
    list,
    selected,
    switching,
    request(agentId, pick) {
      if (agentId === selected) return;
      setFailure(undefined);
      setPending({ agentId, ...(pick ? { pick } : {}) });
    },
    dialog: <Dialog open={Boolean(pending)} onOpenChange={open => { if (!open && !switching) setPending(undefined); }}>
      <DialogContent className="ui-as" style={{ borderRadius: "var(--box-radius)", background: "var(--surface-5)", boxShadow: "var(--shadow-5)" }}>
        <DialogHeader>
          <DialogTitle>Switch this workspace to {name(pending?.agentId)}?</DialogTitle>
          <DialogDescription>
            {persona === "kyoshi" ? `Kyoshi will use ${name(pending?.agentId)} for this draft.` : `Sensei will use ${name(pending?.agentId)} for every lesson in this workspace.`}
            {/* D31's wording; an ended Kyoshi pick can't continue, so it says how it opens (decision 13) */}
            {pending?.pick ? pending.pick.readOnly ? " It opens read-only."
              : ` The conversation continues if it still can; otherwise a new conversation starts on ${name(pending.agentId)}.` : null}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<UIXButton variant="ghost" disabled={switching}>Cancel</UIXButton>} />
          <UIXButton disabled={switching} onClick={() => void confirm()}>Switch</UIXButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>,
    notice: failure ? <div role="alert" className="flex items-center gap-2 px-2 pt-1 text-xs text-destructive">
      <span>{failure.message}</span>
      {failure.stale ? <UIXButton size="sm" variant="secondary" onClick={() => window.location.reload()}>Reload the page</UIXButton> : null}
    </div> : null,
  };
}
