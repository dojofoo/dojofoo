import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { CoursesIcon, ExploreIcon } from "@dojofoo/uix/icons";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { AccountSettingsContent } from "@/components/account-settings";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => ({ tab: search.tab === "General" ? "General" as const : "Appearance" as const }),
  component: SettingsPage,
});

function SettingsPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { account, toast } = useAccountMenu();
  return <div className="h-dvh overflow-hidden"><AppShell {...account} workspace="Dojo" sidebarWidth="18rem" showNews={false} showOnboarding={false}
    brand={<a href="/" aria-label="Dojo dashboard" className="flex items-center"><BrandLogo className="w-11" /></a>}
    navigation={[{ id: "main", items: [{ id: "courses", label: "Courses", icon: CoursesIcon, href: "/" },
      { id: "explore", label: "Explore", icon: ExploreIcon, href: "/explore" }] }]}
    onNavigate={id => { void navigate({ to: id === "explore" ? "/explore" : "/" }); }}>
    <AccountSettingsContent tab={tab} name={account.user.name}
      onTabChange={next => { void navigate({ search: { tab: next } }); }}
      onClose={() => { void navigate({ to: "/" }); }} />
    {toast}
  </AppShell></div>;
}
