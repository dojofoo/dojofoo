"use client";
import { useEffect, useState, type ComponentProps } from "react";
import { useTheme } from "next-themes";
import { ThemeToggle as UIXThemeToggle, type ThemeMode } from "@dojofoo/uix/components/theme-toggle";
import { themeViewTransition } from "@dojofoo/uix/lib/view-transition";

/** Keep the website's existing next-themes preference and system-mode behavior. */
export function ThemeToggle(props: ComponentProps<"button">) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const mode = mounted && (theme === "light" || theme === "dark") ? theme : "system";
  const resolvedMode = mounted ? resolvedTheme === "dark" ? "dark" : "light" : undefined;
  const change = (next: ThemeMode) => {
    const resolved = next === "system" ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light" : next;
    if (resolved === resolvedMode) setTheme(next);
    else themeViewTransition(() => setTheme(next));
  };
  return <UIXThemeToggle {...props} mode={mode} resolvedMode={resolvedMode} onModeChange={change} />;
}
