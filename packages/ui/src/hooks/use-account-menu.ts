import { useNavigate } from "@tanstack/react-router";
import { useToast } from "@dojofoo/uix/components/app-shell";

const loadAccountPage = () => import("@/components/account-settings").then(({ WorkspaceAccountSettings }) => WorkspaceAccountSettings);

/** Editing workspaces keep their content mounted; the dashboard retains the standalone routes. */
export function useAccountMenu({ preserveWorkspace = false }: { preserveWorkspace?: boolean } = {}) {
  const navigate = useNavigate();
  const [toast, notify] = useToast();
  return {
    account: {
      user: { name: "You" }, showUser: true,
      ...(preserveWorkspace ? { loadAccountPage } : {
        onSettings: () => { void navigate({ to: "/settings", search: { tab: "Appearance" } }); },
        onProfile: () => { void navigate({ to: "/settings", search: { tab: "General" } }); },
      }),
      onLogin: () => notify("Sign-in is coming soon."),
      onLogout: () => notify("Account sign-out is coming soon."),
    },
    toast,
  };
}
