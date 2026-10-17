import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { ColorSchemeChoices } from "~/components/agent-chat";
import { Icon } from "~/components/app-shell";
import { Button } from "~/components/button";
import { ChatGPTButton, ChatGPTLogo } from "~/components/chatgpt-button";
import { ColorCard, type CardShaderKind } from "~/components/color-card";
import { CodeEditor, Editor, EditorTabs } from "~/components/editor";
import { CodexIcon, OpenCodeIcon, PiIcon } from "~/components/harness-icons";
import { onboardingCss } from "~/components/onboarding";
import { SegmentedControl } from "~/components/segmented-control";
import { ArrowLeft01Icon, ArrowRight01Icon, ClaudeIcon, DoneIcon, GeminiIcon, MoonIcon, SunIcon, Tick02Icon, type IconGlyph } from "~/lib/icons";
import { editorSchemes, setPageMode, setUiPreferences, uiThemes, usePageMode, useUiPreferences } from "~/lib/ui-preferences";

/*
 * AgentSetup – a learner's first run, built from the affectUI onboarding's own parts (its stylesheet, its markup): the
 * greeting and the step wizard on top, the step in a card, and on the right, in larger type, a few lines on what the
 * step is for. The steps:
 *
 *   Agent      the coding agent Dojo teaches through – one found on this machine, or Continue with ChatGPT (the user's
 *              ChatGPT plan, via Sign in with ChatGPT). Required: no skipping. How to install one is below the card.
 *   Courses    the top courses as cards, ticked to install – or none, to pick later in Explore
 *   Profile    name, handle (dojo.foo/u/…, checked as it's typed) and age
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

export type SetupValues = { agent: string; courses: string[]; name: string; handle: string; age?: number; folder: string };
/** A course to offer: shown as its card – its color, its effect, who made it and its rating */
export type SetupCourse = { id: string; title: string; color: string; shader?: CardShaderKind; mark?: ReactNode; author: string; rating?: number; lessons?: number; hours?: number };

type Agent = { id: string; name: string; icon: IconGlyph; found: boolean; install: string; docs: string };
/** The agents Dojo supports, and what the scan found on this machine */
const agents: Agent[] = [
  { id: "claude", name: "Claude Code", icon: ClaudeIcon, found: true, install: "npm install -g @anthropic-ai/claude-code", docs: "docs.anthropic.com/claude-code" },
  { id: "codex", name: "Codex", icon: CodexIcon, found: true, install: "npm install -g @openai/codex", docs: "developers.openai.com/codex" },
  { id: "gemini", name: "Gemini CLI", icon: GeminiIcon, found: false, install: "npm install -g @google/gemini-cli", docs: "github.com/google-gemini/gemini-cli" },
  { id: "opencode", name: "OpenCode", icon: OpenCodeIcon, found: false, install: "brew install sst/tap/opencode", docs: "opencode.ai" },
  { id: "pi", name: "Pi", icon: PiIcon, found: false, install: "npm install -g @mariozechner/pi-coding-agent", docs: "github.com/badlogic/pi-mono" },
];

/** Handles already taken on dojo.foo – the check asks the server for these */
const takenHandles = ["sam", "admin", "dojo", "sensei", "kyoshi", "root"];
const handlePattern = /^[a-z0-9](?:[a-z0-9-]{1,22}[a-z0-9])$/;

/** Each step's card head, and what the right side says about it */
const copy: Record<(typeof setupSteps)[number]["id"], { heading: string; text: string; about: string; tip: string }> = {
  agent: { heading: "Pick your agent", text: "Dojo teaches through a coding agent – one already on this machine, or your ChatGPT plan.", about: "Lessons run on your machine. Your agent reads the kata, runs the tests and coaches you in the chat – Dojo talks to it, never to a model of its own.", tip: "None installed? The steps below get one going in a minute." },
  courses: { heading: "Pick your first courses", text: "The most loved ones to start with – tick any, or leave it for later.", about: "Each course is a git repository of chapters and lessons. Installing clones it into your workspace, so it works offline and updates like any repo.", tip: "Explore has every course, whenever you want more." },
  profile: { heading: "About you", text: "Your name, your handle on dojo.foo and, if you like, your age.", about: "Your handle is your page on dojo.foo – it signs your certificates and the courses you publish. Your age helps your Sensei pick its tone and examples.", tip: "Everything stays on this machine until you publish something." },
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
  const [chatgpt, setChatgpt] = useState<"idle" | "connecting" | "connected">("idle");
  const [scanning, setScanning] = useState(false);
  const [picked, setPicked] = useState<string[]>(() => courses.slice(0, 1).map((item) => item.id));
  const [name, setName] = useState("Sam Rivera");
  const [handle, setHandle] = useState("samrivera");
  const [age, setAge] = useState("");
  const [folder, setFolder] = useState("~/.dojo");
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
  const agentName = agent === "chatgpt" ? "ChatGPT (your plan)" : agents.find((item) => item.id === agent)?.name ?? "None";

  // Sign in with ChatGPT: the browser opens OpenAI's sign-in (OAuth with PKCE) and returns to a loopback listener with a
  // code, which Dojo exchanges for a token that runs the agent's requests on the user's ChatGPT plan
  const continueWithChatGPT = () => {
    setChatgpt("connecting");
    window.setTimeout(() => { setChatgpt("connected"); setAgent("chatgpt"); }, 1200);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (blocked) return;
    if (final) onFinish({ agent, courses: picked, name: name.trim(), handle, age: age ? Number(age) : undefined, folder });
    else onNext();
  };

  return (
    <div className="ui-ob ui-setup">
      <style href="ui-onboarding" precedence="default">{onboardingCss}</style>
      <style href="ui-agent-setup" precedence="default">{css}</style>
      <header className="ui-ob-head">
        <span className="ui-ob-kicker">Step {step + 1} of {setupSteps.length}</span>
        <h1 className="ui-ob-title">Welcome to Dojo, {firstName}</h1>
        <p className="ui-ob-sub">A few quick steps and your agent is ready to teach – about two minutes.</p>
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
                <button type="button" className="ui-setup__mode" aria-label={mode === "dark" ? "Switch to light" : "Switch to dark"} title={mode === "dark" ? "Light" : "Dark"} onClick={() => setPageMode(mode === "dark" ? "light" : "dark")}>
                  <Icon icon={mode === "dark" ? SunIcon : MoonIcon} size={18} />
                </button>
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
                          <span className="ui-ob-template__check" aria-hidden="true"><Icon icon={Tick02Icon} size={12} stroke={2.4} /></span>
                        </span>
                        <b className="ui-ob-template__name">{item.name}</b>
                        <span className="ui-setup__installed">Installed</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="ui-setup__or"><span>or</span></div>
                {chatgpt === "connected" ? (
                  <button type="button" role="radio" aria-checked={agent === "chatgpt"} className="ui-setup__plan" onClick={() => setAgent("chatgpt")}>
                    <ChatGPTLogo size={22} />
                    <span>
                      <b>You're using your ChatGPT plan</b>
                      <small>Your agent's requests run on your plan – manage usage in ChatGPT's settings.</small>
                    </span>
                    {agent === "chatgpt" && <Icon icon={DoneIcon} size={16} />}
                  </button>
                ) : (
                  <ChatGPTButton className="ui-setup__chatgpt" disabled={chatgpt === "connecting"} onClick={continueWithChatGPT} />
                )}
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
                        <ColorCard color={item.color} shader={item.shader} seed={item.id} mark={item.mark ?? item.author} figure={item.rating !== undefined ? `★ ${item.rating.toFixed(1)}` : undefined} title={item.title}
                          label={item.lessons ? `${item.lessons} lessons` : undefined} value={item.hours ? `~${item.hours} h` : undefined}
                          action={<span className="ui-setup__tick" aria-hidden="true">{on && <Icon icon={Tick02Icon} size={12} stroke={2.6} />}</span>} />
                      </label>
                    );
                  })}
                </div>
                <p className="ui-setup__later">
                  {picked.length ? <>{picked.length} to install. </> : <>Nothing picked – you'll choose in Explore later. </>}
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
                <label className="ui-ob-field ui-setup__age">
                  <span className="ui-ob-label">Age</span>
                  <input className="ui-ob-input" type="number" inputMode="numeric" min={6} max={120} value={age} placeholder="Optional" onChange={(event) => setAge(event.target.value.slice(0, 3))} />
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
                    <CodeEditor key={file} code={files[file]} filePath={`preview/${file}`} language="typescript" lessonApiBase="" readOnly coverage={false} onChange={() => {}} />
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
                  <div><dt>Age</dt><dd>{age || "Not given"}</dd></div>
                  <div><dt>Appearance</dt><dd>{mode === "dark" ? "Dark" : "Light"}</dd></div>
                  <div><dt>Theme</dt><dd>{uiThemes.find((theme) => theme.id === preferences.theme)?.label}</dd></div>
                  <div><dt>Color scheme</dt><dd>{preferences.editorScheme === "match" ? "Match theme" : editorSchemes.find((scheme) => scheme.id === preferences.editorScheme)?.label}</dd></div>
                </dl>
                <span className="ui-ob-hint">Start saves it all to {folder.replace(/\/$/, "")}/config.toml</span>
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
  const [which, setWhich] = useState(agents[0].name);
  const [copied, setCopied] = useState(false);
  const item = agents.find((entry) => entry.name === which)!;
  const copy = () => { navigator.clipboard?.writeText(item.install).catch(() => {}); setCopied(true); window.setTimeout(() => setCopied(false), 1400); };
  return (
    <section className="ui-setup__install" aria-labelledby="ui-setup-install">
      <div className="ui-setup__install-head">
        <h3 id="ui-setup-install">How to install an agent</h3>
        <Button size="sm" variant="ghost" loading={scanning} onClick={onRescan}>Rescan</Button>
      </div>
      <SegmentedControl size="compact" fill label="Agent to install" options={agents.map((entry) => entry.name)} value={which} onChange={setWhich} />
      <ol>
        <li>Run this in a terminal:
          <span className="ui-setup__cmd"><code>{item.install}</code><button type="button" onClick={copy}>{copied ? "Copied" : "Copy"}</button></span>
        </li>
        <li>Sign in when it asks – see <a href={`https://${item.docs}`} target="_blank" rel="noreferrer">{item.docs}</a>.</li>
        <li>Press Rescan, and it shows up above.</li>
      </ol>
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

/* Agent: the found ones large, no box around their mark; then the ChatGPT way */
.ui-setup__agents { grid-template-columns: repeat(auto-fill, minmax(min(100%, 11rem), 1fr)); }
.ui-setup__agent-icon { display: grid; place-items: center; width: 40px; height: 40px; color: var(--ink); }
.ui-setup__installed { color: var(--ev-pass, #16a34a); font-size: 12.5px; font-weight: 550; }
:where(.dark, [data-theme="dark"]) .ui-setup__installed { color: #4ade80; }
.ui-setup__or { display: flex; align-items: center; gap: 12px; margin: 20px 0 16px; color: var(--muted); font-size: 12px; }
.ui-setup__or::before, .ui-setup__or::after { content: ""; flex: 1; height: 1px; background: var(--fluid-hairline); }
.ui-setup__chatgpt { width: 100%; }
.ui-setup__plan { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border-radius: 12px; background: var(--fluid-hover); color: var(--ink); text-align: left; }
.ui-setup__plan[aria-checked="true"] { box-shadow: inset 0 0 0 1.5px var(--ink); }
.ui-setup__plan > span { display: grid; flex: 1; gap: 2px; }
.ui-setup__plan b { font-size: 13.5px; font-weight: 550; }
.ui-setup__plan small { color: var(--muted); font-size: 12.5px; line-height: 1.4; }

/* How to install one, below the card */
.ui-setup__install { display: grid; gap: 12px; margin-top: 16px; padding: 16px 18px; border-radius: 14px; background: var(--subtle); }
.ui-setup__install-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ui-setup__install h3 { margin: 0; font-size: 13.5px; font-weight: 600; color: var(--ink); }
.ui-setup__install ol { display: grid; gap: 8px; margin: 0; padding-left: 18px; color: var(--text); font-size: 13px; line-height: 1.5; }
.ui-setup__install a { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }
.ui-setup__cmd { display: flex; align-items: center; gap: 8px; margin-top: 6px; padding: 6px 6px 6px 12px; border-radius: 9px; background: var(--card); box-shadow: var(--shadow-2); }
.ui-setup__cmd code { flex: 1; min-width: 0; overflow-x: auto; font-family: var(--font-mono); font-size: 12px; white-space: nowrap; color: var(--ink); }
.ui-setup__cmd button { flex: none; height: 26px; padding: 0 10px; border-radius: 7px; background: var(--fluid-hover); color: var(--ink); font-size: 12px; font-weight: 550; }

/* Courses: the cards, ticked to install */
.ui-setup__courses { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ui-setup__course { position: relative; display: grid; border-radius: 12px; cursor: pointer; }
.ui-setup__course:has(:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.ui-setup__course[data-on] .ui-card { box-shadow: 0 0 0 2px var(--ink), var(--shadow-3); }
.ui-setup__tick { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 6px; box-shadow: inset 0 0 0 1.5px rgb(255 255 255 / 0.8); color: var(--fluid-foreground); }
.ui-setup__course[data-on] .ui-setup__tick { background: #fff; box-shadow: none; color: #111; }
.ui-setup__later { margin: 14px 0 0; color: var(--muted); font-size: 13px; }
.ui-setup__later button { color: var(--ink); text-decoration: underline; text-underline-offset: 2px; }

/* Profile: whether the handle is free */
.ui-setup__handle { display: inline-flex; align-items: center; gap: 5px; }
.ui-setup__handle[data-state="available"] { color: var(--ev-pass, #16a34a); }
:where(.dark, [data-theme="dark"]) .ui-setup__handle[data-state="available"] { color: #4ade80; }
.ui-setup__handle[data-state="taken"] { color: var(--ev-fail, #dc2626); }
.ui-setup__age { max-width: 9rem; }

/* Style: light or dark as one icon; theme and color scheme side by side; the code below, full width */
.ui-setup__mode { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: 10px; color: var(--ink); transition: background-color var(--motion-fast) var(--ease-fast); }
.ui-setup__mode:hover { background: var(--fluid-hover); }
.ui-setup__looks { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
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
