import type { AgentAccess } from "@dojofoo/harness/api";
import { expect, test, workspaceId } from "./agent-chat.fixture";

test("an agent signed in to nothing signs in from the composer in the browser, then lists its models", async ({ page, mountAgentChat }) => {
  test.setTimeout(60_000);
  let signedIn = false;
  let finish = () => {};
  const access: AgentAccess = {
    providers: async () => [{ id: "openai", name: "OpenAI", auth: { oauth: { name: "ChatGPT", loginLabel: "Sign in with ChatGPT" } },
      status: signedIn ? { configured: true, source: "stored" } : { configured: false } }],
    login: async (_provider, _type, interaction) => {
      interaction.notify({ type: "auth_url", url: "https://auth.example/authorize", instructions: "Sign in with ChatGPT in the page that opens." });
      await new Promise<void>(resolve => { finish = resolve; });
      signedIn = true;
    },
  };
  await mountAgentChat(page, { access: agent => agent === "codex" ? access : undefined });
  // Signed out, the agent lists no models
  await page.route("**/api/v1/**/agents/codex/models*", route => signedIn ? route.fallback()
    : route.fulfill({ status: 502, json: { error: "models_unavailable", message: "Not signed in" } }));
  await page.goto(`/authoring/${workspaceId}`);

  await page.getByRole("button", { name: "Sign in to Codex" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign in to Codex" });
  await dialog.getByRole("button", { name: "Sign in with ChatGPT" }).click();
  await expect(page.getByRole("link", { name: "Open the sign-in page" })).toHaveAttribute("href", "https://auth.example/authorize");
  finish();
  await expect(page.getByText("Signed in.")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Done" }).click();

  // Signed in, the composer reads the models again; the menu offers no sign-in while the agent can run
  await page.getByRole("button", { name: /^Model:/ }).click();
  await expect(page.getByRole("option", { name: "Fixture model" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sign in/ })).toHaveCount(0);
});
