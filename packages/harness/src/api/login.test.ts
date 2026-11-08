import type { AuthInteraction } from "@earendil-works/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { createAgentApi } from "./app";
import { testLaunchToken, testRuntime } from "./fixtures";
import { LAUNCH_TOKEN_HEADER, launchGuard } from "./launch";
import type { AccessProvider, AgentAccess, LoginState } from "./runtime";

const base = "http://local/api/v1/workspaces/ws-1";
const token = { [LAUNCH_TOKEN_HEADER]: testLaunchToken };
const provider: AccessProvider = { id: "acme", name: "Acme", auth: { apiKey: { name: "Acme API key", login: true }, oauth: { name: "Acme account" } },
  status: { configured: false } };

/** An agent whose Acme sign-in asks for a key, or shows a page and waits for `finish` (or its signal) */
function fakeAccess() {
  const keys: string[] = [];
  let finish: (outcome: Error | undefined) => void = () => {};
  const access: AgentAccess = {
    providers: async () => [{ ...provider, status: keys.length ? { configured: true, source: "stored" } : { configured: false } }],
    async login(_provider, type, interaction: AuthInteraction) {
      if (type === "api_key") {
        keys.push(await interaction.prompt({ type: "secret", message: "Enter your Acme API key" }));
        return;
      }
      interaction.notify({ type: "auth_url", url: "https://acme.example/authorize?state=1", instructions: "Sign in to Acme" });
      const outcome = await new Promise<Error | undefined>((resolve, reject) => {
        finish = resolve;
        interaction.signal?.addEventListener("abort", () => reject(interaction.signal?.reason), { once: true });
      });
      if (outcome) throw outcome;
    },
  };
  return { access, keys, finish: (outcome?: Error) => finish(outcome) };
}

function setup(access: AgentAccess | undefined = fakeAccess().access) {
  const runtime = testRuntime({ baseUrl: "http://eve.invalid" }, "ws-1", { access: agent => agent === "pi" ? access : undefined });
  const app = createAgentApi(runtime, { authorize: launchGuard({ token: () => testLaunchToken, origin: () => "http://local" }) });
  const json = async (path: string, method = "GET", body?: unknown, headers: Record<string, string> = token) => {
    const response = await app.handle(new Request(`${base}${path}`, {
      method, headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    return { status: response.status, body: await response.json() };
  };
  const settled = async (id: string) => {
    let state: LoginState | undefined;
    await vi.waitFor(async () => {
      state = (await json(`/logins/${id}`)).body;
      expect(state?.status).not.toBe("running");
    });
    return state!;
  };
  return { json, settled };
}

describe("signing a coding agent in", () => {
  it("lists the agent's providers, and none for an agent dojo can't sign in to", async () => {
    const { json } = setup();
    expect(await json("/agents/pi/providers")).toEqual({ status: 200, body: { data: [provider], pagination: { page: 0, perPage: 100, total: 1, hasMore: false } } });
    expect((await json("/agents/claude/providers")).body.data).toEqual([]);
    expect((await json("/agents/nope/providers")).body).toMatchObject({ error: "agent_not_found" });
  });

  it("asks for an API key, hands it to the agent and never shows it again", async () => {
    const fake = fakeAccess();
    const { json, settled } = setup(fake.access);
    const started = await json("/agents/pi/logins", "POST", { provider: "acme", type: "api_key" });
    expect(started.status).toBe(201);
    expect(started.body).toMatchObject({ agent: "pi", provider: "acme", type: "api_key", status: "running", events: [] });
    const prompt = await vi.waitFor(async () => {
      const state: LoginState = (await json(`/logins/${started.body.id}`)).body;
      expect(state.prompt).toMatchObject({ type: "secret", message: "Enter your Acme API key" });
      return state.prompt!;
    });
    expect((await json(`/logins/${started.body.id}/answer`, "POST", { prompt: prompt.id, value: "acme-secret" })).status).toBe(200);
    const ended = await settled(started.body.id);
    expect(ended).toMatchObject({ status: "succeeded" });
    expect(ended.prompt).toBeUndefined();
    expect(JSON.stringify(ended)).not.toContain("acme-secret");
    expect(fake.keys).toEqual(["acme-secret"]);
    expect((await json("/agents/pi/providers")).body.data[0].status).toEqual({ configured: true, source: "stored" });
  });

  it("shows the sign-in page and reports how the sign-in ended", async () => {
    const fake = fakeAccess();
    const { json, settled } = setup(fake.access);
    const started = (await json("/agents/pi/logins", "POST", { provider: "acme", type: "oauth" })).body;
    await vi.waitFor(async () => expect((await json(`/logins/${started.id}`)).body.events)
      .toEqual([{ type: "auth_url", url: "https://acme.example/authorize?state=1", instructions: "Sign in to Acme" }]));
    fake.finish(new Error("Acme refused the sign-in."));
    expect(await settled(started.id)).toMatchObject({ status: "failed", error: "Acme refused the sign-in." });
  });

  it("cancels a running sign-in", async () => {
    const { json } = setup();
    const started = (await json("/agents/pi/logins", "POST", { provider: "acme", type: "oauth" })).body;
    expect(await json(`/logins/${started.id}`, "DELETE")).toMatchObject({ status: 200, body: { status: "cancelled" } });
    expect((await json(`/logins/${started.id}`)).body).toMatchObject({ status: "cancelled" });
    expect((await json(`/logins/${started.id}`)).body.error).toBeUndefined();
  });

  it("needs the page's launch token for every sign-in route", async () => {
    const { json } = setup();
    expect((await json("/agents/pi/logins", "POST", { provider: "acme", type: "api_key" }, {})).status).toBe(403);
    const started = (await json("/agents/pi/logins", "POST", { provider: "acme", type: "api_key" })).body;
    expect((await json(`/logins/${started.id}`, "GET", undefined, {})).status).toBe(403);
    expect((await json(`/logins/${started.id}/answer`, "POST", { prompt: "any", value: "x" }, {})).status).toBe(403);
    expect((await json(`/logins/${started.id}`, "DELETE", undefined, {})).status).toBe(403);
  });

  it("refuses what the agent can't do and questions it isn't asking", async () => {
    const keyOnly: AgentAccess = { providers: async () => [{ ...provider, auth: { apiKey: { name: "Acme API key", login: true } } }], login: async () => {} };
    const { json } = setup(keyOnly);
    expect((await json("/agents/pi/logins", "POST", { provider: "acme", type: "oauth" })).body)
      .toEqual({ error: "login_unavailable", message: "Acme has no browser sign-in here." });
    expect((await json("/agents/pi/logins", "POST", { provider: "nobody", type: "api_key" })).body).toMatchObject({ error: "provider_not_found" });
    expect((await json("/agents/claude/logins", "POST", { provider: "acme", type: "api_key" })).body).toMatchObject({ error: "login_unavailable" });
    expect((await json("/logins/unknown")).body).toMatchObject({ error: "login_not_found" });

    const { json: other } = setup();
    const started = (await other("/agents/pi/logins", "POST", { provider: "acme", type: "api_key" })).body;
    expect((await other(`/logins/${started.id}/answer`, "POST", { prompt: "not-the-question", value: "x" })).body).toMatchObject({ error: "prompt_not_waiting" });
  });
});
