import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useToast } from "@dojofoo/uix/components/app-shell";
import { useSidebarState } from "./sidebar-state";

const loadAccountPage = () => import("@/components/account-settings").then(({ WorkspaceAccountSettings }) => WorkspaceAccountSettings);

/** Editing workspaces keep their content mounted; the dashboard retains the standalone routes. The sidebar's fold is
    every page's (SidebarStateProvider). */
export function useAccountMenu({ preserveWorkspace = false }: { preserveWorkspace?: boolean } = {}) {
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
      ...(preserveWorkspace ? { loadAccountPage } : {
        onSettings: () => { void navigate({ to: "/settings", search: { tab: "Appearance" } }); },
        onProfile: () => { void navigate({ to: "/settings", search: { tab: "General" } }); },
      }),
    },
    toast,
  };
}
