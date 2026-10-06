import { expect, test, type WebSocketRoute } from "@playwright/test";

test("the running server exposes the workspace watcher over WebSocket", async ({ page }) => {
  await page.goto("/api/health");
  const notice = await page.evaluate(() => new Promise<string>((resolve, reject) => {
    const endpoint = new URL("/api/authoring/changes", location.href);
    endpoint.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(endpoint);
    const timeout = setTimeout(() => { socket.close(); reject(new Error("Watcher handshake timed out")); }, 10_000);
    socket.onmessage = event => {
      clearTimeout(timeout);
      socket.close();
      resolve(JSON.parse(event.data).method);
    };
    socket.onerror = () => { clearTimeout(timeout); reject(new Error("Watcher connection failed")); };
  }));
  expect(notice).toBe("workspace.changed");
});

test("workspace notifications refresh files without changing the session or overwriting an edit", async ({ page }) => {
  let socket!: WebSocketRoute;
  let connections = 0;
  let reads = 0;
  let content = "name: Watch course\n";
  let lessons: unknown[] = [];
  await page.routeWebSocket("**/api/authoring/changes*", ws => {
    socket = ws;
    if (++connections > 1) ws.send(JSON.stringify({ jsonrpc: "2.0", method: "workspace.changed", params: {} }));
  });
  await page.route("**/api/authoring/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
    if (path.endsWith("/draft")) {
      reads++;
      return route.fulfill({ json: {
        root: "/tmp/watch-fixture", style: "katas", name: "Watch course", description: "", language: "TypeScript",
        manifestSource: content, courseGuidance: "", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content }],
        lessons, issues: [], courseChecks: [],
      } });
    }
    return route.fulfill({ status: 404, json: { error: "Fixture conversation unavailable" } });
  });
  await page.goto("/authoring?session=watch-session");
  await expect(page.getByRole("tab", { name: /dojo.yaml/ })).toBeVisible();
  await expect.poll(() => Boolean(socket)).toBe(true);
  const before = reads;
  lessons = [{ id: "001-new", title: "New external lesson", files: [{ path: "src/001-new/SENSEI.md", label: "SENSEI.md", content: "# Teach" }], checks: [] }];
  socket.send(JSON.stringify({ jsonrpc: "2.0", method: "workspace.changed", params: {} }));
  await expect(page.getByText("New external lesson", { exact: true })).toBeVisible();
  expect(reads).toBeGreaterThan(before);
  await expect(page).toHaveURL(/session=watch-session/);
  const beforeReconnect = reads;
  socket.close();
  await expect.poll(() => connections).toBe(2);
  await expect.poll(() => reads).toBeGreaterThan(beforeReconnect);
  const editor = page.getByRole("textbox", { name: "Code editor" });
  await editor.focus();
  await page.keyboard.press("Meta+End");
  await page.keyboard.type("# unsaved");
  content = "name: Externally changed\n";
  socket.send(JSON.stringify({ jsonrpc: "2.0", method: "workspace.changed", params: {} }));
  await expect(page.getByText(/Your unsaved edits are preserved/)).toBeVisible();
  await expect(page.locator(".monaco-editor .view-lines")).toContainText("# unsaved");
  await expect(page.locator(".monaco-editor .view-lines")).not.toContainText("Externally changed");
  await expect(page).toHaveURL(/session=watch-session/);
});
