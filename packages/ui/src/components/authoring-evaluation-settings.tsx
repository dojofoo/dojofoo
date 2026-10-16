import { useEffect, useState } from "react";
import type { EvaluationSettings } from "@dojofoo/authoring/evaluation/settings";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
import { HarnessModelInput } from "./harness-model-input";
import { httpError } from "@/lib/http-error";

const empty: EvaluationSettings = { enabled: false, teacher: { harness: "opencode", model: "" }, learner: { harness: "pi", model: "" } };

export function AuthoringEvaluationSettings({ open, onOpenChange, api, onSaved }: {
  open: boolean; onOpenChange(open: boolean): void; api(path: string): string; onSaved(): void;
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
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(settings),
      });
      if (!response.ok) throw await httpError(response);
      onSaved();
      onOpenChange(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogTitle>Teaching evaluations</DialogTitle>
    <DialogDescription>Uses your local harness logins. Trials a Sensei and simulated learner, then asks independent Codex and Claude judges to review. No API keys or worker paths to enter.</DialogDescription>
    <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      {(["teacher", "learner"] as const).map(role => <fieldset key={role} disabled={busy || !loaded} className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">{role === "teacher" ? "Sensei" : "Simulated learner"}</legend>
        <div className="flex gap-2">
          <label className="text-xs">Harness<select aria-label={`${role} harness`} className="mt-1 block w-full border bg-background p-2 text-sm" value={settings[role].harness}
            onChange={event => setSettings(current => ({ ...current, [role]: { harness: event.target.value as EvaluationSettings["teacher"]["harness"], model: "" } }))}>
            {["codex", "opencode", "pi", "cursor", "grok", "fx"].map(harness => <option key={harness}>{harness}</option>)}
          </select></label>
          <HarnessModelInput harness={settings[role].harness} value={settings[role].model} label={`${role} model`} api={api}
            onChange={model => setSettings(current => ({ ...current, [role]: { ...current[role], model } }))} />
        </div>
      </fieldset>)}
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={settings.enabled} disabled={busy || !loaded} onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))} />Allow Kyoshi to run teaching evaluations using these models and the two judges. Up to three attempts per lesson set; subscription quota or API charges may apply.</label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={busy || !loaded || !settings.teacher.model.trim() || !settings.learner.model.trim()}>{busy ? "Please wait…" : "Save evaluation settings"}</Button>
    </form>
  </DialogContent></Dialog>;
}
