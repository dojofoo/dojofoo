import type { Page } from "@playwright/test";
import { createAgentApi } from "@dojofoo/agent-api";
import { FakeEve, fakeRuntime, turn } from "../../agent-api/src/fixtures";
import type { AuthoringDraft } from "@dojofoo/authoring/service";

export const workspaceId = "ws-1";
export const sessionId = "saved";
export const draft: AuthoringDraft = { root: "/tmp/agent-course", style: "katas", name: "Agent course", description: "A course", language: "TypeScript", manifestSource: "name: Agent course\n", courseGuidance: "", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Agent course\n" }], lessons: [], issues: [], courseChecks: [] };

export async function mountAgentChat(page: Page, options: { existingSession?: boolean; draft?: AuthoringDraft; root?: string; files?: boolean; workspaceId?: string; hold?: Promise<void>; failRead?: () => boolean; failRun?: () => boolean; failCancel?: () => boolean } = {}) {
  const id = options.workspaceId ?? workspaceId;
  const selectedDraft = options.draft ?? draft;
  const eve = new FakeEve((message, id) => turn(id, typeof message === "string" ? message : "Attached notes", ["I received your notes."]));
  const runtime = fakeRuntime(eve, id);
  if (options.existingSession !== false) {
    eve.histories.set(sessionId, turn("saved-turn", "Help with this course", ["Your saved guidance."]));
    runtime.records.push({ id: sessionId, agent: "codex", persona: "kyoshi", createdAt: "2026-10-28T00:00:00Z" });
  }
  const api = createAgentApi(runtime);
  const calls: string[] = [];
  if (options.files !== false) {
    await page.routeWebSocket("**/api/authoring/changes*", () => {});
    await page.route("**/api/authoring/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/backend")) return route.fulfill({ json: { backend: "eve" } });
      if (path.endsWith("/draft")) return route.fulfill({ json: selectedDraft });
      return route.fulfill({ status: 404 });
    });
  }
  await page.route("**/api/control/workspaces", route => route.fulfill({ json: [{ id, path: options.root ?? selectedDraft.root }] }));
  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push(`${request.method()} ${url.pathname}`);
    if (request.method() === "GET" && /\/sessions\/[^/]+$/.test(url.pathname) && options.failRead?.()) {
      return route.fulfill({ status: 503, json: { error: "temporarily_unavailable", message: "Conversation temporarily unavailable" } });
    }
    if (request.method() === "POST" && url.pathname.endsWith("/runs") && options.failRun?.()) {
      return route.fulfill({ status: 503, json: { error: "temporarily_unavailable", message: "Could not send this note" } });
    }
    if (request.method() === "PATCH" && options.failCancel?.()) {
      return route.fulfill({ status: 502, json: { error: "agent_unavailable", message: "Could not stop the conversation" } });
    }
    if (options.hold && request.method() === "POST" && url.pathname.endsWith("/runs")) await options.hold;
    const response = await api.handle(new Request(request.url(), {
      method: request.method(), headers: request.headers(), body: request.postData() ?? undefined,
    }));
    return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
  });
  return { eve, runtime, calls };
}
