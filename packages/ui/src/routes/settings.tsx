import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { ProfileSettingsFields, SettingsLayout } from "@dojofoo/uix/components/settings-billing";
import { AvatarUpload } from "@dojofoo/uix/components/arc/avatar-upload/avatar-upload";
import { Button } from "@dojofoo/uix/components/button";
import { AppearanceSettings } from "@dojofoo/uix/containers/appearance-settings";
import { CoursesIcon, ExploreIcon } from "@dojofoo/uix/icons";
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
    navigation={[{ id: "main", items: [{ id: "courses", label: "Courses", icon: CoursesIcon, href: "/" },
      { id: "explore", label: "Explore", icon: ExploreIcon, href: "/explore" }] }]}
    onNavigate={id => { void navigate({ to: id === "explore" ? "/explore" : "/" }); }}>
    <SettingsLayout tab={tab} availableTabs={["General", "Appearance"]} onTabChange={next => { void navigate({ search: { tab: next === "General" ? "General" : "Appearance" } }); }}
      onClose={() => { void navigate({ to: "/" }); }} description="Your profile and appearance preferences."
      helpText={tab === "General" ? { about: "Your account will keep your profile with you across Dojo.", tip: "Sign-in, profile editing and sign-out are coming soon." } : undefined}>
      {tab === "Appearance" ? <div className="ui-account-appearance"><AppearanceSettings /></div>
        : <section className="ui-sb-tray ui-sb-form" aria-label="Profile">
          <ProfileSettingsFields name={account.user.name} handle="" handleState="invalid" disabled
            onNameChange={() => {}} onHandleChange={() => {}}
            avatar={<AvatarUpload name={account.user.name} disabled onUpload={async () => {}} />} />
          <div className="ui-sb-form__foot">
            <Button size="sm" variant="ghost" disabled>Discard</Button>
            <Button size="sm" disabled>Save changes</Button>
          </div>
        </section>}
    </SettingsLayout>
    {toast}
  </AppShell></div>;
}
