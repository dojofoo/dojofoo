import { useEffect, useState } from "react";
import { Icon } from "../components/app-shell";
import { Tick02Icon } from "../lib/icons";

/** Prototype handles already taken on dojo.foo */
const takenHandles = ["sam", "admin", "dojo", "sensei", "kyoshi", "root"];
const handlePattern = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/;

/** The shared onboarding handle check, debounced while typing */
export function useHandleCheck(handle: string) {
  const [state, setState] = useState<"invalid" | "checking" | "available" | "taken">("checking");
  useEffect(() => {
    if (!handlePattern.test(handle)) { setState("invalid"); return; }
    setState("checking");
    const t = window.setTimeout(() => setState(takenHandles.includes(handle) ? "taken" : "available"), 500);
    return () => window.clearTimeout(t);
  }, [handle]);
  return state;
}

export function ProfileFields({ name, handle, handleState, onNameChange, onHandleChange, disabled }: {
  name: string;
  handle: string;
  handleState: ReturnType<typeof useHandleCheck>;
  onNameChange: (name: string) => void;
  onHandleChange: (handle: string) => void;
  disabled?: boolean;
}) {
  return <>
    <style href="ui-profile-fields" precedence="default">{css}</style>
              <div className="ui-ob-fields">
                <label className="ui-ob-field">
                  <span className="ui-ob-label">Name</span>
                  <input className="ui-ob-input" value={name} placeholder="e.g. Sam Rivera" autoComplete="name" disabled={disabled} onChange={(event) => onNameChange(event.target.value)} />
                </label>
                <label className="ui-ob-field">
                  <span className="ui-ob-label">Handle</span>
                  <span className="ui-ob-input ui-ob-input--prefix">
                    <span className="ui-ob-prefix">dojo.foo/u/</span>
                    <input value={handle} placeholder="samrivera" aria-label="Handle" autoComplete="username" spellCheck={false} disabled={disabled} aria-invalid={!disabled && (handleState === "taken" || handleState === "invalid") || undefined}
                      onChange={(event) => onHandleChange(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
                  </span>
                  <span className="ui-ob-hint ui-setup__handle" data-state={handleState} aria-live="polite">
                    {handleState === "checking" ? "Checking…"
                      : handleState === "available" ? <><Icon icon={Tick02Icon} size={12} stroke={2.4} />dojo.foo/u/{handle} is yours</>
                      : handleState === "taken" ? "Taken – try another"
                      : "3–24 letters, numbers or dashes"}
                  </span>
                </label>
              </div>
  </>;
}
const css = `
.ui-setup__handle { display: inline-flex; align-items: center; gap: 5px; }
.ui-setup__handle[data-state="available"] { color: var(--ev-pass, #16a34a); }
:where(.dark, [data-theme="dark"]) .ui-setup__handle[data-state="available"] { color: #4ade80; }
.ui-setup__handle[data-state="taken"] { color: var(--ev-fail, #dc2626); }
`;
