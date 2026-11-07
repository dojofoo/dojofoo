import { ProfileSettingsFields, SettingsLayout } from "@dojofoo/uix/components/settings-billing";
import { AvatarUpload } from "@dojofoo/uix/components/arc/avatar-upload/avatar-upload";
import { Button } from "@dojofoo/uix/components/button";
import { AppearanceSettings } from "@dojofoo/uix/containers/appearance-settings";

export type AccountTab = "Profile" | "Theme";

/** The account sections, one page each under /settings */
export function AccountSettingsContent({ tab, onTabChange, onClose, name }: {
  tab: AccountTab;
  onTabChange: (tab: AccountTab) => void;
  onClose?: () => void;
  name: string;
}) {
  return <SettingsLayout tab={tab} availableTabs={["Profile", "Theme"]} onTabChange={next => onTabChange(next === "Profile" ? "Profile" : "Theme")}
    onClose={onClose} description="Your profile and theme preferences."
    helpText={tab === "Profile" ? { about: "Your account will keep your profile with you across Dojo.", tip: "Sign-in, profile editing and sign-out are coming soon." } : undefined}>
    {tab === "Theme" ? <div className="ui-account-appearance"><AppearanceSettings /></div>
      : <section className="ui-sb-tray ui-sb-form" aria-label="Profile">
        <ProfileSettingsFields name={name} handle="" handleState="invalid" disabled
          onNameChange={() => {}} onHandleChange={() => {}}
          avatar={<AvatarUpload name={name} disabled onUpload={async () => {}} />} />
        <div className="ui-sb-form__foot">
          <Button size="sm" variant="ghost" disabled>Discard</Button>
          <Button size="sm" disabled>Save changes</Button>
        </div>
      </section>}
  </SettingsLayout>;
}
