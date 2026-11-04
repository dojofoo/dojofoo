import { useEffect, useState } from "react";
import type { EvaluationSettings } from "@dojofoo/authoring/evaluation/settings";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "@dojofoo/uix/components/button";
import { Switch } from "@dojofoo/uix/components/switch";
import { httpError } from "@/lib/http-error";

const empty: EvaluationSettings = { enabled: false };

/** Consent only (D10): every role of an evaluation runs on the draft's coding agent, `agentName`, and its model. */
export function AuthoringEvaluationSettings({ open, onOpenChange, api, onSaved, agentName }: {
  open: boolean; onOpenChange(open: boolean): void; api(path: string): string; onSaved(): void; agentName: string;
}) {
  const [settings, setSettings] = useState(empty);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(undefined);
    setBusy(true);
    setLoaded(false);
    fetch(api("/api/authoring/evaluation-settings"), { signal: controller.signal }).then(async response => {
      if (!response.ok) throw await httpError(response);
      const value = await response.json();
      if (!controller.signal.aborted) {
        setSettings(value ?? empty);
        setLoaded(true);
      }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [open, api]);
  async function save() {
    if (busy || !loaded) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch(api("/api/authoring/evaluation-settings"), {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: settings.enabled }),
      });
      if (!response.ok) throw await httpError(response);
      onSaved();
      onOpenChange(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="ui-as"
    style={{ borderRadius: "calc(12px * var(--squircle-factor, 1))", background: "var(--card)", boxShadow: "var(--shadow-4)" }}>
    <DialogTitle>Teaching evaluations</DialogTitle>
    <DialogDescription>Trials a Sensei and a simulated learner on this draft's coding agent, {agentName}, then asks two judges on that agent to review. Uses your local login; no API keys or worker paths to enter.</DialogDescription>
    <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label className="flex items-start gap-2 text-sm"><Switch aria-label="Allow teaching evaluations" checked={settings.enabled} disabled={busy || !loaded} onCheckedChange={enabled => setSettings(current => ({ ...current, enabled }))} /><span>Allow Kyoshi to run teaching evaluations on {agentName}. Each trial makes one call per lesson to write practice solutions, about eleven Sensei turns, up to six simulated-learner replies and four judge calls. Up to three attempts per lesson set; subscription quota or API charges may apply.</span></label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={busy || !loaded}>{busy ? "Please wait…" : "Save evaluation settings"}</Button>
    </form>
  </DialogContent></Dialog>;
}
