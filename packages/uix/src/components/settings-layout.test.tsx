import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SettingsLayout } from "./settings-billing";

it("renders host-owned settings in the Pages layout without prototype account sections", () => {
  const html = renderToStaticMarkup(<SettingsLayout tab="General" onTabChange={() => {}} availableTabs={["General", "Appearance"]}
    description="Settings on this device" helpText={{ about: "Local profile", tip: "Accounts are coming soon." }}>
    <p>Host-owned profile placeholder</p>
  </SettingsLayout>);
  expect(html).toContain("Host-owned profile placeholder");
  expect(html).toContain("Settings on this device");
  expect(html).toContain('aria-label="About General"');
  expect(html).toContain("Accounts are coming soon.");
  expect(html).not.toContain(">Members<");
  expect(html).not.toContain(">API keys<");
  expect(html).not.toContain("Sam Rivera");
});
