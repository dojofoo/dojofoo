import { useEffect, useState } from "react";
import type { EvaluationSettings } from "@dojofoo/authoring/evaluation/settings";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "@dojofoo/uix/components/button";
import { MenuButton } from "@dojofoo/uix/components/app-shell";
import { Switch } from "@dojofoo/uix/components/switch";
import { codingAgents } from "@/lib/coding-agents";
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
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="ui-as"
    style={{ borderRadius: "calc(12px * var(--squircle-factor, 1))", background: "var(--card)", boxShadow: "var(--shadow-4)" }}>
    <DialogTitle>Teaching evaluations</DialogTitle>
    <DialogDescription>Uses your local harness logins. Trials a Sensei and simulated learner, then asks independent Codex and Claude judges to review. No API keys or worker paths to enter.</DialogDescription>
    <form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); void save(); }}>
      {(["teacher", "learner"] as const).map(role => <fieldset key={role} disabled={busy || !loaded} className="space-y-2">
        <legend className="mb-2 text-sm font-semibold">{role === "teacher" ? "Sensei" : "Simulated learner"}</legend>
        <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
          <div className="text-xs">Coding agent<div className="mt-1">
            <MenuButton label={`${role} agent`} value={settings[role].harness} disabled={busy || !loaded} align="start"
              icon={codingAgents.find(agent => agent.value === settings[role].harness)?.icon}
              options={(["codex", "opencode", "pi", "cursor", "grok", "fx"] as const).map(value => ({ value, label: codingAgents.find(agent => agent.value === value)!.name }))}
              onChange={harness => setSettings(current => ({ ...current, [role]: { harness, model: "" } }))} />
          </div></div>
          <HarnessModelInput harness={settings[role].harness} value={settings[role].model} label={`${role} model`} api={api}
            onChange={model => setSettings(current => ({ ...current, [role]: { ...current[role], model } }))} />
        </div>
      </fieldset>)}
      <label className="flex items-start gap-2 text-sm"><Switch aria-label="Allow teaching evaluations" checked={settings.enabled} disabled={busy || !loaded} onCheckedChange={enabled => setSettings(current => ({ ...current, enabled }))} /><span>Allow Kyoshi to run teaching evaluations using these models and the two judges. Up to three attempts per lesson set; subscription quota or API charges may apply.</span></label>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" disabled={busy || !loaded || !settings.teacher.model.trim() || !settings.learner.model.trim()}>{busy ? "Please wait…" : "Save evaluation settings"}</Button>
    </form>
  </DialogContent></Dialog>;
}
