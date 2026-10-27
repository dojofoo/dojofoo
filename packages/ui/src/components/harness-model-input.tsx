import { useEffect, useId, useState } from "react";
import { httpError } from "@/lib/http-error";
import { Dropdown, Icon } from "@dojofoo/uix/components/app-shell";
import { ArrowDown01Icon } from "@dojofoo/uix/icons";

/** Native catalog suggestions; custom provider IDs remain usable. No secrets
 * or authentication settings pass through the browser. */
export function HarnessModelInput({ harness, value, onChange, label, api }: {
  harness: string; value: string; onChange(value: string): void;
  label: string; api(path: string): string;
}) {
  const id = useId();
  const [models, setModels] = useState<Array<{ id: string; name: string }>>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setModels([]);
    setError(undefined);
    setLoading(true);
    fetch(api(`/api/authoring/models?harness=${encodeURIComponent(harness)}`), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw await httpError(response);
        const result = await response.json();
        if (!controller.signal.aborted) setModels(result);
      }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [harness, api]);
  return <div className="min-w-0 flex-1 text-xs"><label htmlFor={id}>Model</label>
    <div className="ui-ob-input mt-1 w-full pl-3">
      <input id={id} aria-label={label} required value={value}
        onChange={event => onChange(event.target.value)} placeholder={loading ? "Reading native models…" : "Search models or enter a model ID"} />
      <Dropdown title="Available models" align="end" items={models.map(model => ({ label: model.name, description: model.id, checked: model.id === value, onSelect: () => onChange(model.id) }))}
        trigger={({ open, toggle }) => <button type="button" className="ui-as-icon-btn" aria-label={`Choose ${label}`} aria-haspopup="menu" aria-expanded={open} disabled={loading || !models.length} onClick={toggle}><Icon icon={ArrowDown01Icon} size={14} /></button>} />
    </div>
    {error ? <span className="mt-1 block text-muted-foreground">{error}</span> : null}
  </div>;
}
