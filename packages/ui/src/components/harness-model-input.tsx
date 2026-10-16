import { useEffect, useId, useState } from "react";
import { httpError } from "@/lib/http-error";

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
  return <label className="flex-1 text-xs">Model
    <input aria-label={label} required list={id} className="mt-1 block w-full border bg-background p-2 text-sm" value={value}
      onChange={event => onChange(event.target.value)} placeholder={loading ? "Reading native models…" : "Search models or enter a model ID"} />
    <datalist id={id}>{models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}</datalist>
    {error ? <span className="mt-1 block text-muted-foreground">{error}</span> : null}
  </label>;
}
