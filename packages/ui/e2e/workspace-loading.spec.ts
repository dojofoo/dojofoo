import { expect, test } from "@playwright/test";
import { mountAgentChat } from "./agent-chat.fixture";
import { turn } from "../../agent-api/src/fixtures";

test.setTimeout(60_000);

test("authoring opens its files before backend detection and retains edits when the agent connects", async ({ page }) => {
  const backend = Promise.withResolvers<void>();
  const writes: string[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/teaching/preview") return route.fulfill({ json: { blocks: [{ type: "html", html: "<p>One outcome</p>" }] } });
    if (route.request().method() !== "GET") writes.push(path);
    if (path.endsWith("/backend")) { await backend.promise; return route.fulfill({ json: { backend: "eve" } }); }
    if (path.endsWith("/draft")) {
      return route.fulfill({ json: { root: "/tmp/fast-files", style: "katas", name: "Fast files", description: "One outcome", language: "TypeScript",
        manifestSource: "name: Fast files\n", courseGuidance: "", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Fast files\n" }], lessons: [], issues: [], courseChecks: [] } });
    }
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" }, messages: [] } });
    return route.fulfill({ status: 404 });
  });
  await mountAgentChat(page, { root: "/tmp/fast-files", files: false });
  try {
    await page.goto("/authoring?session=saved");
    await expect(page.getByRole("region", { name: "Course editor", exact: true })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible();
    await expect(page.getByText("Thinking", { exact: true })).toHaveCount(0);
    const input = page.getByRole("textbox", { name: "Code editor", exact: true });
    await input.focus();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.insertText("# Keep this local edit");
    backend.resolve();
    await expect(page.getByTestId("authoring-chat-composer").getByRole("textbox")).toBeEnabled();
    await expect(page.locator(".view-lines")).toContainText("Keep this local edit");
    expect(writes).toEqual([]);
  } finally { backend.resolve(); }
});

test("saved authoring guidance opens before course files and backend detection", async ({ page }) => {
  const files = Promise.withResolvers<void>();
  await page.routeWebSocket("**/api/authoring/changes*", () => {});
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/sessions/saved")) return route.fulfill({ json: { session: { sessionId: "saved" },
      messages: [{ id: "guidance", role: "assistant", parts: [{ type: "text", content: "Your saved authoring guidance" }] }] } });
    if (path.endsWith("/backend")) { await files.promise; return route.fulfill({ json: { backend: "eve" } }); }
    if (path.endsWith("/draft")) { await files.promise; return route.fulfill({ json: {
      root: "/tmp/fast-files", style: "katas", name: "Fast files", description: "One outcome", language: "TypeScript",
      rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Fast files\n" }], lessons: [], issues: [], courseChecks: [],
    } }); }
    return route.fulfill({ status: 404 });
  });
  const agent = await mountAgentChat(page, { root: "/tmp/fast-files", files: false });
  agent.eve.histories.set("saved", turn("prior", "My course question", ["Your saved authoring guidance"]));
  try {
    await page.goto("/authoring?workspace=ws-1&session=saved");
    await expect(page.getByText("Your saved authoring guidance", { exact: true })).toBeVisible({ timeout: 5000 });
    const question = page.getByTestId("authoring-chat-composer").getByRole("textbox");
    await question.fill("Keep my question while files open");
    files.resolve();
    await expect(page.getByRole("tab", { name: "dojo.yaml", exact: true })).toBeVisible();
    await expect(question).toHaveValue("Keep my question while files open");
    await expect(page.getByText("Your saved authoring guidance", { exact: true })).toBeVisible();
  } finally { files.resolve(); }
});
