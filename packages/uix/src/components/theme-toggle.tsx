import { Monitor } from "@mynaui/icons-react";
import { Button, type ButtonProps } from "./button";
import { Icon } from "./app-shell";
import { MoonIcon, SunIcon } from "../lib/icons";

export type ThemeMode = "light" | "dark" | "system";
export type ThemeToggleProps = Omit<ButtonProps, "children" | "icon" | "iconRight" | "variant" | "size" | "loading"> & {
  mode: ThemeMode;
  resolvedMode?: "light" | "dark";
  onModeChange: (mode: ThemeMode) => void;
};

/** The host owns preference storage and theme application; this control only cycles the choice. */
export function ThemeToggle({ mode, resolvedMode, onModeChange, className, onClick, ...rest }: ThemeToggleProps) {
  const next = mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
  const current = mode === "system" && resolvedMode ? `system (currently ${resolvedMode})` : mode;
  const label = `Theme: ${current}. Switch to ${next}`;
  return <Button {...rest} variant="ghost" size="sm" className={["size-8 p-0", className].filter(Boolean).join(" ")}
    title={label} aria-label={label}
    icon={mode === "system" ? <Monitor width={16} height={16} /> : <Icon icon={mode === "dark" ? MoonIcon : SunIcon} size={16} />}
    onClick={event => { onClick?.(event); if (!event.defaultPrevented) onModeChange(next); }} />;
}
