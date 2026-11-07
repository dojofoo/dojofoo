import { Link, createFileRoute, notFound, useCanGoBack, useRouter } from "@tanstack/react-router";
import { AppShell } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { AccountSettingsContent, type AccountTab } from "@/components/account-settings";
import { DashboardPalette } from "@/components/dashboard-palette";
import { dashboardNavigation, dashboardNavigationKey } from "@/lib/dashboard-navigation";
import { useState } from "react";

/** Each settings section is a page: /settings/profile, /settings/theme */
const sections = { profile: "Profile", theme: "Theme" } as const satisfies Record<string, AccountTab>;
type Section = keyof typeof sections;
const isSection = (value: string): value is Section => Object.hasOwn(sections, value);

export const Route = createFileRoute("/settings/$section")({
  beforeLoad: ({ params }) => {
    if (!isSection(params.section)) throw notFound();
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { section } = Route.useParams();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const { account, toast } = useAccountMenu();
  const [paletteOpen, setPaletteOpen] = useState(false);
  return <div className="h-dvh overflow-hidden"><AppShell {...account} workspace="Dojo" sidebarWidth="18rem" showNews={false} showOnboarding={false}
    brand={<Link to="/" aria-label="Dojo dashboard" className="flex items-center"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></Link>}
    navigation={dashboardNavigation()} navigationKey={dashboardNavigationKey} active={[]}
    onNavigate={id => { void navigate({ to: id === "explore" ? "/explore" : "/" }); }} onSearch={() => setPaletteOpen(true)}>
    <AccountSettingsContent tab={sections[section as Section]} name={account.user.name}
      onTabChange={next => { void navigate({ params: { section: next === "Profile" ? "profile" : "theme" } }); }}
      // Back to the page that opened settings, a lesson or a draft included; the dashboard when there is none
      onClose={() => { if (canGoBack) router.history.back(); else void navigate({ to: "/" }); }} />
    <DashboardPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    {toast}
  </AppShell></div>;
}
