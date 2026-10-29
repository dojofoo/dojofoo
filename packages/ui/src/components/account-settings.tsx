import { useState } from "react";
import { ProfileSettingsFields, SettingsLayout, type SettingsContentProps } from "@dojofoo/uix/components/settings-billing";
import { AvatarUpload } from "@dojofoo/uix/components/arc/avatar-upload/avatar-upload";
import { Button } from "@dojofoo/uix/components/button";
import { AppearanceSettings } from "@dojofoo/uix/containers/appearance-settings";

type AccountTab = "General" | "Appearance";

/** Native account sections, shared by the standalone route and the mounted workspace view. */
export function AccountSettingsContent({ tab, onTabChange, onClose, name }: {
  tab: AccountTab;
  onTabChange: (tab: AccountTab) => void;
  onClose?: () => void;
  name: string;
}) {
  return <SettingsLayout tab={tab} availableTabs={["General", "Appearance"]} onTabChange={next => onTabChange(next === "General" ? "General" : "Appearance")}
    onClose={onClose} description="Your profile and appearance preferences."
    helpText={tab === "General" ? { about: "Your account will keep your profile with you across Dojo.", tip: "Sign-in, profile editing and sign-out are coming soon." } : undefined}>
    {tab === "Appearance" ? <div className="ui-account-appearance"><AppearanceSettings /></div>
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

export function WorkspaceAccountSettings({ defaultTab, userName = "You", onClose }: SettingsContentProps) {
  const [tab, setTab] = useState<AccountTab>(defaultTab === "General" ? "General" : "Appearance");
  return <AccountSettingsContent tab={tab} onTabChange={setTab} onClose={onClose} name={userName} />;
}
