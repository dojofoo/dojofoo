import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { SettingsLayout } from "@dojofoo/uix/components/settings-billing";
import { AppearanceSettings } from "@dojofoo/uix/containers/appearance-settings";
import { CoursesIcon } from "@dojofoo/uix/icons";
import { useAccountMenu } from "@/hooks/use-account-menu";

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
    navigation={[{ id: "main", items: [{ id: "courses", label: "Courses", icon: CoursesIcon, href: "/" }] }]}
    onNavigate={() => { void navigate({ to: "/" }); }}>
    <SettingsLayout tab={tab} availableTabs={["General", "Appearance"]} onTabChange={next => { void navigate({ search: { tab: next === "General" ? "General" : "Appearance" } }); }}
      onClose={() => { void navigate({ to: "/" }); }} description="Your profile and appearance preferences."
      helpText={tab === "General" ? { about: "Your account will keep your profile with you across Dojo.", tip: "Sign-in, profile editing and sign-out are coming soon." } : undefined}>
      {tab === "Appearance" ? <div className="ui-account-appearance"><AppearanceSettings /></div>
        : <section><h2 className="ui-sb-h2">Profile</h2><p className="ui-sb-sub">Profile settings are coming soon.</p></section>}
    </SettingsLayout>
    {toast}
  </AppShell></div>;
}
