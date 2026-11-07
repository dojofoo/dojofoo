import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useToast } from "@dojofoo/uix/components/app-shell";
import { useSidebarState } from "./sidebar-state";

/** The account menu opens pages of their own: Settings at /settings/theme, Profile at /me. The sidebar's fold is
    every page's (SidebarStateProvider). */
export function useAccountMenu() {
  const navigate = useNavigate();
  const [toast] = useToast();
  const sidebar = useSidebarState();
  const [user, setUser] = useState<{ name: string; email?: string; avatar?: string }>({ name: "Anonymous" });
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/local/setup", { signal: controller.signal }).then(response => response.ok ? response.json() : null)
      .then(setup => { if (setup?.user?.name) setUser(setup.user); }).catch(() => {});
    return () => controller.abort();
  }, []);
  return {
    account: {
      ...sidebar,
      user, showUser: true,
      onSettings: () => { void navigate({ to: "/settings/$section", params: { section: "theme" } }); },
      onProfile: () => { void navigate({ to: "/me" }); },
    },
    toast,
  };
}
