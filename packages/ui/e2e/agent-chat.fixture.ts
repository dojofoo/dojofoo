import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { test as base, type Page } from "@playwright/test";
import { createAgentApi, LAUNCH_TOKEN_HEADER, launchGuard, type Persona, type SessionRecord } from "@dojofoo/agent-api";
import { Client, type MessageContent } from "@dojofoo/agent/client";
import type { AgentId } from "@dojofoo/protocol";
import { startEve, testLaunchToken, testRuntime } from "../../agent-api/src/fixtures";
import type { AuthoringDraft } from "@dojofoo/authoring/service";

export const workspaceId = "ws-1";
/** The saved conversation's first message; the fixture agent replies `Echo: <message>` */
export const savedMessage = "Help with this course";
export const savedReply = `Echo: ${savedMessage}`;
/** The first reply of a conversation the page starts: the fixture runtime greets kyoshi */
export const greetingReply = "Echo: Hello kyoshi";
export const draft: AuthoringDraft = { root: "/tmp/agent-course", style: "katas", name: "Agent course", description: "A course", language: "TypeScript", manifestSource: "name: Agent course\n", courseGuidance: "", rootFiles: [{ path: "dojo.yaml", label: "dojo.yaml", content: "name: Agent course\n" }], lessons: [], issues: [], courseChecks: [] };

type Eve = Awaited<ReturnType<typeof startEve>>;
export interface MountOptions {
  /** Start with a saved kyoshi conversation (default); a string is its first message */
  existingSession?: boolean | string;
  draft?: AuthoringDraft;
  root?: string;
  files?: boolean;
  workspaceId?: string;
  /** Holds the browser's messages to the conversation until it resolves */
  hold?: Promise<void>;
  failRead?: () => boolean;
  failRun?: () => boolean;
  failCancel?: () => boolean;
  /** The fixture workspace's persona (Kyoshi, a draft) */
  persona?: Persona;
  /** The workspace's selected coding agent (Codex) */
  agent?: AgentId;
  /** The tokens `GET /api/control/launch-token` serves in order (repeating the last), and the one select accepts */
  launch?: { served: string[]; accepted: string };
}
export interface MountedAgentChat {
  runtime: ReturnType<typeof testRuntime>;
  /** `METHOD /path` of every `/api/v1` request the page made */
  calls: string[];
  /** Bodies the page posted to its session's Eve message route (messages and answers) */
  sent: Array<{ sessionId: string; body: Record<string, unknown> }>;
  /** Sessions the page asked to cancel */
  cancelled: string[];
  /** The saved conversation's id, when `existingSession` isn't false */
  sessionId: string;
  /** Every select request, with the launch token it carried */
  selects: Array<{ agentId: string; token: string | null }>;
  /** Tokens served to the page, in order */
  tokenReads: string[];
}

const sessionRoute = /\/sessions\/([^/]+)\/eve\/v1\/session\/[^/]+(\/[a-z]+)?$/u;

/** Serves the agent API over HTTP so Eve's long-lived NDJSON stream reaches the browser as it streams. */
async function serve(handle: (request: Request) => Promise<Response>): Promise<Server> {
  const server = createServer(async (incoming, outgoing) => {
    const controller = new AbortController();
    outgoing.on("close", () => controller.abort());
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(chunk as Buffer);
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (typeof value === "string") headers.set(name, value);
      const response = await handle(new Request(`http://127.0.0.1${incoming.url}`, {
        method: incoming.method, headers, signal: controller.signal,
        ...(incoming.method === "GET" || incoming.method === "HEAD" ? {} : { body: Buffer.concat(chunks) }),
      }));
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      if (response.body) for await (const chunk of response.body) outgoing.write(chunk);
      outgoing.end();
    } catch {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  return server;
}

/** Starts a saved kyoshi conversation on the Eve host once its first turn has finished (or asks). */
export async function startConversation(eve: Eve, runtime: ReturnType<typeof testRuntime>, message: MessageContent, agent = "codex"): Promise<SessionRecord> {
  const { session, delivery } = await new Client({ baseUrl: eve.baseUrl }).sessions.create({ message });
  await delivery.result();
  const record: SessionRecord = { id: session.state.sessionId, agent, persona: "kyoshi", createdAt: "2026-10-28T00:00:00Z" };
  runtime.records.push(record);
  return record;
}

async function mount(page: Page, eve: Eve, servers: Server[], baseURL: string, options: MountOptions = {}): Promise<MountedAgentChat> {
  const id = options.workspaceId ?? workspaceId;
  const selectedDraft = options.draft ?? draft;
  const runtime = testRuntime(eve, id, { persona: options.persona, agent: options.agent });
  const saved = options.existingSession === false ? undefined
    : await startConversation(eve, runtime, typeof options.existingSession === "string" ? options.existingSession : savedMessage, options.agent);
  const launch = options.launch ?? { served: [testLaunchToken], accepted: testLaunchToken };
  // The page's own origin, as the UI server checks it
  const api = createAgentApi(runtime, { authorize: launchGuard({ token: () => launch.accepted, origin: () => new URL(baseURL).origin }) });
  const server = await serve(request => api.handle(request));
  servers.push(server);
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const calls: string[] = [];
  const sent: MountedAgentChat["sent"] = [];
  const cancelled: string[] = [];
  const selects: MountedAgentChat["selects"] = [];
  const tokenReads: string[] = [];
  await page.route("**/api/control/launch-token", route => {
    const token = launch.served[Math.min(tokenReads.length, launch.served.length - 1)]!;
    tokenReads.push(token);
    return route.fulfill({ json: { token }, headers: { "cache-control": "no-store" } });
  });
  if (options.files !== false) {
    await page.routeWebSocket("**/api/authoring/changes*", () => {});
    await page.route("**/api/authoring/**", route => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/draft")) return route.fulfill({ json: selectedDraft });
      return route.fulfill({ status: 404 });
    });
  }
  await page.route("**/api/control/workspaces", route => route.fulfill({ json: [{ id, path: options.root ?? selectedDraft.root }] }));
  await page.route("**/api/v1/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    calls.push(`${request.method()} ${url.pathname}`);
    const select = request.method() === "POST" ? /\/agents\/([^/]+)\/select$/u.exec(url.pathname) : null;
    if (select) selects.push({ agentId: decodeURIComponent(select[1]!), token: await request.headerValue(LAUNCH_TOKEN_HEADER) });
    const eveRoute = request.method() === "POST" ? sessionRoute.exec(url.pathname) : null;
    if (request.method() === "GET" && /\/sessions\/[^/]+$/u.test(url.pathname) && options.failRead?.()) {
      return route.fulfill({ status: 503, json: { error: "temporarily_unavailable", message: "Conversation temporarily unavailable" } });
    }
    if (eveRoute && !eveRoute[2]) {
      // Failures on the session's Eve routes come in Eve's own error shape, which its client reads
      if (options.failRun?.()) return route.fulfill({ status: 503, json: { error: "Could not send this note", code: "temporarily_unavailable" } });
      sent.push({ sessionId: decodeURIComponent(eveRoute[1]!), body: request.postDataJSON() });
      if (options.hold) await options.hold;
    }
    if (eveRoute?.[2] === "/cancel") {
      if (options.failCancel?.()) return route.fulfill({ status: 502, json: { error: "Could not stop the conversation", code: "agent_unavailable" } });
      cancelled.push(decodeURIComponent(eveRoute[1]!));
    }
    return route.continue({ url: `${origin}${url.pathname}${url.search}` });
  });
  return { runtime, calls, sent, cancelled, sessionId: saved?.id ?? "", selects, tokenReads };
}

/**
 * `eve` is a real Eve host running the fixture agent (`packages/agent-api/test/eve`), one per
 * worker; `mountAgentChat` serves a fresh agent API on it for the test's page.
 */
/** A finished local setup, so pages open past onboarding whatever the server's DOJOFOO_HOME holds. A spec's own
 * catch-all `/api/**` route passes `/api/local/setup` on with `route.fallback()`. */
export const localSetup = { completed: true, workspace: "/tmp/dojo-workspace", agents: ["codex"], agent: "codex", user: { name: "Anonymous" } };

export const test = base.extend<{ mountAgentChat: (page: Page, options?: MountOptions) => Promise<MountedAgentChat>; localSetup: void }, { eve: Eve }>({
  localSetup: [async ({ page }, use) => {
    await page.route("**/api/local/setup", route => route.fulfill({ json: localSetup }));
    await use();
  }, { auto: true }],
  eve: [async ({}, use) => {
    const eve = await startEve();
    await use(eve);
    await eve.close();
  }, { scope: "worker", timeout: 120_000 }],
  mountAgentChat: async ({ eve, page, baseURL }, use) => {
    // The page aborts superseded previews; on the dev server an aborted POST raises Vite's error
    // overlay over the page. Registered first, so a spec's own preview route still wins.
    await page.route("**/api/teaching/preview", route => route.fulfill({ json: { blocks: [] } }));
    const servers: Server[] = [];
    await use((page, options) => mount(page, eve, servers, baseURL!, options));
    for (const server of servers) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  },
});
export { expect } from "@playwright/test";
