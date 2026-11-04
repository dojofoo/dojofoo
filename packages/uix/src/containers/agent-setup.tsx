import { agentRows, type AgentRow, type AgentId, type AgentInstallation } from "@dojofoo/protocol";
import { Switch } from "../components/switch";
import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { AppearanceSettings } from "./appearance-settings";
import { Icon } from "../components/app-shell";
import { Button } from "../components/button";
import { ChatGPTButton, ChatGPTLogo } from "../components/chatgpt-button";
import { OpenRouterButton, OpenRouterLogo } from "../components/openrouter-button";
import { CardFigure, CardMark, CardText, CardTitle, ColorCard, ColorCardCheck, type CardShaderKind } from "../components/color-card";
import { agentIcons } from "../components/harness-icons";
import { ArrowLeft01Icon, ArrowRight01Icon, DoneIcon, Tick02Icon, type IconGlyph } from "../lib/icons";
import { editorSchemes, setPageMode, uiThemes, usePageMode, useUiPreferences } from "../lib/ui-preferences";

/*
 * AgentSetup – a learner's first run, built from the affectUI onboarding's own parts (its stylesheet, its markup): the
 * greeting and the step wizard on top, the step in a card, and on the right, in larger type, a few lines on what the
 * step is for. The steps:
 *
 *   Agent      the coding agent Dojo teaches through – one found on this machine, or Continue with ChatGPT (the user's
 *              ChatGPT plan, via Sign in with ChatGPT) or with OpenRouter (their OpenRouter credits). Required: no
 *              skipping. Missing installations appear automatically once installed.
 *   Courses    the top courses as cards, ticked to install – or none, to pick later in Explore
 *   Account    connect to dojo.foo or continue anonymously
 *   Style      light or dark, the theme and the color scheme side by side, the code below them
 *   Overview   the launch workspace and everything chosen; Start saves it all
 *
 * The parent holds which step is open and which are done (setupSteps), so the sidebar's Getting started can follow.
 *
 *   <AgentSetup step={1} done={[0]} courses={…} onNext={…} onBack={…} onSkip={…} onFinish={(values) => …} />
 */
export const setupSteps = [
  { id: "agent", title: "Agent" },
  { id: "courses", title: "Courses" },
  { id: "account", title: "Account" },
  { id: "style", title: "Style" },
  { id: "overview", title: "Overview" },
] as const;

export type SetupValues = { agents: string[]; courses: string[]; name: string; folder: string };
/** A course to offer: shown as its card – its color, its effect, who made it and its rating */
export type SetupCourse = { id: string; title: string; color: string; shader?: CardShaderKind; mark?: ReactNode; author: string; rating?: number; lessons?: number; hours?: number };

type Agent = AgentRow & { icon: IconGlyph; found: boolean };
// The standalone Storybook preview supplies example availability. Production
// receives the core inventory from the local API.
const agents: Agent[] = agentRows.map(agent => ({ ...agent, icon: agentIcons[agent.id], found: agent.id === "claude" || agent.id === "codex" }));

/** The other ways in: an account whose plan or credits pay for the agent's requests. ChatGPT – Sign in with ChatGPT,
    OAuth with PKCE to a loopback listener, a token that spends the user's plan; OpenRouter – its OAuth with PKCE to a
    localhost callback, a key that bills the user's credits */
const accounts = [
  { id: "chatgpt", name: "ChatGPT (your plan)", Logo: ChatGPTLogo, Button: ChatGPTButton, title: "You're using your ChatGPT plan", note: "Your agent's requests run on your plan – manage usage in ChatGPT's settings." },
  { id: "openrouter", name: "OpenRouter (your credits)", Logo: OpenRouterLogo, Button: OpenRouterButton, title: "You're using your OpenRouter credits", note: "Your agent's requests run on your credits – set limits in OpenRouter's settings." },
] as const;
type AccountId = (typeof accounts)[number]["id"];


const copy: Record<(typeof setupSteps)[number]["id"], { heading: string; text: string; about: string; tip: string }> = {
  agent: { heading: "Pick your agents", text: "Dojo teaches through a coding agent – one already on this machine, your ChatGPT plan or your OpenRouter credits.", about: "Lessons run on your machine. Your agent reads the kata, runs the tests and coaches you in the chat – Dojo talks to it, never to a model of its own.", tip: "Installed agents appear here automatically." },
  courses: { heading: "Pick your first courses", text: "Choose a starter course, or leave it for later.", about: "Courses contain chapters and lessons. Installing places them in your workspace, where you can learn offline and keep your work.", tip: "Explore has every course, whenever you want more." },
  account: { heading: "Connect your account", text: "Would you like to connect your account or run anonymously?", about: "Connect to dojo.foo to sync your name, email, avatar and course progress across devices.", tip: "You can start as Anonymous and connect your account later." },
  style: { heading: "Make it yours", text: "The theme around you and the colors of your code – it changes as you pick.", about: "Pick what's easy on your eyes for a long session. The theme colors the app, the color scheme your code – the editor shows both.", tip: "Settings has the same choices any time." },
  overview: { heading: "Overview", text: "Your choices and the workspace where courses will be installed.", about: "Courses and their files stay in the folder where you started Dojo. Your account and setup settings stay on this machine in ~/.dojofoo.", tip: "Start Dojo in another folder to use a different workspace." },
};


export function AgentSetup({ step, done, courses, onNext, onBack, onSkip, onFinish, local }: {
  local?: { workspace: string; agents: AgentInstallation[]; user: { name: string }; onConnect?: () => void; busy?: boolean; loadingAgents?: boolean };
  /** The open step, an index into setupSteps */
  step: number;
  /** Steps finished, by index */
  done: number[];
  /** Courses to offer, the top ones; the first is ticked */
  courses: SetupCourse[];
  /** Continue: the step is done, the next opens */
  onNext: () => void;
  onBack: () => void;
  /** Leave the step for later (not the agent, which is required) */
  onSkip: () => void;
  onFinish: (values: SetupValues) => void;
}) {
  const choices: Agent[] = local ? local.agents.map(agent => ({ ...agent, icon: agentIcons[agent.id] })) : agents;
  const installed = choices.filter((item) => item.found);
  const [chosenAgents, setAgents] = useState<string[] | null>(null);
  const defaults = installed.slice(0, 1).map(item => item.id);
  const selectedAgents = chosenAgents ?? defaults;
  const toggleAgent = (id: string) => setAgents(current => {
    const selected = current ?? defaults;
    return selected.includes(id) ? selected.filter(agent => agent !== id) : [...selected, id];
  });
  const [connections, setConnections] = useState<Partial<Record<AccountId, "connecting" | "connected">>>({});
  const [picked, setPicked] = useState<string[]>(() => courses.slice(0, 1).map((item) => item.id));
  const name = local?.user.name ?? "Anonymous";
  const folder = local?.workspace ?? "~/.dojofoo";
  // Dark by default: setup starts dark, the Style step's switch turns it light
  const preferences = useUiPreferences();
  const mode = usePageMode();
  // Which way the card's content slides: forward or back, set as the step changes
  const [shown, setShown] = useState(step);
  const [dir, setDir] = useState<"next" | "back">("next");
  if (shown !== step) {
    setShown(step);
    setDir(step > shown ? "next" : "back");
  }
  const id = setupSteps[step].id;
  const first = step === 0;
  const final = step === setupSteps.length - 1;
  const firstName = name.trim().split(" ")[0] || "there";
  // An agent is required before setup can finish.
  const blocked = Boolean(local?.busy) || (id === "agent" && selectedAgents.length === 0);
  const agentName = selectedAgents.map(id => accounts.find(item => item.id === id)?.name ?? agents.find(item => item.id === id)?.name ?? id).join(", ") || "None";

  // Prototype interaction only. No OAuth exchange or credential handling occurs.
  const connect = (id: AccountId) => {
    setConnections((all) => ({ ...all, [id]: "connecting" }));
    window.setTimeout(() => { setConnections((all) => ({ ...all, [id]: "connected" })); setAgents(current => [...new Set([...(current ?? defaults), id])]); }, 1200);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    if (final) onFinish({ agents: selectedAgents, courses: picked, name: name.trim(), folder });
    else onNext();
  };

  return (
    <div className="ui-ob ui-setup">
      <style href="ui-agent-setup" precedence="default">{css}</style>
      <header className="ui-ob-head">
        <span className="ui-ob-kicker">Step {step + 1} of {setupSteps.length}</span>
        <h1 className="ui-ob-title">Welcome to Dojo, {firstName}</h1>
        <p className="ui-ob-sub">A few quick steps and your agent is ready to teach – about two minutes.</p>
        {!local && id === "agent" && <p className="ui-ob-sub" role="note">Setup preview: installations and sign-ins below are examples, not live detection or authentication. Some shown adapters are not enabled in Dojo yet.</p>}
        <ol className="ui-ob-steps" aria-label="Setup progress">
          {setupSteps.map((item, index) => {
            const state = done.includes(index) ? "done" : index === step ? "current" : "next";
            return (
              <li key={item.id} className="ui-ob-steps__item" data-state={state} aria-current={state === "current" ? "step" : undefined}>
                <span className="ui-ob-steps__mark" aria-hidden="true">{state === "done" ? <Icon key="done" icon={Tick02Icon} size={11} stroke={2.4} /> : index + 1}</span>
                <span className="ui-ob-steps__label">{item.title}<span className="ui-ob-sr">{state === "done" ? ", done" : state === "current" ? ", current step" : ""}</span></span>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="ui-ob-card">
        <form className="ui-ob-form" onSubmit={submit} noValidate>
          <div key={step} className="ui-ob-step" data-dir={dir}>
            <div className="ui-ob-step__head ui-setup__head">
              <span>
                <h2 className="ui-ob-step__title">{copy[id].heading}</h2>
                <p className="ui-ob-step__text" role={id === "agent" ? "note" : undefined}>{local && id === "agent" ? installed.length ? "Choose one or more agents found on this machine." : "Dojo automatically detects agents installed on this machine." : copy[id].text}</p>
              </span>
              {id === "style" && (
                // Light on the left, Dark on the right: a plain switch, on for dark (the default)
                <span className="ui-setup__mode">
                  <span aria-hidden="true" data-on={mode === "light" || undefined}>Light</span>
                  <Switch checked={mode === "dark"} aria-label="Dark mode" onCheckedChange={dark => setPageMode(dark ? "dark" : "light")} />
                  <span aria-hidden="true" data-on={mode === "dark" || undefined}>Dark</span>
                </span>
              )}
            </div>

            {id === "agent" && (
              <>
                {installed.length > 0 && (
                  <div className="ui-ob-templates ui-setup__agents" role="group" aria-label="Agents">
                    {installed.map((item, index) => (
                      <button key={item.id} type="button" role="checkbox" aria-checked={selectedAgents.includes(item.id)} className="ui-ob-template" style={{ "--i": index } as CSSProperties} onClick={() => toggleAgent(item.id)}>
                        <span className="ui-setup__agent-icon"><Icon icon={item.icon} size={20} /></span>
                        <b className="ui-ob-template__name">{item.name}</b>
                        <span className="ui-ob-template__check rounded-sm" aria-hidden="true"><Icon icon={Tick02Icon} size={12} stroke={2.4} /></span>
                      </button>
                    ))}
                  </div>
                )}
                {!local && <>
                <div className="ui-setup__or"><span>or</span></div>
                {/* Side by side until connected; a connected one becomes a row to pick, the full width */}
                <div className="ui-setup__accounts">
                  {accounts.map(({ id: account, Logo, Button: Continue, title, note }) => connections[account] === "connected" ? (
                    <button key={account} type="button" role="checkbox" aria-checked={selectedAgents.includes(account)} className="ui-setup__plan" onClick={() => toggleAgent(account)}>
                      <Logo size={22} />
                      <span>
                        <b>{title}</b>
                        <small>{note}</small>
                      </span>
                      {selectedAgents.includes(account) && <Icon icon={DoneIcon} size={16} />}
                    </button>
                  ) : (
                    <Continue key={account} className="ui-setup__continue" disabled={connections[account] === "connecting"} onClick={() => connect(account)} />
                  ))}
                </div>
                </>}
                {local && !installed.length && <p role="status">{local.loadingAgents ? "Loading agents…" : "No coding agents found. Install an agent to continue; it will appear here automatically."}</p>}

              </>
            )}

            {id === "courses" && (
              <>
                <div className="ui-setup__courses" role="group" aria-label="Courses to install">
                  {courses.map((item) => {
                    const on = picked.includes(item.id);
                    return (
                      <label key={item.id} className="ui-setup__course" data-on={on || undefined}>
                        <input type="checkbox" className="ui-ob-sr" checked={on} onChange={() => setPicked((list) => (on ? list.filter((x) => x !== item.id) : [...list, item.id]))} />
                        <ColorCard color={item.color} shader={item.shader} seed={item.id}
                          header={<><CardMark>{item.mark ?? item.author}</CardMark>{item.rating !== undefined && <CardFigure>★ {item.rating.toFixed(1)}</CardFigure>}</>}
                          main={<CardTitle>{item.title}</CardTitle>}
                          footer={<><CardText label={item.lessons ? `${item.lessons} lessons` : undefined} value={item.hours ? `~${item.hours}\u00a0h` : undefined} /><ColorCardCheck checked={on} /></>} />
                      </label>
                    );
                  })}
                </div>
                <p className="ui-setup__later">
                  {picked.length ? <>{picked.length} to install. </> : <>You can always install courses later. </>}
                  {picked.length > 0 && <button type="button" onClick={() => setPicked([])}>I'll choose later</button>}
                </p>
              </>
            )}

            {id === "account" && (
              <div className="ui-ob-fields">
                <Button type="button" disabled={!local?.onConnect} onClick={() => local?.onConnect?.()}>Connect your account</Button>
                {local && !local.onConnect && <p>Account connection is not available yet. You can connect later.</p>}
                <Button type="button" variant="secondary" onClick={onNext}>Continue anonymously</Button>
              </div>
            )}

            {id === "style" && (
              <AppearanceSettings showMode={false} />
            )}

            {id === "overview" && (
              <div className="ui-ob-fields">
                <label className="ui-ob-field">
                  <span className="ui-ob-label">Dojo folder</span>
                  <input className="ui-ob-input" value={folder} readOnly spellCheck={false} />
                  <span className="ui-ob-hint">Courses install in this workspace. Machine settings stay in ~/.dojofoo.</span>
                </label>
                <dl className="ui-setup__summary">
                  <div><dt>Agents</dt><dd>{agentName}</dd></div>
                  <div><dt>Courses</dt><dd>{courses.filter((item) => picked.includes(item.id)).map((item) => item.title).join(", ") || "Later, in Explore"}</dd></div>
                  <div><dt>Name</dt><dd>{name.trim() || "–"}</dd></div>
                  <div><dt>Appearance</dt><dd>{mode === "dark" ? "Dark" : "Light"}</dd></div>
                  <div><dt>Theme</dt><dd>{uiThemes.find((theme) => theme.id === preferences.theme)?.label}</dd></div>
                  <div><dt>Color scheme</dt><dd>{preferences.editorScheme === "match" ? "Auto" : editorSchemes.find((scheme) => scheme.id === preferences.editorScheme)?.label}</dd></div>
                </dl>
              </div>
            )}
          </div>

          <footer className="ui-ob-foot">
            {/* The agent is required, and the overview is the end – neither can be skipped */}
            {first || final ? <span /> : <button type="button" className="ui-ob-skip" onClick={onSkip}>Skip for now</button>}
            <span className="ui-ob-foot__actions">
              {step > 0 && <Button size="sm" variant="secondary" icon={<Icon icon={ArrowLeft01Icon} size={14} />} onClick={onBack}>Back</Button>}
              <Button size="sm" type="submit" disabled={blocked} iconRight={final ? undefined : <Icon icon={ArrowRight01Icon} size={14} />}>{local?.busy ? "Setting up…" : final ? "Start" : "Continue"}</Button>
            </span>
          </footer>
        </form>

      </div>

      {/* What the step is for, in larger type */}
      <aside className="ui-ob-aside ui-setup__about" aria-label="About this step">
        <p key={id}>{copy[id].about}</p>
        <small>{copy[id].tip}</small>
      </aside>
    </div>
  );
}

const css = /* css */ `
/* Only what the onboarding doesn't have */
.ui-setup__about { padding-top: 4px; }
.ui-setup__about p { margin: 0; color: var(--text); font-size: 17px; line-height: 1.55; text-wrap: pretty; animation: ui-ob-rise 380ms var(--ease) both; }
.ui-setup__about small { color: var(--muted); font-size: var(--fs-body); line-height: 1.5; }
.ui-setup__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ui-setup__head:has([role="note"]) { margin-block-end: 24px; }
.ui-setup__head [role="note"] { margin-block-start: 6px; font-size: 0.875rem; line-height: 1.5; text-wrap: pretty; }

/* Agent: compact choices with a mark, name and checkbox. */
.ui-setup__agents { grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr)); }
/* The agents sit one surface up from the step card they're on (surface 3, in the app) */
.ui-setup__agents .ui-ob-template { flex-direction: row; align-items: center; gap: 10px; padding: 14px; background: var(--surface-4, var(--card)); }
.ui-setup__agents .ui-ob-template__check { margin-inline-start: auto; flex-shrink: 0; }
.ui-setup__agent-icon { display: grid; place-items: center; width: 20px; height: 20px; flex-shrink: 0; color: var(--ink); }
.ui-setup__or { display: flex; align-items: center; gap: 12px; margin: 20px 0 16px; color: var(--muted); font-size: 12px; }
.ui-setup__or::before, .ui-setup__or::after { content: ""; flex: 1; height: 1px; background: var(--fluid-hairline); }
.ui-setup__accounts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr)); gap: 10px; }
.ui-setup__continue { width: 100%; }
.ui-setup__accounts > .ui-setup__plan, .ui-setup__accounts:has(> .ui-setup__plan) > .ui-setup__continue { grid-column: 1 / -1; }
.ui-setup__plan { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border-radius: calc(12px * var(--squircle-factor, 1)); background: var(--fluid-hover); color: var(--ink); text-align: left; }
.ui-setup__plan[aria-checked="true"] { box-shadow: inset 0 0 0 1.5px var(--ink); }
.ui-setup__plan > span { display: grid; flex: 1; gap: 2px; }
.ui-setup__plan b { font-size: 13.5px; font-weight: 550; }
.ui-setup__plan small { color: var(--muted); font-size: 12.5px; line-height: 1.4; }

/* Courses: the cards, ticked to install */
.ui-setup__courses { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ui-setup__course { position: relative; display: grid; border-radius: calc(12px * var(--squircle-factor, 1)); cursor: pointer; }
.ui-setup__course:has(:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.ui-setup__course[data-on] .ui-card { box-shadow: 0 0 0 2px var(--ink), var(--shadow-3); }
.ui-setup__later { margin: 14px 0 0; color: var(--muted); font-size: 13px; }
.ui-setup__later button { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }


/* Style: light or dark as a switch between its two words, the chosen one in ink; theme and color scheme side by side –
   far enough apart that their rows' highlights (which reach past the column) keep a clear gap – the code below */
.ui-setup__mode { display: inline-flex; flex: none; align-items: center; gap: 8px; color: var(--muted); font-size: var(--fs-caption); }
.ui-setup__mode [data-on] { color: var(--ink); }
.ui-setup__looks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 36px; }
.ui-setup__looks .ui-as-brief__section { padding: 0; border-top: 0; }
.ui-setup__looks .ui-as-brief__label { padding-bottom: 6px; }
.ui-setup__code { height: 220px; margin: 20px -28px -4px; overflow: hidden; border-top: 1px solid var(--fluid-hairline); }
.ui-setup__code .ui-ed { height: 100%; }

/* Overview */
.ui-setup__summary { display: grid; gap: 8px; margin: 0; padding-top: 14px; border-top: 1px solid var(--fluid-hairline); }
.ui-setup__summary div { display: flex; justify-content: space-between; gap: 16px; font-size: var(--fs-body); }
.ui-setup__summary dt { color: var(--muted); }
.ui-setup__summary dd { margin: 0; text-align: right; color: var(--ink); }
@container ui-as-main (max-width: 620px) {
  .ui-setup__courses, .ui-setup__looks { grid-template-columns: minmax(0, 1fr); }
  .ui-setup__code { margin-inline: -18px; }
}
`;
