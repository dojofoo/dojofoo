import { useNavigate } from "@tanstack/react-router";
import { useToast } from "@dojofoo/uix/components/app-shell";

/** The local account menu uses native routes; authentication actions remain explicit placeholders. */
export function useAccountMenu() {
  const navigate = useNavigate();
  const [toast, notify] = useToast();
  return {
    account: {
      user: { name: "You" }, showUser: true,
      onSettings: () => { void navigate({ to: "/settings", search: { tab: "Appearance" } }); },
      onProfile: () => { void navigate({ to: "/settings", search: { tab: "General" } }); },
      onLogin: () => notify("Sign-in is coming soon."),
      onLogout: () => notify("Account sign-out is coming soon."),
    },
    toast,
  };
}
