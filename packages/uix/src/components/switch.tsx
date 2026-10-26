import { useState, type ButtonHTMLAttributes } from "react";

export type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "defaultChecked"> & {
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

/** A shared, round switch whose shape stays constant across themes. */
export function Switch({ checked, defaultChecked = false, onCheckedChange, className, onClick, children, ...props }: SwitchProps) {
  const [internal, setInternal] = useState(defaultChecked);
  const value = checked ?? internal;
  return <>
    <style href="ui-switch" precedence="default">{css}</style>
    <button {...props} type="button" role="switch" aria-checked={value} className={["ui-switch", className].filter(Boolean).join(" ")} onClick={event => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      if (checked === undefined) setInternal(!value);
      onCheckedChange?.(!value);
    }}>{children}</button>
  </>;
}

const css = `
.ui-switch {
  appearance: none; position: relative; flex: none; padding: 0; margin: 0; border: 0;
  width: 32px; height: 20px; border-radius: 999px; corner-shape: round;
  background: var(--toggle-off, var(--ui-disabled)); cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-fast);
}
.ui-switch::after {
  content: ""; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
  border-radius: 50%; corner-shape: round; background: #fff; box-shadow: var(--knob-shadow);
  transition: translate var(--motion-moderate) var(--ease-moderate);
}
.ui-switch[aria-checked="true"] { background: var(--switch-on, var(--brand)); }
.ui-switch[aria-checked="true"]::after { translate: 12px 0; }
.ui-switch:focus-visible { outline: 2px solid var(--brand); outline-offset: 3px; }
.ui-switch:disabled { opacity: .45; cursor: default; }
@media (prefers-reduced-motion: reduce) { .ui-switch, .ui-switch::after { transition: none; } }
`;
