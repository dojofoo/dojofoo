import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

const key = "dojofoo.sidebar";
const SidebarState = createContext<{ collapsed: boolean; onCollapsedChange: (collapsed: boolean) => void } | null>(null);

/** One sidebar for every page: whether it's folded to the icon rail lives above the routes (and is remembered), so a page
    opens with the sidebar as the last one left it */
export function SidebarStateProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { if (localStorage.getItem(key) === "rail") setCollapsed(true); } catch {} }, []);
  const onCollapsedChange = useCallback((next: boolean) => {
    setCollapsed(next);
    try { localStorage.setItem(key, next ? "rail" : "open"); } catch {}
  }, []);
  const value = useMemo(() => ({ collapsed, onCollapsedChange }), [collapsed, onCollapsedChange]);
  return <SidebarState.Provider value={value}>{children}</SidebarState.Provider>;
}

/** The shared sidebar's state for an AppShell (none outside the provider: the shell keeps its own) */
export const useSidebarState = () => useContext(SidebarState) ?? {};
