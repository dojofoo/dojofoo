"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { MotionConfig } from "motion/react";
import { IconSetContext, type IconSet } from "./lib/icon-context";
import { revealScrollbars } from "./lib/scrollbars";
import { themeViewTransition } from "./lib/view-transition";
import type { PageMode } from "./lib/ui-preferences";
import { NavigationProvider } from "./components/navigation-link";
import type { ComponentProps } from "react";

export type UIXProviderProps = {
  children: ReactNode;
  icons?: IconSet;
  font?: "common" | "modern" | "noto";
  /** Omit when the application's existing theme provider owns light/dark mode. */
  mode?: PageMode;
  link?: ComponentProps<typeof NavigationProvider>["link"];
};

/** The same icon, motion, theme and scrollbar behavior in applications and stories. */
export function UIXProvider({ children, icons = "mingcute", font = "common", mode, link }: UIXProviderProps) {
  const initialized = useRef(false);
  useEffect(revealScrollbars, []);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.uiFont = font;
    if (mode === undefined) return;
    const apply = () => {
      root.classList.toggle("dark", mode === "dark");
      root.style.colorScheme = mode;
    };
    if (!initialized.current) { initialized.current = true; apply(); }
    else if (root.classList.contains("dark") !== (mode === "dark")) themeViewTransition(apply);
  }, [font, mode]);
  return <MotionConfig reducedMotion="user"><IconSetContext.Provider value={icons}><NavigationProvider link={link}>{children}</NavigationProvider></IconSetContext.Provider></MotionConfig>;
}
