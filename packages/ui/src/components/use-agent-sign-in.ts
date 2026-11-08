import type { AccessProvider, AuthType, LoginState } from "@dojofoo/protocol";
import { useEffect, useRef, useState } from "react";
import { chatApiError } from "@/lib/chat-failure";
import { launchFetch } from "@/lib/launch-token";

const agentApi = (workspaceId: string, path: string) => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}${path}`;

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await launchFetch(url, init);
  if (!response.ok) throw await chatApiError(response);
  return response.json() as Promise<T>;
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * The coding agent's sign-in (the harness's agentAccess, through /agents/{id}/providers and /logins): its providers, and a sign-in
 * that the dialog shows while it runs, polled once a second. `onSignedIn` runs when one succeeds, so the models can be read again.
 */
export function useAgentSignIn(workspaceId: string, agent: string, onSignedIn: () => void) {
  const [providers, setProviders] = useState<AccessProvider[]>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState(false);
  // The provider whose login lapsed, when the sign-in opened from its model
  const [provider, setProvider] = useState<string>();
  const [login, setLogin] = useState<LoginState>();
  const [revision, setRevision] = useState(0);
  const signedIn = useRef(onSignedIn);
  signedIn.current = onSignedIn;

  useEffect(() => {
    const controller = new AbortController();
    setError(undefined);
    void fetch(agentApi(workspaceId, `/agents/${encodeURIComponent(agent)}/providers?per_page=500`), { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw await chatApiError(response);
        return (await response.json() as { data: AccessProvider[] }).data;
      })
      .then(setProviders, cause => { if (!controller.signal.aborted) { setProviders([]); setError(message(cause)); } });
    return () => controller.abort();
  }, [workspaceId, agent, revision]);

  const running = login?.status === "running" ? login.id : undefined;
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      void call<LoginState>(agentApi(workspaceId, `/logins/${encodeURIComponent(running)}`)).then(next => {
        setLogin(next);
        if (next.status === "succeeded") {
          setRevision(value => value + 1);
          signedIn.current();
        }
      }, cause => setLogin(current => current && { ...current, status: "failed", error: message(cause) }));
    }, 1000);
    return () => clearInterval(timer);
  }, [workspaceId, running]);

  const send = (path: string, init: RequestInit) => call<LoginState>(agentApi(workspaceId, path), init).then(setLogin,
    cause => setLogin(current => ({ ...(current ?? { id: "", agent: agent as LoginState["agent"], provider: "", type: "oauth", events: [] }),
      status: "failed", error: message(cause) })));
  const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

  return {
    /** Dojo can sign this agent in: it has providers */
    available: Boolean(providers?.length),
    /** Signed in to none of its providers */
    needed: Boolean(providers?.length) && !providers!.some(provider => provider.status.configured),
    show: (lapsed?: string) => { setProvider(lapsed); setOpen(true); },
    dialog: {
      open, onOpenChange: setOpen, ...(provider ? { provider } : {}), providers: providers ?? [], loading: providers === undefined, ...(error ? { error } : {}),
      ...(login ? { login } : {}),
      onStart: (provider: string, type: AuthType) => { void send(`/agents/${encodeURIComponent(agent)}/logins`, json({ provider, type })); },
      onAnswer: (prompt: string, value: string) => { if (login) void send(`/logins/${encodeURIComponent(login.id)}/answer`, json({ prompt, value })); },
      onCancel: () => { if (login?.status === "running") void send(`/logins/${encodeURIComponent(login.id)}`, { method: "DELETE" }); },
    },
  };
}
