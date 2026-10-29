import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { AccountSettingsContent } from "@/components/account-settings";
import { DashboardPalette } from "@/components/dashboard-palette";
import { dashboardNavigation, dashboardNavigationKey } from "@/lib/dashboard-navigation";
import { useState } from "react";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => ({ tab: search.tab === "General" ? "General" as const : "Appearance" as const }),
  component: SettingsPage,
});

function SettingsPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { account, toast } = useAccountMenu();
  const [paletteOpen, setPaletteOpen] = useState(false);
  return <div className="h-dvh overflow-hidden"><AppShell {...account} workspace="Dojo" sidebarWidth="18rem" showNews={false} showOnboarding={false}
    brand={<a href="/" aria-label="Dojo dashboard" className="flex items-center"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></a>}
    navigation={dashboardNavigation()} navigationKey={dashboardNavigationKey} active={[]}
    onNavigate={id => { void navigate({ to: id === "explore" ? "/explore" : "/" }); }} onSearch={() => setPaletteOpen(true)}>
    <AccountSettingsContent tab={tab} name={account.user.name}
      onTabChange={next => { void navigate({ search: { tab: next } }); }}
      onClose={() => { void navigate({ to: "/" }); }} />
    <DashboardPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    {toast}
  </AppShell></div>;
}
