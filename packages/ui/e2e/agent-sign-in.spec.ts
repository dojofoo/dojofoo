import type { AgentAccess } from "@dojofoo/harness/api";
import { expect, test, workspaceId } from "./agent-chat.fixture";

test("an agent signed in to nothing signs in from the composer, then lists its models", async ({ page, mountAgentChat }) => {
  test.setTimeout(60_000);
  const keys: string[] = [];
  const access: AgentAccess = {
    providers: async () => [{ id: "openai", name: "OpenAI", auth: { apiKey: { name: "OpenAI API key", login: true } },
      status: keys.length ? { configured: true, source: "stored" } : { configured: false } }],
    login: async (_provider, _type, interaction) => { keys.push(await interaction.prompt({ type: "secret", message: "Enter your OpenAI API key" })); },
  };
  await mountAgentChat(page, { access: agent => agent === "codex" ? access : undefined });
  // Signed out, the agent lists no models
  await page.route("**/api/v1/**/agents/codex/models*", route => keys.length ? route.fallback()
    : route.fulfill({ status: 502, json: { error: "models_unavailable", message: "Not signed in" } }));
  await page.goto(`/authoring/${workspaceId}`);

  await page.getByRole("button", { name: "Sign in to Codex" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign in to Codex" });
  await dialog.getByRole("button", { name: "Enter OpenAI API key" }).click();
  await page.getByLabel("Enter your OpenAI API key").fill("sk-from-the-page");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Signed in.")).toBeVisible({ timeout: 10_000 });
  expect(keys).toEqual(["sk-from-the-page"]);
  await page.getByRole("button", { name: "Done" }).click();

  // Signed in, the composer reads the models again and offers more sign-ins from the model menu
  await page.getByRole("button", { name: /^Model:/ }).click();
  await expect(page.getByRole("option", { name: "Fixture model" })).toBeVisible();
  await page.getByRole("button", { name: "Sign in…" }).click();
  await expect(page.getByRole("dialog", { name: "Sign in to Codex" }).getByRole("listitem")).toContainText("Signed in");
});
