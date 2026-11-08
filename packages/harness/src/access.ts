import type * as Pi from "@earendil-works/pi-ai";
import type { AuthInteraction, AuthType } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { resolveAgentExecutable } from "@dojofoo/config/agent-installations";
import type * as Protocol from "@dojofoo/protocol";
import type { AccessProvider, AgentId, AuthStatus } from "@dojofoo/protocol";
import { homedir } from "node:os";
import { join } from "node:path";
import { codexAppServer, openCodeServer } from "./models.js";

// Protocol's sign-in types are Pi's own in their JSON form (read-only lists as plain arrays, no signal): the build fails here when
// a Pi update changes them
type Writable<T> = T extends readonly (infer Item)[] ? Writable<Item>[] : T extends object ? { -readonly [Key in keyof T]: Writable<T[Key]> } : T;
type WithoutSignal<T> = T extends unknown ? Omit<T, "signal"> : never;
type Same<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
export type ProtocolMatchesPi = [
  Same<Protocol.AuthType, Pi.AuthType>,
  Same<Protocol.AuthEvent, Writable<Pi.AuthEvent>>,
  Same<Protocol.AuthPrompt, Writable<WithoutSignal<Pi.AuthPrompt>>>,
  Same<Protocol.AuthStatus, ReturnType<ModelRuntime["getProviderAuthStatus"]>>,
] extends true[] ? true : never;
const protocolMatchesPi: ProtocolMatchesPi = true;
void protocolMatchesPi;

/**
 * A coding agent's sign-in, in Pi's terms: the providers it can sign in to (Pi's `ModelRuntime.getProviders` with
 * `getProviderAuthStatus`) and a login that talks to the user through Pi's `AuthInteraction` (`ModelRuntime.login`).
 * Each agent saves the login where it keeps its own, so the agent itself renews it.
 */
export interface AgentAccess {
  providers(signal: AbortSignal): Promise<AccessProvider[]>;
  /** Resolves once the agent has saved the login; rejects when it fails or `interaction.signal` aborts it */
  login(providerId: string, type: AuthType, interaction: AuthInteraction): Promise<void>;
}

/** The agent's sign-in, or undefined while dojo can't sign in to it (its CLI's own login stays the way in) */
export function agentAccess(agent: AgentId, environment: NodeJS.ProcessEnv = process.env): AgentAccess | undefined {
  if (agent === "pi") return piAccess(environment.PI_CODING_AGENT_DIR ?? join(environment.HOME ?? homedir(), ".pi", "agent"));
  if (agent === "codex") return codexAccess();
  if (agent === "opencode") return openCodeAccess();
  return undefined;
}

/** Pi's own model runtime over the user's agent folder: its file store locks auth.json, as when Pi runs itself */
export function piAccess(agentDir: string): AgentAccess {
  const runtime = async (signal?: AbortSignal) => {
    const { ModelRuntime } = await import("@earendil-works/pi-coding-agent");
    const created = await ModelRuntime.create({ authPath: join(agentDir, "auth.json"), modelsPath: join(agentDir, "models.json"),
      allowModelNetwork: false, ...(signal ? { signal } : {}) });
    if (created.getError()) throw new Error(created.getError());
    return created;
  };
  return {
    async providers(signal) {
      const pi = await runtime(signal);
      return pi.getProviders().map(provider => {
        const { apiKey, oauth } = provider.auth;
        return {
          id: provider.id, name: provider.name,
          auth: {
            ...(apiKey ? { apiKey: { name: apiKey.name, login: Boolean(apiKey.login) } } : {}),
            ...(oauth ? { oauth: { name: oauth.name, ...(oauth.loginLabel ? { loginLabel: oauth.loginLabel } : {}),
              ...(oauth.isSubscription !== undefined ? { isSubscription: oauth.isSubscription } : {}) } } : {}),
          },
          status: pi.getProviderAuthStatus(provider.id),
        };
      });
    },
    async login(providerId, type, interaction) {
      await (await runtime(interaction.signal)).login(providerId, type, interaction);
    },
  };
}

type CodexAccount = { type: "apiKey" } | { type: "chatgpt"; planType?: string } | { type: "amazonBedrock" } | { type: "gcp" };
const codexAccountLabels: Record<CodexAccount["type"], string> = { apiKey: "API key", chatgpt: "ChatGPT", amazonBedrock: "Amazon Bedrock", gcp: "Google Cloud" };

/** Codex's own login through its app-server (`account/read`, `account/login/start`), saved in the user's CODEX_HOME */
export function codexAccess(executable = resolveAgentExecutable("codex") ?? "codex", args?: string[]): AgentAccess {
  const open = (signal: AbortSignal, what: string) => codexAppServer(signal, what, executable, args);
  return {
    async providers(signal) {
      const server = await open(signal, "Reading the Codex sign-in");
      try {
        const { account, requiresOpenaiAuth } = await server.request("account/read", {}) as { account?: CodexAccount | null; requiresOpenaiAuth?: boolean };
        const status: AuthStatus = account ? { configured: true, source: "stored", label: codexAccountLabels[account.type] ?? account.type }
          // A provider of the user's own config needs no OpenAI sign-in
          : requiresOpenaiAuth === false ? { configured: true, source: "fallback" } : { configured: false };
        return [{ id: "openai", name: "OpenAI", auth: { oauth: { name: "ChatGPT", loginLabel: "Sign in with ChatGPT", isSubscription: true },
          apiKey: { name: "OpenAI API key", login: true } }, status }];
      } finally {
        server.close();
      }
    },
    async login(providerId, type, interaction) {
      if (providerId !== "openai") throw new Error(`Codex has no provider ${providerId}.`);
      const signal = interaction.signal ?? new AbortController().signal;
      if (type === "api_key") {
        const apiKey = await interaction.prompt({ type: "secret", message: "Enter your OpenAI API key", placeholder: "sk-…" });
        const server = await open(signal, "Signing in to Codex");
        try { await server.request("account/login/start", { type: "apiKey", apiKey }); } finally { server.close(); }
        return;
      }
      const server = await open(signal, "Signing in to Codex");
      try {
        // Codex serves the browser's callback itself and reports the outcome as a notification. The signal ends the app-server,
        // and its login server with it.
        type Completion = { loginId?: string | null; success: boolean; error?: string | null };
        let loginId: string | undefined;
        const completed = new Promise<Completion>(resolve => server.onNotification((method, params) => {
          const completion = params as Completion;
          if (method === "account/login/completed" && (completion.loginId == null || completion.loginId === loginId)) resolve(completion);
        }));
        const started = await server.request("account/login/start", { type: "chatgpt" }) as { authUrl?: unknown; loginId?: unknown };
        if (typeof started.authUrl !== "string" || typeof started.loginId !== "string") throw new Error("Codex returned an invalid sign-in");
        loginId = started.loginId;
        interaction.notify({ type: "auth_url", url: started.authUrl, instructions: "Sign in with ChatGPT in the page that opens. Codex saves the sign-in when the page is done." });
        // Handled here: the app-server also ends after a successful sign-in, when it is closed
        const ended = server.ended.then(error => { throw error; });
        ended.catch(() => {});
        const outcome = await Promise.race([completed, ended]);
        if (!outcome.success) throw new Error(outcome.error || "Codex could not finish the sign-in.");
      } finally {
        server.close();
      }
    },
  };
}

type OpenCodeCondition = { key: string; op: "eq" | "neq"; value: string };
type OpenCodePrompt = { type: "text"; key: string; message: string; placeholder?: string; when?: OpenCodeCondition }
  | { type: "select"; key: string; message: string; options: { label: string; value: string; hint?: string }[]; when?: OpenCodeCondition };
type OpenCodeMethod = { type: "oauth" | "api"; label: string; prompts?: OpenCodePrompt[] };
/** One of OpenCode's providers (`GET /provider`): `source` "env" when a variable named in `env` signs it in, "api" for a saved login */
type OpenCodeProvider = { id: string; name: string; source?: string; env?: string[] };
type OpenCodeCall = <R>(path: string, init?: RequestInit) => Promise<R>;

/**
 * OpenCode's own login through Sensei's OpenCode server (`GET /provider`, `/provider/auth`, `/provider/{id}/oauth/*`, `PUT /auth/{id}`),
 * saved in the user's OpenCode data folder, which Sensei's OpenCode reads. Any provider takes an API key; the ones with sign-in methods
 * of their own (ChatGPT, GitHub Copilot, …) sign in in the browser, after the method's questions.
 */
export function openCodeAccess(options: { executable?: string; environment?: NodeJS.ProcessEnv } = {}): AgentAccess {
  const serve = async <T>(signal: AbortSignal, use: (call: OpenCodeCall) => Promise<T>) => {
    // Boxed: undefined means OpenCode exited before it served, not that `use` returned nothing
    const served = await openCodeServer(signal, async base => ({ value: await use(async <R>(path: string, init?: RequestInit) => {
      const response = await fetch(`${base}${path}`, { ...init, signal, headers: { "content-type": "application/json" } });
      const body = await response.json().catch(() => undefined) as { data?: { message?: unknown }; message?: unknown } | undefined;
      if (!response.ok) {
        throw new Error(typeof body?.data?.message === "string" ? body.data.message : typeof body?.message === "string" ? body.message
          : `OpenCode answered ${response.status}`);
      }
      return body as R;
    }) }), options);
    if (served === undefined) throw new Error("OpenCode exited before it could sign in.");
    return served.value;
  };
  const methodsOf = (call: OpenCodeCall) => call<Record<string, OpenCodeMethod[]>>("/provider/auth");
  // A key with further questions (an account or resource id) is saved by OpenCode's own CLI only
  const keyLogin = (methods: OpenCodeMethod[]) => methods.length === 0 || methods.some(method => method.type === "api" && !method.prompts?.length);

  return {
    providers: signal => serve(signal, async call => {
      const [catalog, methods] = await Promise.all([call<{ all: OpenCodeProvider[]; connected: string[] }>("/provider"), methodsOf(call)]);
      return catalog.all.map(provider => {
        const own = methods[provider.id] ?? [];
        const browser = own.filter(method => method.type === "oauth");
        const variable = provider.source === "env" ? provider.env?.[0] : undefined;
        const status: AuthStatus = !catalog.connected.includes(provider.id) ? { configured: false }
          : provider.source === "env" ? { configured: true, source: "environment", ...(variable ? { label: variable } : {}) }
            : provider.source === "api" ? { configured: true, source: "stored" } : { configured: true, source: "fallback" };
        return { id: provider.id, name: provider.name, auth: {
          apiKey: { name: `${provider.name} API key`, login: keyLogin(own) },
          ...(browser.length ? { oauth: { name: provider.name, loginLabel: browser.length === 1 ? browser[0]!.label : `Sign in to ${provider.name}` } } : {}),
        }, status };
      });
    }),
    async login(providerId, type, interaction) {
      const signal = interaction.signal ?? new AbortController().signal;
      await serve(signal, async call => {
        const methods = (await methodsOf(call))[providerId] ?? [];
        const path = encodeURIComponent(providerId);
        if (type === "api_key") {
          if (!keyLogin(methods)) throw new Error("This provider's key needs OpenCode's own CLI: run opencode auth login.");
          const key = await interaction.prompt({ type: "secret", message: "Enter your API key" });
          await call(`/auth/${path}`, { method: "PUT", body: JSON.stringify({ type: "api", key }) });
          return;
        }
        const browser = methods.flatMap((method, index) => method.type === "oauth" ? [{ method, index }] : []);
        if (!browser.length) throw new Error("This provider has no browser sign-in in OpenCode.");
        const picked = browser.length === 1 ? String(browser[0]!.index) : await interaction.prompt({ type: "select", message: "How do you want to sign in?",
          options: browser.map(({ method, index }) => ({ id: String(index), label: method.label })) });
        const chosen = browser.find(({ index }) => String(index) === picked);
        if (!chosen) throw new Error("OpenCode has no such sign-in.");
        // The method's own questions, each asked only while its condition on an earlier answer holds
        const inputs: Record<string, string> = {};
        for (const prompt of chosen.method.prompts ?? []) {
          if (prompt.when && (inputs[prompt.when.key] === prompt.when.value) !== (prompt.when.op === "eq")) continue;
          inputs[prompt.key] = prompt.type === "select"
            ? await interaction.prompt({ type: "select", message: prompt.message,
              options: prompt.options.map(option => ({ id: option.value, label: option.label, ...(option.hint ? { description: option.hint } : {}) })) })
            : await interaction.prompt({ type: "text", message: prompt.message, ...(prompt.placeholder ? { placeholder: prompt.placeholder } : {}) });
        }
        const authorization = await call<{ url: string; method: "auto" | "code"; instructions?: string }>(`/provider/${path}/oauth/authorize`,
          { method: "POST", body: JSON.stringify({ method: chosen.index, inputs }) });
        interaction.notify({ type: "auth_url", url: authorization.url, ...(authorization.instructions ? { instructions: authorization.instructions } : {}) });
        // "auto": OpenCode waits for the browser itself; "code": the page shows a code to paste back
        const code = authorization.method === "code" ? await interaction.prompt({ type: "manual_code", message: "Paste the code the page shows" }) : undefined;
        const done = await call<boolean>(`/provider/${path}/oauth/callback`, { method: "POST", body: JSON.stringify({ method: chosen.index, ...(code ? { code } : {}) }) });
        if (done !== true) throw new Error("OpenCode could not finish the sign-in.");
      });
    },
  };
}
