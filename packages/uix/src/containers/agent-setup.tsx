import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { ColorSchemeChoices } from "~/containers/agent-chat";
import { Icon } from "~/components/app-shell";
import { Button } from "~/components/button";
import { ChatGPTButton, ChatGPTLogo } from "~/components/chatgpt-button";
import { OpenRouterButton, OpenRouterLogo } from "~/components/openrouter-button";
import { CardFigure, CardMark, CardText, CardTitle, ColorCard, ColorCardCheck, type CardShaderKind } from "~/components/color-card";
import { CodeEditor, Editor, EditorTabs } from "~/containers/editor";
import { CodexIcon, CursorIcon, GrokIcon, OpenCodeIcon, PiIcon } from "~/components/harness-icons";
import { SegmentedControl } from "~/components/segmented-control";
import { ArrowLeft01Icon, ArrowRight01Icon, ClaudeIcon, DoneIcon, GitHubCopilotIcon, Tick02Icon, type IconGlyph } from "~/lib/icons";
import { editorSchemes, setPageMode, setUiPreferences, uiThemes, usePageMode, useUiPreferences } from "~/lib/ui-preferences";

/*
 * AgentSetup – a learner's first run, built from the affectUI onboarding's own parts (its stylesheet, its markup): the
 * greeting and the step wizard on top, the step in a card, and on the right, in larger type, a few lines on what the
 * step is for. The steps:
 *
 *   Agent      the coding agent Dojo teaches through – one found on this machine, or Continue with ChatGPT (the user's
 *              ChatGPT plan, via Sign in with ChatGPT) or with OpenRouter (their OpenRouter credits). Required: no
 *              skipping. How to install one is below the card.
 *   Courses    the top courses as cards, ticked to install – or none, to pick later in Explore
 *   Profile    name and handle (dojo.foo/u/…, checked as it's typed)
 *   Style      light or dark, the theme and the color scheme side by side, the code below them
 *   Overview   the root folder (~/.dojo) and everything chosen; Start saves it all
 *
 * The parent holds which step is open and which are done (setupSteps), so the sidebar's Getting started can follow.
 *
 *   <AgentSetup step={1} done={[0]} courses={…} onNext={…} onBack={…} onSkip={…} onFinish={(values) => …} />
 */
export const setupSteps = [
  { id: "agent", title: "Agent" },
  { id: "courses", title: "Courses" },
  { id: "profile", title: "Profile" },
  { id: "style", title: "Style" },
  { id: "overview", title: "Overview" },
] as const;

export type SetupValues = { agent: string; courses: string[]; name: string; handle: string; folder: string };
/** A course to offer: shown as its card – its color, its effect, who made it and its rating */
export type SetupCourse = { id: string; title: string; color: string; shader?: CardShaderKind; mark?: ReactNode; author: string; rating?: number; lessons?: number; hours?: number };

type Agent = { id: string; name: string; /** For the install help's switch */ short: string; icon: IconGlyph; found: boolean; install: string; docs: string };
/** Design fixtures, not a machine scan or a list of enabled Dojo runtimes.
    Production currently enables Codex, OpenCode, Pi, Cursor, Grok and FX. */
const agents: Agent[] = [
  { id: "claude", name: "Claude Code", short: "Claude", icon: ClaudeIcon, found: true, install: "npm install -g @anthropic-ai/claude-code", docs: "docs.anthropic.com/claude-code" },
  { id: "codex", name: "Codex", short: "Codex", icon: CodexIcon, found: true, install: "npm install -g @openai/codex", docs: "developers.openai.com/codex" },
  { id: "cursor", name: "Cursor", short: "Cursor", icon: CursorIcon, found: false, install: "curl https://cursor.com/install -fsS | bash", docs: "cursor.com/cli" },
  { id: "copilot", name: "GitHub Copilot", short: "Copilot", icon: GitHubCopilotIcon, found: false, install: "npm install -g @github/copilot", docs: "github.com/github/copilot-cli" },
  { id: "grok", name: "Grok Build", short: "Grok", icon: GrokIcon, found: false, install: "npm install -g @xai-official/grok", docs: "x.ai/cli" },
  { id: "opencode", name: "OpenCode", short: "OpenCode", icon: OpenCodeIcon, found: false, install: "brew install sst/tap/opencode", docs: "opencode.ai" },
  { id: "pi", name: "Pi", short: "Pi", icon: PiIcon, found: false, install: "curl -fsSL https://pi.dev/install.sh | sh", docs: "pi.dev" },
];
/** Proposed API-backed choices for this setup prototype. Not enabled runtimes. */
const builtInAgents = ["Cline", "Deep Agents", "fx"];

/** The other ways in: an account whose plan or credits pay for the agent's requests. ChatGPT – Sign in with ChatGPT,
    OAuth with PKCE to a loopback listener, a token that spends the user's plan; OpenRouter – its OAuth with PKCE to a
    localhost callback, a key that bills the user's credits */
const accounts = [
  { id: "chatgpt", name: "ChatGPT (your plan)", Logo: ChatGPTLogo, Button: ChatGPTButton, title: "You're using your ChatGPT plan", note: "Your agent's requests run on your plan – manage usage in ChatGPT's settings." },
  { id: "openrouter", name: "OpenRouter (your credits)", Logo: OpenRouterLogo, Button: OpenRouterButton, title: "You're using your OpenRouter credits", note: "Your agent's requests run on your credits – set limits in OpenRouter's settings." },
] as const;
type AccountId = (typeof accounts)[number]["id"];

/** Handles already taken on dojo.foo – the check asks the server for these */
const takenHandles = ["sam", "admin", "dojo", "sensei", "kyoshi", "root"];
const handlePattern = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/;

/** Each step's card head, and what the right side says about it */
const copy: Record<(typeof setupSteps)[number]["id"], { heading: string; text: string; about: string; tip: string }> = {
  agent: { heading: "Pick your agent", text: "Dojo teaches through a coding agent – one already on this machine, your ChatGPT plan or your OpenRouter credits.", about: "Lessons run on your machine. Your agent reads the kata, runs the tests and coaches you in the chat – Dojo talks to it, never to a model of its own.", tip: "None installed? The steps below get one going in a minute." },
  courses: { heading: "Pick your first courses", text: "The most loved ones to start with – tick any, or leave it for later.", about: "Each course is a git repository of chapters and lessons. Installing clones it into your workspace, so it works offline and updates like any repo.", tip: "Explore has every course, whenever you want more." },
  profile: { heading: "About you", text: "Your name and your handle on dojo.foo.", about: "Your handle is your page on dojo.foo – it signs your certificates and the courses you publish.", tip: "Everything stays on this machine until you publish something." },
  style: { heading: "Make it yours", text: "The theme around you and the colors of your code – it changes as you pick.", about: "Pick what's easy on your eyes for a long session. The theme colors the app, the color scheme your code – the editor shows both.", tip: "Settings has the same choices any time." },
  overview: { heading: "Overview", text: "Everything you chose, saved to your Dojo folder.", about: "Your Dojo folder holds it all as plain files – courses, progress, certificates and these settings. Back it up or sync it like any other folder.", tip: "Point it at an existing folder to pick up where you left off on another machine." },
};

const files = {
  "merge.ts": `type Settings = { theme: string; fontSize?: number };

/** Defaults first, then what the user chose */
export function merge(defaults: Settings, overrides: Partial<Settings>): Settings {
  return { ...defaults, ...overrides };
}

const settings = merge({ theme: "dojofoo", fontSize: 14 }, { fontSize: 16 });
`,
  "merge.test.ts": `import { expect, it } from "vitest";
import { merge } from "./merge";

it("keeps the defaults it isn't given", () => {
  expect(merge({ theme: "dojofoo", fontSize: 14 }, {})).toEqual({ theme: "dojofoo", fontSize: 14 });
});
`,
};

export function AgentSetup({ step, done, courses, onNext, onBack, onSkip, onFinish }: {
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
  const installed = agents.filter((item) => item.found);
  const [agent, setAgent] = useState<string>(installed[0]?.id ?? "");
  const [connections, setConnections] = useState<Partial<Record<AccountId, "connecting" | "connected">>>({});
  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => courses.slice(0, 1).map((item) => item.id));
  const [name, setName] = useState("Sam Rivera");
  const [handle, setHandle] = useState("samrivera");
  const [folder, setFolder] = useState("~/.dojo");
  // Dark by default: setup starts dark, the Style step's switch turns it light
  useEffect(() => { setPageMode("dark"); }, []);
  const [file, setFile] = useState<keyof typeof files>("merge.ts");
  const preferences = useUiPreferences();
  const mode = usePageMode();
  const handleState = useHandleCheck(handle);
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
  // The agent is required; the profile needs a name and a handle that is free
  const blocked = (id === "agent" && !agent) || (id === "profile" && (!name.trim() || handleState !== "available"));
  const agentName = accounts.find((item) => item.id === agent)?.name ?? agents.find((item) => item.id === agent)?.name ?? "None";

  // Prototype interaction only. No OAuth exchange or credential handling occurs.
  const connect = (id: AccountId) => {
    setConnections((all) => ({ ...all, [id]: "connecting" }));
    window.setTimeout(() => { setConnections((all) => ({ ...all, [id]: "connected" })); setAgent(id); }, 1200);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    if (final) onFinish({ agent, courses: picked, name: name.trim(), handle, folder });
    else onNext();
  };

  return (
    <div className="ui-ob ui-setup">
      <style href="ui-agent-setup" precedence="default">{css}</style>
      <header className="ui-ob-head">
        <span className="ui-ob-kicker">Step {step + 1} of {setupSteps.length}</span>
        <h1 className="ui-ob-title">Welcome to Dojo, {firstName}</h1>
        <p className="ui-ob-sub">A few quick steps and your agent is ready to teach – about two minutes.</p>
        {id === "agent" && <p className="ui-ob-sub" role="note">Setup preview: installations and sign-ins below are examples, not live detection or authentication. Some shown adapters are not enabled in Dojo yet.</p>}
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
                <p className="ui-ob-step__text">{copy[id].text}</p>
              </span>
              {id === "style" && (
                // Light on the left, Dark on the right: a plain switch, on for dark (the default)
                <span className="ui-setup__mode">
                  <span aria-hidden="true" data-on={mode === "light" || undefined}>Light</span>
                  <button type="button" role="switch" aria-checked={mode === "dark"} aria-label="Dark mode" className="ui-ob-switch" onClick={() => setPageMode(mode === "dark" ? "light" : "dark")} />
                  <span aria-hidden="true" data-on={mode === "dark" || undefined}>Dark</span>
                </span>
              )}
            </div>

            {id === "agent" && (
              <>
                {installed.length > 0 && (
                  <div className="ui-ob-templates ui-setup__agents" role="radiogroup" aria-label="Agent">
                    {installed.map((item, index) => (
                      <button key={item.id} type="button" role="radio" aria-checked={agent === item.id} className="ui-ob-template" style={{ "--i": index } as CSSProperties} onClick={() => setAgent(item.id)}>
                        <span className="ui-ob-template__top">
                          <span className="ui-setup__agent-icon"><Icon icon={item.icon} size={36} /></span>
                          <span className="ui-ob-template__check rounded-sm" aria-hidden="true"><Icon icon={Tick02Icon} size={12} stroke={2.4} /></span>
                        </span>
                        <b className="ui-ob-template__name">{item.name}</b>
                        <span className="ui-setup__installed">Installed · example</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="ui-setup__or"><span>or</span></div>
                {/* Side by side until connected; a connected one becomes a row to pick, the full width */}
                <div className="ui-setup__accounts">
                  {accounts.map(({ id: account, Logo, Button: Continue, title, note }) => connections[account] === "connected" ? (
                    <button key={account} type="button" role="radio" aria-checked={agent === account} className="ui-setup__plan" onClick={() => setAgent(account)}>
                      <Logo size={22} />
                      <span>
                        <b>{title}</b>
                        <small>{note}</small>
                      </span>
                      {agent === account && <Icon icon={DoneIcon} size={16} />}
                    </button>
                  ) : (
                    <Continue key={account} className="ui-setup__continue" disabled={connections[account] === "connecting"} onClick={() => connect(account)} />
                  ))}
                </div>
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

            {id === "profile" && (
              <div className="ui-ob-fields">
                <label className="ui-ob-field">
                  <span className="ui-ob-label">Name</span>
                  <input className="ui-ob-input" value={name} placeholder="e.g. Sam Rivera" autoComplete="name" onChange={(event) => setName(event.target.value)} />
                </label>
                <label className="ui-ob-field">
                  <span className="ui-ob-label">Handle</span>
                  <span className="ui-ob-input ui-ob-input--prefix">
                    <span className="ui-ob-prefix">dojo.foo/u/</span>
                    <input value={handle} placeholder="samrivera" aria-label="Handle" autoComplete="username" spellCheck={false} aria-invalid={handleState === "taken" || handleState === "invalid" || undefined}
                      onChange={(event) => setHandle(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} />
                  </span>
                  <span className="ui-ob-hint ui-setup__handle" data-state={handleState} aria-live="polite">
                    {handleState === "checking" ? "Checking…"
                      : handleState === "available" ? <><Icon icon={Tick02Icon} size={12} stroke={2.4} />dojo.foo/u/{handle} is yours</>
                      : handleState === "taken" ? "Taken – try another"
                      : "3–24 letters, numbers or dashes"}
                  </span>
                </label>
              </div>
            )}

            {id === "style" && (
              <div className="ui-setup__style">
                <div className="ui-setup__looks">
                  <section className="ui-as-brief__section" role="radiogroup" aria-label="Theme">
                    <span className="ui-as-brief__label">Theme</span>
                    {uiThemes.map((theme) => (
                      <button key={theme.id} type="button" role="radio" aria-checked={preferences.theme === theme.id} className="ui-as-brief__option" onClick={() => setUiPreferences({ theme: theme.id })}>
                        <span className="ui-as-brief__radio" aria-hidden="true" />
                        <span className="ui-as-brief__name">{theme.label}</span>
                        <span className="ui-as-brief__swatches" aria-hidden="true">{theme.swatches.map((color, i) => <i key={i} style={{ background: color }} />)}</span>
                      </button>
                    ))}
                  </section>
                  <ColorSchemeChoices notes={false} />
                </div>
                {/* The code, full width and unframed, in the scheme just picked */}
                <div className="ui-setup__code">
                  <Editor flush tabs={<EditorTabs mode="learning" label="Preview files" active={file} tabs={(Object.keys(files) as (keyof typeof files)[]).map((path) => ({ path, label: path }))} onSelect={(path) => setFile(path as keyof typeof files)} />}>
                    <CodeEditor code={files[file]} filePath={`preview/${file}`} language="typescript" lessonApiBase="" readOnly coverage={false} onChange={() => {}} />
                  </Editor>
                </div>
              </div>
            )}

            {id === "overview" && (
              <div className="ui-ob-fields">
                <label className="ui-ob-field">
                  <span className="ui-ob-label">Dojo folder</span>
                  <input className="ui-ob-input" value={folder} spellCheck={false} onChange={(event) => setFolder(event.target.value)} />
                  <span className="ui-ob-hint">Where everything lives – courses, progress, certificates and these settings</span>
                </label>
                <dl className="ui-setup__summary">
                  <div><dt>Agent</dt><dd>{agentName}</dd></div>
                  <div><dt>Courses</dt><dd>{courses.filter((item) => picked.includes(item.id)).map((item) => item.title).join(", ") || "Later, in Explore"}</dd></div>
                  <div><dt>Name</dt><dd>{name.trim() || "–"}</dd></div>
                  <div><dt>Handle</dt><dd>dojo.foo/u/{handle}</dd></div>
                  <div><dt>Appearance</dt><dd>{mode === "dark" ? "Dark" : "Light"}</dd></div>
                  <div><dt>Theme</dt><dd>{uiThemes.find((theme) => theme.id === preferences.theme)?.label}</dd></div>
                  <div><dt>Color scheme</dt><dd>{preferences.editorScheme === "match" ? "Match theme" : editorSchemes.find((scheme) => scheme.id === preferences.editorScheme)?.label}</dd></div>
                </dl>
              </div>
            )}
          </div>

          <footer className="ui-ob-foot">
            {/* The agent is required, and the overview is the end – neither can be skipped */}
            {first || final ? <span /> : <button type="button" className="ui-ob-skip" onClick={onSkip}>Skip for now</button>}
            <span className="ui-ob-foot__actions">
              {step > 0 && <Button size="sm" variant="secondary" icon={<Icon icon={ArrowLeft01Icon} size={14} />} onClick={onBack}>Back</Button>}
              <Button size="sm" type="submit" disabled={blocked} iconRight={final ? undefined : <Icon icon={ArrowRight01Icon} size={14} />}>{final ? "Start" : "Continue"}</Button>
            </span>
          </footer>
        </form>

        {/* The agent step only: how to get one, below the card */}
        {first && <InstallHelp scanning={scanning} onRescan={() => { setScanning(true); window.setTimeout(() => setScanning(false), 900); }} />}
      </div>

      {/* What the step is for, in larger type */}
      <aside className="ui-ob-aside ui-setup__about" aria-label="About this step">
        <p key={id}>{copy[id].about}</p>
        <small>{copy[id].tip}</small>
      </aside>
    </div>
  );
}

/** How to install an agent: pick one, copy its command, then rescan */
function InstallHelp({ scanning, onRescan }: { scanning: boolean; onRescan: () => void }) {
  const [which, setWhich] = useState(agents[0].short);
  const [copied, setCopied] = useState(false);
  const item = agents.find((entry) => entry.short === which)!;
  const copy = () => { navigator.clipboard?.writeText(item.install).catch(() => {}); setCopied(true); window.setTimeout(() => setCopied(false), 1400); };
  return (
    <section className="ui-setup__install rounded-2xl" aria-labelledby="ui-setup-install">
      <div className="ui-setup__install-head">
        <h3 id="ui-setup-install">How to install an agent</h3>
        <Button size="sm" variant="ghost" loading={scanning} onClick={onRescan}>Rescan</Button>
      </div>
      <SegmentedControl size="compact" fill label="Agent to install" options={agents.map((entry) => entry.short)} value={which} onChange={setWhich} />
      <ol>
        <li>Run this in a terminal:
          <span className="ui-setup__cmd"><code>{item.install}</code><button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button></span>
        </li>
        <li>Sign in when it asks – see <a href={`https://${item.docs}`} target="_blank" rel="noreferrer">{item.docs}</a>.</li>
        <li>Press Rescan, and it shows up above.</li>
      </ol>
      <p className="ui-setup__builtin">{builtInAgents.join(", ").replace(/, ([^,]*)$/, " and $1")} are additional adapter examples. This preview does not install or authenticate them. FX's supported runtime retains native sign-in.</p>
    </section>
  );
}

/** Whether a handle is free on dojo.foo: checked a moment after typing stops */
function useHandleCheck(handle: string) {
  const [state, setState] = useState<"invalid" | "checking" | "available" | "taken">("checking");
  useEffect(() => {
    if (!handlePattern.test(handle)) { setState("invalid"); return; }
    setState("checking");
    const t = window.setTimeout(() => setState(takenHandles.includes(handle) ? "taken" : "available"), 500);
    return () => window.clearTimeout(t);
  }, [handle]);
  return state;
}

const css = /* css */ `
/* Only what the onboarding doesn't have */
.ui-setup__about { padding-top: 4px; }
.ui-setup__about p { margin: 0; color: var(--text); font-size: 17px; line-height: 1.55; text-wrap: pretty; animation: ui-ob-rise 380ms var(--ease) both; }
.ui-setup__about small { color: var(--muted); font-size: var(--fs-body); line-height: 1.5; }
.ui-setup__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }

/* Agent: the found ones large, no box around their mark; then the accounts – ChatGPT, OpenRouter */
.ui-setup__agents { grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr)); }
/* The agents sit one surface up from the step card they're on (surface 3, in the app) */
.ui-setup__agents .ui-ob-template { background: var(--surface-4, var(--card)); }
.ui-setup__builtin { margin: 10px 0 0; color: var(--muted); font-size: var(--fs-caption); text-wrap: pretty; }
.ui-setup__agent-icon { display: grid; place-items: center; width: 40px; height: 40px; color: var(--ink); }
.ui-setup__installed { color: var(--ev-pass, #16a34a); font-size: 12.5px; font-weight: 550; }
:where(.dark, [data-theme="dark"]) .ui-setup__installed { color: #4ade80; }
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

/* How to install one, below the card */
.ui-setup__install { display: grid; gap: 12px; margin-top: 16px; padding: 16px 18px; background: var(--subtle); }
.ui-setup__install-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ui-setup__install h3 { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--ink); }
.ui-setup__install ol { display: grid; gap: 8px; margin: 0; padding-left: 18px; color: var(--text); font-size: 13px; line-height: 1.5; }
.ui-setup__install a { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }
.ui-setup__cmd { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding: 6px 6px 6px 12px; border-radius: calc(9px * var(--squircle-factor, 1)); background: var(--card); box-shadow: var(--shadow-2); }
.ui-setup__cmd code { flex: 1; min-width: 0; overflow-x: auto; font-family: var(--font-mono); font-size: 12px; white-space: nowrap; color: var(--ink); }
.ui-setup__cmd button { flex: none; height: 26px; padding: 0 10px; border-radius: calc(7px * var(--squircle-factor, 1)); background: var(--fluid-hover); color: var(--ink); font-size: 12px; font-weight: 550; }

/* Courses: the cards, ticked to install */
.ui-setup__courses { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ui-setup__course { position: relative; display: grid; border-radius: calc(12px * var(--squircle-factor, 1)); cursor: pointer; }
.ui-setup__course:has(:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.ui-setup__course[data-on] .ui-card { box-shadow: 0 0 0 2px var(--ink), var(--shadow-3); }
.ui-setup__later { margin: 14px 0 0; color: var(--muted); font-size: 13px; }
.ui-setup__later button { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }

/* Profile: whether the handle is free */
.ui-setup__handle { display: inline-flex; align-items: center; gap: 5px; }
.ui-setup__handle[data-state="available"] { color: var(--ev-pass, #16a34a); }
:where(.dark, [data-theme="dark"]) .ui-setup__handle[data-state="available"] { color: #4ade80; }
.ui-setup__handle[data-state="taken"] { color: var(--ev-fail, #dc2626); }

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
