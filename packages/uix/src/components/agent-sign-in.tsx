import type { AccessProvider, AuthType, LoginState } from "@dojofoo/protocol";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, ButtonLink } from "./button";
import { Input } from "./input";

/*
 * Signing a coding agent in from the composer, when it can't run: signed in to nothing, or a provider's login lapsed. In Pi's terms:
 * the providers the agent signs in to in the browser (an account or subscription; keys stay in the agent's own setup), then the
 * sign-in as Pi's login interaction runs it – the page to open or the code to enter, the question it asks, and how it ended. The
 * agent saves the login where it keeps its own and renews it. A native modal dialog (focus trap, Esc, top layer), surface 5 with
 * shadow 5 like the command palette.
 */

export type AgentSignInProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: { name: string; icon?: ReactNode };
  providers: AccessProvider[];
  /** The providers are still being read */
  loading?: boolean;
  /** Why the providers couldn't be read */
  error?: string;
  /** The sign-in running or just ended */
  login?: LoginState;
  /** The only one listed: the provider whose login lapsed */
  provider?: string;
  onStart: (provider: string, type: AuthType) => void;
  onAnswer: (promptId: string, value: string) => void;
  onCancel: () => void;
};

/** A long list gets a search field, as the model menu does */
const SEARCH_FROM = 9;

const signedIn = (status: AccessProvider["status"]) =>
  !status.configured ? undefined
    : status.source === "environment" ? `Signed in with ${status.label ?? "an environment variable"}`
      : status.label ? `Signed in · ${status.label}` : "Signed in";

export function AgentSignIn({ open, onOpenChange, agent, providers, loading, error, login, provider: first, onStart, onAnswer, onCancel }: AgentSignInProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [query, setQuery] = useState("");
  // An ended sign-in stays on screen until the user goes back to the list
  const [dismissed, setDismissed] = useState<string>();

  useEffect(() => {
    const box = dialog.current;
    if (!box) return;
    if (open && !box.open) box.showModal();
    if (!open && box.open) box.close();
  }, [open]);

  const current = login && login.id !== dismissed && login.status !== "cancelled" ? login : undefined;
  const providerName = (id: string) => providers.find(item => item.id === id)?.name ?? id;
  const close = () => {
    if (current?.status === "running") onCancel();
    onOpenChange(false);
  };

  // Browser sign-ins only, signed-in ones first; just the lapsed provider when one is named
  const listed = providers.filter(item => item.auth.oauth && (!first || item.id === first))
    .sort((left, right) => Number(right.status.configured) - Number(left.status.configured));
  const shown = query.trim() ? listed.filter(item => `${item.name} ${item.id}`.toLowerCase().includes(query.trim().toLowerCase())) : listed;

  return (
    <dialog ref={dialog} className="ui-signin" aria-labelledby={titleId}
      onClose={() => open && close()}
      onClick={event => event.target === event.currentTarget && close()}>
      <style href="ui-agent-sign-in" precedence="default">{css}</style>
      <div className="ui-signin__head">
        {agent.icon && <span className="ui-signin__icon" aria-hidden="true">{agent.icon}</span>}
        <h2 id={titleId} className="ui-signin__title">
          {current ? `Sign in to ${providerName(current.provider)}` : `Sign in to ${agent.name}`}
        </h2>
      </div>

      {!current ? (
        <>
          <p className="ui-signin__lead">{agent.name} keeps the sign-in and renews it itself, as when you sign in from its own terminal.</p>
          {listed.length >= SEARCH_FROM && (
            <Input type="search" aria-label="Search providers" placeholder="Search providers" autoComplete="off" spellCheck={false}
              className="ui-signin__search" value={query} onChange={event => setQuery(event.target.value)} />
          )}
          {error ? <p role="alert" className="ui-signin__error">{error}</p>
            : loading ? <p className="ui-signin__muted" role="status">Reading {agent.name}'s accounts…</p>
              : (
                <ul className="ui-signin__list" aria-label="Providers">
                  {listed.length === 0 ? <li className="ui-signin__muted">{agent.name} signs in from its own terminal.</li>
                    : shown.length === 0 && <li className="ui-signin__muted">No provider matches “{query.trim()}”</li>}
                  {shown.map(item => {
                    const status = signedIn(item.status);
                    return (
                      <li key={item.id} className="ui-signin__row">
                        <span className="ui-signin__text">
                          <span className="ui-signin__name">{item.name}</span>
                          {status && <span className="ui-signin__status">{status}</span>}
                        </span>
                        <span className="ui-signin__actions">
                          {item.auth.oauth && (
                            <Button size="sm" variant="secondary" onClick={() => onStart(item.id, "oauth")}>
                              {item.auth.oauth.loginLabel ?? `Sign in with ${item.auth.oauth.name}`}
                            </Button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
          <div className="ui-signin__foot">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
          </div>
        </>
      ) : (
        <Running login={current} onAnswer={onAnswer} onCancel={onCancel}
          onBack={() => setDismissed(current.id)} onDone={() => { setDismissed(current.id); onOpenChange(false); }} />
      )}
    </dialog>
  );
}

function Running({ login, onAnswer, onCancel, onBack, onDone }: {
  login: LoginState; onAnswer: AgentSignInProps["onAnswer"]; onCancel: () => void; onBack: () => void; onDone: () => void;
}) {
  // Progress replaces itself: only the newest line shows
  const lastProgress = login.events.findLastIndex(event => event.type === "progress");
  const events = login.events.filter((event, index) => event.type !== "progress" || index === lastProgress);
  return (
    <>
      <div className="ui-signin__steps">
        {events.map((event, index) => {
          if (event.type === "auth_url") return (
            <div key={index} className="ui-signin__step">
              {event.instructions && <p>{event.instructions}</p>}
              <ButtonLink href={event.url} target="_blank" rel="noreferrer" variant={login.status === "running" ? "primary" : "secondary"}>
                Open the sign-in page
              </ButtonLink>
            </div>
          );
          if (event.type === "device_code") return (
            <div key={index} className="ui-signin__step">
              <p>Enter this code at <a href={event.verificationUri} target="_blank" rel="noreferrer">{new URL(event.verificationUri).host}</a>:</p>
              <output className="ui-signin__code" aria-label="Code">{event.userCode}</output>
            </div>
          );
          if (event.type === "info") return (
            <div key={index} className="ui-signin__step">
              <p>{event.message}</p>
              {event.links?.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label ?? link.url}</a>)}
            </div>
          );
          return <p key={index} className="ui-signin__muted" role="status">{event.message}</p>;
        })}
        {login.prompt && <Question key={login.prompt.id} prompt={login.prompt} onAnswer={value => onAnswer(login.prompt!.id, value)} />}
        {login.status === "running" && !login.prompt && events.length === 0 && <p className="ui-signin__muted" role="status">Starting the sign-in…</p>}
        {/* A page or code shown and nothing newer: the agent waits for the browser */}
        {login.status === "running" && !login.prompt && ["auth_url", "device_code"].includes(events.at(-1)?.type ?? "") &&
          <p className="ui-signin__muted" role="status">Waiting for you to finish in the browser…</p>}
        {login.status === "succeeded" && <p role="status" className="ui-signin__done">Signed in.</p>}
        {login.status === "failed" && <p role="alert" className="ui-signin__error">{login.error ?? "The sign-in failed."}</p>}
      </div>
      <div className="ui-signin__foot">
        {login.status === "running" ? <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          : login.status === "succeeded" ? <Button onClick={onDone}>Done</Button>
            : <Button variant="secondary" onClick={onBack}>Back</Button>}
      </div>
    </>
  );
}

function Question({ prompt, onAnswer }: { prompt: NonNullable<LoginState["prompt"]>; onAnswer: (value: string) => void }) {
  const id = useId();
  const [value, setValue] = useState("");
  if (prompt.type === "select") return (
    <fieldset className="ui-signin__step">
      <legend>{prompt.message}</legend>
      <div className="ui-signin__choices">
        {prompt.options.map(option => (
          <Button key={option.id} variant="secondary" onClick={() => onAnswer(option.id)}>
            {option.label}{option.description ? ` – ${option.description}` : ""}
          </Button>
        ))}
      </div>
    </fieldset>
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value.trim()) onAnswer(prompt.type === "secret" ? value.trim() : value);
  };
  return (
    <form className="ui-signin__step" onSubmit={submit}>
      <label htmlFor={id}>{prompt.message}</label>
      <Input id={id} autoFocus required autoComplete="off" spellCheck={false} type={prompt.type === "secret" ? "password" : "text"}
        placeholder={prompt.placeholder} value={value} onChange={event => setValue(event.target.value)} />
      <Button type="submit" disabled={!value.trim()}>Continue</Button>
    </form>
  );
}

const css = /* css */ `
.ui-signin {
  width: min(520px, calc(100vw - 32px));
  max-width: none;
  max-height: min(640px, calc(100dvh - 32px));
  margin: 12vh auto auto;
  padding: 20px;
  display: none;
  flex-direction: column;
  gap: 14px;
  overflow: auto;
  border: 0;
  border-radius: calc(12px * var(--squircle-factor, 1));
  background: var(--surface-5);
  box-shadow: var(--shadow-5);
  color: var(--fluid-foreground);
}
.ui-signin[open] { display: flex; }
.ui-signin::backdrop { background: rgb(0 0 0 / 0.5); }
.ui-signin__head { display: flex; align-items: center; gap: 10px; }
.ui-signin__icon { display: inline-flex; width: 22px; height: 22px; }
.ui-signin__icon svg { width: 100%; height: 100%; }
.ui-signin__title { margin: 0; font-size: 1.05rem; font-weight: 600; }
.ui-signin__lead, .ui-signin__muted { margin: 0; color: var(--fluid-muted); font-size: 0.875rem; }
.ui-signin__search { width: 100%; }
/* The onboarding's field takes its ring from the onboarding's own colors; here it uses the dialog's */
.ui-signin input.ui-ob-input { background: transparent; color: var(--fluid-foreground); box-shadow: 0 0 0 1px var(--fluid-hairline); }
.ui-signin input.ui-ob-input:hover { box-shadow: 0 0 0 1px var(--fluid-muted); }
.ui-signin input.ui-ob-input:focus { box-shadow: 0 0 0 1px var(--fluid-foreground), 0 0 0 4px var(--fluid-hover); }
.ui-signin input.ui-ob-input::placeholder { color: var(--fluid-muted); }
.ui-signin__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; overflow: auto; min-height: 0; }
.ui-signin__row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid var(--fluid-hairline); }
.ui-signin__row:first-child { border-top: 0; }
.ui-signin__text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.ui-signin__name { font-weight: 500; }
.ui-signin__status { color: var(--fluid-muted); font-size: 0.8125rem; overflow-wrap: anywhere; }
.ui-signin__actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.ui-signin__steps { display: flex; flex-direction: column; gap: 14px; }
.ui-signin__step { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; margin: 0; padding: 0; border: 0; }
.ui-signin__step p, .ui-signin__step legend { margin: 0; font-size: 0.9375rem; }
.ui-signin__step label { font-size: 0.9375rem; }
.ui-signin__step input { width: 100%; }
.ui-signin__choices { display: flex; flex-direction: column; align-items: stretch; gap: 6px; width: 100%; }
.ui-signin__code { font-family: var(--font-mono, ui-monospace, monospace); font-size: 1.5rem; letter-spacing: 0.12em; }
.ui-signin__done { margin: 0; font-weight: 500; }
.ui-signin__error { margin: 0; color: var(--destructive, #c62828); font-size: 0.875rem; }
.ui-signin__foot { display: flex; justify-content: flex-end; gap: 8px; }
@media (max-width: 480px) {
  .ui-signin__row { flex-direction: column; align-items: stretch; }
  .ui-signin__actions { justify-content: flex-start; }
}
`;
