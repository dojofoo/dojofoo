import { useEffect, useState, type ReactNode } from "react";
import type { Persona } from "@dojofoo/agent-api";
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

type WorkspaceAgent = { id: string; name: string; selected: boolean };

/** The workspace's coding agent, chosen in the composer's agent menu after a confirmation; both personas run on it. */
export function useWorkspaceAgent({ workspaceId, persona, onSwitched }: {
  workspaceId?: string;
  persona: Persona;
  onSwitched(agentId: string): void;
}): {
  agents: ComposerAgent[];
  selected?: string;
  switching: boolean;
  /** Opens the confirmation; a no-op for the selected agent */
  request(agentId: string): void;
  /** The confirmation, rendered by the page */
  dialog: ReactNode;
  /** Why the last switch failed, with "Reload the page" when the page's launch token is out of date */
  notice: ReactNode;
} {
  const [list, setList] = useState<WorkspaceAgent[]>([]);
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<string>();
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
    const agentId = pending;
    setSwitching(true);
    setFailure(undefined);
    try {
      const response = await launchFetch(`/api/v1/workspaces/${encodeURIComponent(workspaceId)}/agents/${encodeURIComponent(agentId)}/select`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { message?: unknown };
        throw new Error(typeof body.message === "string" ? body.message : `The coding agent could not be switched (${response.status}).`);
      }
      setPending(undefined);
      setReload(attempt => attempt + 1);
      onSwitched(agentId);
    } catch (cause) {
      setPending(undefined);
      setFailure({ message: cause instanceof Error ? cause.message : String(cause), stale: cause instanceof LaunchTokenError });
    } finally { setSwitching(false); }
  }

  return {
    agents: list.map(agent => ({ value: agent.id, name: agent.name, icon: codingAgents.find(item => item.value === agent.id)?.icon ?? AiMagicIcon })),
    selected,
    switching,
    request(agentId) {
      if (agentId === selected) return;
      setFailure(undefined);
      setPending(agentId);
    },
    dialog: <Dialog open={Boolean(pending)} onOpenChange={open => { if (!open && !switching) setPending(undefined); }}>
      <DialogContent className="ui-as" style={{ borderRadius: "var(--box-radius)", background: "var(--surface-5)", boxShadow: "var(--shadow-5)" }}>
        <DialogHeader>
          <DialogTitle>Switch this workspace to {name(pending)}?</DialogTitle>
          <DialogDescription>
            {persona === "kyoshi" ? `Kyoshi will use ${name(pending)} for this draft.` : `Sensei will use ${name(pending)} for every lesson in this workspace.`}
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
