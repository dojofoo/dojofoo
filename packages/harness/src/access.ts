import type * as Pi from "@earendil-works/pi-ai";
import type { AuthInteraction, AuthType } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { resolveAgentExecutable } from "@dojofoo/config/agent-installations";
import type * as Protocol from "@dojofoo/protocol";
import type { AccessProvider, AgentId, AuthStatus } from "@dojofoo/protocol";
import { homedir } from "node:os";
import { join } from "node:path";
import { codexAppServer } from "./models.js";

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
