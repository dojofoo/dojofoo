/*
 * Agent Chat – a chat with an orchestrating agent and a brief beside it, in a single file.
 * The thread shows the agent's answer and which agents are working; the composer sits at the bottom.
 * On the right a brief to fill in: selling angle, palette and formats, then one button to generate.
 * Sits in the affectUI App Shell with the same composer as Assistant Home; Button from the library, icons from the Hugeicons free set.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode, type RefObject } from "react";
import {
  AiBrain01Icon,
  Analytics01Icon,
  ArrowRight01Icon,
  BubbleChatIcon,
  ChatAiIcon,
  Cancel01Icon,
  CheckListIcon,
  EvalsIcon,
  Folder01Icon,
  Home01Icon,
  Image01Icon,
  Megaphone01Icon,
  MoreHorizontalIcon,
  PaintBoardIcon,
  Settings04Icon,
  SidebarRightIcon,
  SlackIcon,
  Target02Icon,
  TaskDaily01Icon,
  UserGroupIcon,
  WorkflowSquare03Icon,
  InstagramIcon,
  TiktokIcon,
  Facebook01Icon,
  Calendar03Icon,
  Dollar01Icon,
  Location01Icon,
  PinIcon,
  PencilEdit02Icon,
  Share08Icon,
  Delete02Icon,
  File01Icon,
  UploadIcon,
  PlayIcon,
} from "~/lib/icons";
import { Button } from "~/components/button";
import { ChatMessages, Composer, useChatThread, type ChatReply } from "~/components/assistant-home";
import { AppShell, Dropdown, Icon, useShellNarrow, type AppShellProps, type ShellGroup, type ShellNavItem } from "~/components/app-shell";
import { CommandPalette } from "~/components/command-palette";
import { SegmentedControl } from "~/components/segmented-control";
import { Breadcrumbs, type Crumb } from "~/components/breadcrumbs";
import { editorSchemes, editorSizes, setPageMode, setUiPreferences, uiThemes, useEditorScheme, usePageMode, useUiPreferences } from "~/lib/ui-preferences";
import type { CommandGroup } from "~/components/command-menu";

/** Sample content – replace with your own data */
const nav: ShellNavItem[] = [
  { label: "Home", icon: Home01Icon },
  { label: "Chat", icon: BubbleChatIcon },
  { label: "Analytics", icon: Analytics01Icon },
  { label: "Plan", icon: TaskDaily01Icon },
  { label: "Deliverables", icon: Folder01Icon },
  { label: "On Slack", icon: SlackIcon },
];
const groups: ShellGroup[] = [
  {
    label: "Tools",
    items: [
      { label: "Campaign", icon: Megaphone01Icon },
      { label: "Creatives", icon: Image01Icon },
      { label: "Briefs", icon: CheckListIcon },
      { label: "Workflows", icon: WorkflowSquare03Icon },
    ],
  },
  { label: "Chats", items: [], empty: "No chats yet" },
];

const agents = [
  { label: "Campaign manager", icon: Megaphone01Icon },
  { label: "Brand research", icon: Target02Icon },
  { label: "Creative pipeline", icon: PaintBoardIcon },
  { label: "Audience research", icon: UserGroupIcon },
  { label: "Creative direction", icon: AiBrain01Icon },
];

const angles = [
  { label: "Desire-driven", note: "The first warm evening", signal: 3 },
  { label: "Problem–solution", note: "Heat, itchy fabrics", signal: 2 },
  { label: "Social proof", note: "412 sold, top reviews", signal: 1 },
];
const palette = [
  { name: "Sand", hex: "#e3d3b8" },
  { name: "Olive", hex: "#7c8458" },
  { name: "Off-white", hex: "#f4f1ea" },
  { name: "Ink", hex: "#1f2328" },
];
const formats = [
  { label: "Feed", ratio: "1 / 1" },
  { label: "Story", ratio: "9 / 16" },
  { label: "Banner", ratio: "16 / 9" },
];
const settingsSections = ["Lesson", "Sensei", "Assets"];
const channels = [
  { label: "Instagram", note: "Feed and Stories", icon: InstagramIcon, on: true },
  { label: "TikTok", note: "Story format only", icon: TiktokIcon, on: true },
  { label: "Facebook", note: "Feed and Banner", icon: Facebook01Icon, on: false },
];
const details = [
  { label: "Launch", value: "Mon, Jun 2", icon: Calendar03Icon },
  { label: "Budget", value: "$2,400 / week", icon: Dollar01Icon },
  { label: "Markets", value: "US, UK, AU", icon: Location01Icon },
];

export type AgentChatScreenProps = Pick<AppShellProps, "onNavigate" | "workspace" | "user" | "className">;

/** The example's shell and chat surfaces, with authored content in place of the brief. */
/**
 * The original agent chat window with a lesson IDE in place of the thread. The conversation sits beside the
 * window on the page; opening the settings widens the window over it, so it reads like the original chat.
 */
export function AgentChatWorkspace({ crumbs, editor, details, evals, header, composer, children, scroller, defaultSettingsOpen = false, defaultEvalsOpen = false, commands = [], onCommand, ...shell }: Omit<AppShellProps, "children" | "aside" | "asideColumns" | "asideCovered"> & {
  /** The trail in the window's toolbar – e.g. the mode, then the chapter; "Evals" follows while they are open */
  crumbs: Crumb[];
  editor: ReactNode;
  /** About what is open, e.g. the current lesson. Frames the editor as a 16:9 card with this below it, like the composer;
      without an editor (a course's page with no video) it fills the window */
  details?: ReactNode;
  /** The evaluations; the checklist button in the toolbar swaps them in for the IDE */
  evals?: ReactNode;
  header: ReactNode;
  composer: ReactNode;
  children: ReactNode;
  scroller?: RefObject<HTMLDivElement | null>;
  /** Start with the settings (the brief) open */
  defaultSettingsOpen?: boolean;
  /** Start with the evaluations in place of the IDE */
  defaultEvalsOpen?: boolean;
  /** More groups for the command menu (⌥K or the sidebar's search), after the workspace's own */
  commands?: CommandGroup[];
  /** Runs a command from those groups, or "ask" with the typed text */
  onCommand?: (id: string, query?: string) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(defaultSettingsOpen);
  const toggleSettings = () => setSettingsOpen((open) => !open);
  // Narrow only: the conversation is a sheet that slides in from the right, pushing the window left
  const [chatOpen, setChatOpen] = useState(false);
  const [evalsOpen, setEvalsOpen] = useState(defaultEvalsOpen);
  const showEvals = Boolean(evals) && evalsOpen;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const workspaceCommands: CommandGroup = { id: "workspace", label: "Workspace", commands: [
    ...(evals ? [{ id: "workspace:evals", label: evalsOpen ? "Show the editor" : "Show evals", icon: <Icon icon={EvalsIcon} size={16} />, keywords: "evaluation results trial" }] : []),
    { id: "workspace:settings", label: settingsOpen ? "Hide settings" : "Show settings", icon: <Icon icon={Settings04Icon} size={16} />, keywords: "brief" },
  ] };
  const runCommand = (id: string, query?: string) => {
    if (id === "workspace:evals") setEvalsOpen(open => !open);
    else if (id === "workspace:settings") toggleSettings();
    else onCommand?.(id, query);
  };
  const conversation = <section aria-label="Course conversation" className="ui-as-chat__main" data-surface="page">
    <header className="ui-as-chat__bar">
      {header}
      <button type="button" className="ui-as-icon-btn ui-as-chat__narrow" aria-label="Close chat" onClick={() => setChatOpen(false)}>
        <Icon icon={Cancel01Icon} size={15} />
      </button>
    </header>
    <div ref={scroller} className="ui-as-chat__thread scroll-fade"><div className="ui-as-chat__column">{children}</div></div>
    <div className="ui-as-chat__composer">{composer}</div>
  </section>;
  // The app's split: IDE and conversation in the golden ratio. Opened, the brief takes the conversation's column.
  // Only the conversation has a floor: where the shell is too narrow for the split (900px up to about 1120px, with the
  // sidebar open), the IDE gives way, never the page – its content answers to its own width
  return <AppShell {...shell} onSearch={() => setPaletteOpen(true)} aside={conversation} asideColumns="minmax(0, 1.618fr) minmax(22rem, 1fr)" asideCovered={settingsOpen} asideOpen={chatOpen} onAsideOpenChange={setChatOpen}
    // Narrow, the settings are a drawer from the right, like the sidebar's; wide, they cover the conversation's column
    drawer={<SettingsPanel onClose={() => setSettingsOpen(false)} />} drawerOpen={settingsOpen} onDrawerOpenChange={setSettingsOpen}>
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={[...commands, workspaceCommands]} onRun={runCommand} placeholder="Search lessons, files and commands…" />
    <style href="ui-screen-agent-chat" precedence="default">{css}</style>
    <div className="ui-as-chat" data-brief={settingsOpen || undefined}>
      <section aria-label="Course editor" className="ui-as-chat__main ui-as-chat__ide">
        <header className="ui-as-chat__bar">
          <span className="ui-as-chat__crumbs">
            <Breadcrumbs items={showEvals ? [...crumbs.slice(0, -1), { ...crumbs[crumbs.length - 1], onClick: () => setEvalsOpen(false) }, { label: "Evals" }] : crumbs} />
          </span>
          <span className="ui-as-chat__tools">
            {evals && <button type="button" className="ui-as-icon-btn" aria-label={evalsOpen ? "Hide evals" : "Show evals"} aria-pressed={evalsOpen} onClick={() => setEvalsOpen(open => !open)}>
              <Icon icon={EvalsIcon} size={16} />
            </button>}
            <button type="button" className="ui-as-icon-btn" aria-label={settingsOpen ? "Hide settings" : "Show settings"} aria-pressed={settingsOpen} onClick={toggleSettings}>
              <Icon icon={Settings04Icon} size={16} />
            </button>
            <button type="button" className="ui-as-icon-btn ui-as-chat__narrow" aria-label="Show chat" onClick={() => setChatOpen(true)}>
              <Icon icon={ChatAiIcon} size={16} />
            </button>
          </span>
        </header>
        {showEvals ? <div className="ui-as-chat__evals scroll-fade" aria-label="Evals" role="region">{evals}</div>
          : <div className="ui-as-chat__editor" data-details={details ? "" : undefined}>
            {details ? <>{editor && <div className="ui-as-chat__code">{editor}</div>}<div className="ui-as-chat__details scroll-fade">{details}</div></> : editor}
          </div>}
      </section>
      {settingsOpen && <WideOnly><SettingsPanel onClose={() => setSettingsOpen(false)} /></WideOnly>}
    </div>
  </AppShell>;
}

export function AgentChatScreen(props: AgentChatScreenProps) {
  const [angle, setAngle] = useState(angles[0].label);
  const [briefOpen, setBriefOpen] = useState(true);
  const [pinned, setPinned] = useState(false);
  const thread = useRef<HTMLDivElement>(null);
  // On a narrow panel the brief opens as a layer over the chat, so it starts closed there
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if ((root.current?.offsetWidth ?? Infinity) <= 900) setBriefOpen(false);
  }, []);

  // Prepared answers of the orchestrator – they pick up the angle chosen in the brief
  const chat = useChatThread((prompt): ChatReply => ({
    steps: [
      { kind: "step", label: "Reading the brief" },
      { kind: "step", label: "Checking 412 orders of the Linen Overshirt" },
      { kind: "step", label: "Lining up the creative pipeline" },
    ],
    paragraphs: /angle|desire|problem|proof/i.test(prompt)
      ? [
          `Good call. I'll go with ${angle.toLowerCase()} – it fits the bestseller and the summer launch.`,
          "Copy will lead with the moment, the product follows; every ad ends on the same offer.",
          "Hit Generate ads in the brief when you're ready – six ads take about two minutes.",
        ]
      : [
          `Noted: “${prompt}”. I've added it to the brief for the creative pipeline.`,
          `The angle stays ${angle.toLowerCase()}; Brand research is checking that the copy stays on brand.`,
          "Anything else before I generate the ads?",
        ],
  }));


  return (
    <AppShell active="Chat" nav={nav} groups={groups} {...props}>
      <style href="ui-screen-agent-chat" precedence="default">
        {css}
      </style>
      <div ref={root} className="ui-as-chat" data-brief={briefOpen || undefined}>
        <section className="ui-as-chat__main">
          <header className="ui-as-chat__bar">
            <span className="ui-as-chat__crumbs">
              <Icon icon={BubbleChatIcon} size={15} />
              Chat <i>/</i> <b>Generate on-brand creative</b>
              <Dropdown
                items={[
                  { label: pinned ? "Unpin chat" : "Pin chat", icon: PinIcon, onSelect: () => setPinned((p) => !p) },
                  { label: "Rename", icon: PencilEdit02Icon },
                  { label: "Share", icon: Share08Icon },
                  { label: "Delete chat", icon: Delete02Icon, danger: true },
                ]}
                trigger={({ open, toggle }) => (
                  <button type="button" className="ui-as-icon-btn" aria-label="Chat options" aria-expanded={open} onClick={toggle}>
                    <Icon icon={MoreHorizontalIcon} size={15} />
                  </button>
                )}
              />
            </span>
            <span className="ui-as-chat__tools">
              <button type="button" className="ui-as-icon-btn" aria-label="Tasks">
                <Icon icon={CheckListIcon} size={16} />
              </button>
              <button
                type="button"
                className="ui-as-icon-btn"
                aria-label={briefOpen ? "Hide brief" : "Show brief"}
                aria-pressed={briefOpen}
                onClick={() => setBriefOpen((o) => !o)}
              >
                <Icon icon={SidebarRightIcon} size={16} />
              </button>
            </span>
          </header>

          <div ref={thread} className="ui-as-chat__thread">
            <div className="ui-as-chat__column">
              <p className="ui-as-chat__user">Desire-driven</p>

              <div className="ui-as-chat__answer">
                <span className="ui-as-chat__who">
                  <span className="ui-as-chat__avatar">
                    <Icon icon={AiBrain01Icon} size={12} />
                  </span>
                  Orchestrator
                </span>
                <p>I&apos;ll pull your bestseller first, then line up the creative generation.</p>
                <span className="ui-as-chat__worked">
                  <Icon icon={ArrowRight01Icon} size={13} />
                  Worked for 3m 38s
                </span>
                <p>
                  Your bestseller is the Linen Overshirt (the only product synced so far – Shopify is still importing, so
                  treat that ranking as provisional).
                </p>
                <p>
                  Before I brief and generate the ads, I need one thing I can&apos;t infer, because it drives the whole copy
                  structure: how should we sell this shirt?
                </p>

                <span className="ui-as-chat__label">Agents working</span>
                <div className="ui-as-chat__agents">
                  {agents.map((a, i) => (
                    <span key={a.label} className="ui-as-chat__agent" data-active={i === 0 || undefined}>
                      <Icon icon={a.icon} size={14} />
                      {a.label}
                    </span>
                  ))}
                </div>
              </div>
              <ChatMessages messages={chat.messages} name="Orchestrator" scroller={thread} onDone={chat.finish} />
            </div>
          </div>

          <div className="ui-as-chat__composer">
            <span className="ui-as-chat__route">
              <span className="ui-as-chat__avatar">
                <Icon icon={AiBrain01Icon} size={12} />
              </span>
              <b>Orchestrator</b> Routes each request
            </span>
            <Composer placeholder="Ask anything or @ to add context" onSend={chat.send} busy={chat.busy} />
          </div>
        </section>

        {/* Narrow only: dims the chat behind the brief layer; a tap closes it */}
        {briefOpen && <div className="ui-as-chat__scrim" aria-hidden="true" onClick={() => setBriefOpen(false)} />}
        {briefOpen && <SettingsPanel onClose={() => setBriefOpen(false)} />}
      </div>
    </AppShell>
  );
}

/** How Sensei coaches the learner – one at a time */
const guidance = [
  { id: "socratic", label: "Socratic", note: "Asks before it tells" },
  { id: "hints", label: "Hints", note: "Nudges toward the next step" },
  { id: "direct", label: "Direct", note: "Explains the fix" },
];
const senseiRules = [
  { id: "predict", label: "Predict first", note: "A guess before every run" },
  { id: "reveal", label: "Reveal the solution", note: "After three attempts" },
];

type SettingsDraft = { theme: string; editorScheme: string; density: string; editorSize: number; channels: string[]; guidance: string; rules: string[] };
/** How many settings differ between two drafts – each channel and rule on its own */
function countChanges(a: SettingsDraft, b: SettingsDraft) {
  const flips = (x: string[], y: string[]) => x.filter((v) => !y.includes(v)).length + y.filter((v) => !x.includes(v)).length;
  return Number(a.theme !== b.theme) + Number(a.editorScheme !== b.editorScheme) + Number(a.density !== b.density) + Number(a.editorSize !== b.editorSize) + Number(a.guidance !== b.guidance) + flips(a.channels, b.channels) + flips(a.rules, b.rules);
}

type Asset = { id: string; name: string; type: string; size: number; preview?: string };
const fileSize = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The workspace's settings: the lesson, Sensei and assets as tabs. Header, tabs and the save row stay; only the settings scroll */
/** What only shows while the shell is wide – narrow, the shell's drawer has it */
function WideOnly({ children }: { children: ReactNode }) {
  return useShellNarrow() ? null : children;
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const preferences = useUiPreferences();
  const mode = usePageMode();
  const [section, setSection] = useState(settingsSections[0]);
  const [active, setActive] = useState(() => new Set(channels.filter((c) => c.on).map((c) => c.label)));
  const [coaching, setCoaching] = useState(guidance[0].id);
  const [rules, setRules] = useState(() => new Set(["predict"]));
  const flip = (set: Set<string>, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  // Changes count against the last save; the theme and type still preview live
  const draft: SettingsDraft = { theme: preferences.theme, editorScheme: preferences.editorScheme, density: preferences.density, editorSize: preferences.editorSize, channels: [...active], guidance: coaching, rules: [...rules] };
  const [saved, setSaved] = useState(draft);
  const changes = countChanges(draft, saved);

  return (
    <aside className="ui-as-brief" aria-label="Settings">
      <header className="ui-as-chat__bar">
        <span className="ui-as-chat__crumbs">
          <b>Settings</b>
        </span>
        <button type="button" className="ui-as-icon-btn" aria-label="Close settings" onClick={onClose}>
          <Icon icon={Cancel01Icon} size={15} />
        </button>
      </header>
      <SegmentedControl kind="tabs" fill label="Settings sections" options={settingsSections} value={section} onChange={setSection} className="ui-as-brief__seg" />

      <div className="ui-as-brief__body scroll-fade">
        {section === "Lesson" && (
          <div className="ui-as-brief__panel" key="lesson">
            {/* The page's mode, light or dark – the theme's colors below follow it */}
            <section className="ui-as-brief__mode">
              <SegmentedControl fill label="Appearance" options={["Light", "Dark"]} value={mode === "dark" ? "Dark" : "Light"} onChange={(next) => setPageMode(next === "Dark" ? "dark" : "light")} />
            </section>

            {/* Settings for the interface itself: the theme's colors and the type, for the UI and the editor */}
            <section className="ui-as-brief__section" role="radiogroup" aria-label="Theme">
              <span className="ui-as-brief__label">Theme</span>
              {uiThemes.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  role="radio"
                  aria-checked={preferences.theme === theme.id}
                  className="ui-as-brief__option"
                  onClick={() => setUiPreferences({ theme: theme.id })}
                >
                  <span className="ui-as-brief__radio" aria-hidden="true" />
                  <span className="ui-as-brief__name">
                    {theme.label}
                    <small>{theme.note}</small>
                  </span>
                  <span className="ui-as-brief__swatches" aria-hidden="true">
                    {theme.swatches.map((color, i) => (
                      <i key={i} style={{ background: color }} />
                    ))}
                  </span>
                </button>
              ))}
            </section>

            <ColorSchemes />

            <section className="ui-as-brief__section">
              <span className="ui-as-brief__label">Typography</span>
              <div className="ui-as-brief__type" role="group" aria-label="Interface type">
                <span>Interface</span>
                <div className="ui-as-brief__pills">
                  {(["default", "compact"] as const).map((density) => (
                    <button key={density} type="button" aria-pressed={preferences.density === density} onClick={() => setUiPreferences({ density })}>
                      {density === "default" ? "Default" : "Compact"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ui-as-brief__type" role="group" aria-label="Editor type size">
                <span>Editor</span>
                <div className="ui-as-brief__pills">
                  {editorSizes.map((size) => (
                    <button key={size} type="button" aria-pressed={preferences.editorSize === size} onClick={() => setUiPreferences({ editorSize: size })}>
                      {size}px
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="ui-as-brief__section">
              <span className="ui-as-brief__label">Channels</span>
              {channels.map((c) => (
                <label key={c.label} className="ui-as-brief__channel">
                  <Icon icon={c.icon} size={16} />
                  <span className="ui-as-brief__name">
                    {c.label}
                    <small>{c.note}</small>
                  </span>
                  <input type="checkbox" className="ui-as-switch" checked={active.has(c.label)} onChange={() => setActive((prev) => flip(prev, c.label))} />
                </label>
              ))}
            </section>

            <section className="ui-as-brief__section ui-as-brief__section--split">
              <div>
                <span className="ui-as-brief__label">Palette</span>
                <div className="ui-as-brief__swatches">
                  {palette.map((c) => (
                    <span key={c.name}>
                      <i style={{ background: c.hex }} />
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <span className="ui-as-brief__label">Formats</span>
                <div className="ui-as-brief__formats">
                  {formats.map((f) => (
                    <span key={f.label}>
                      <i style={{ aspectRatio: f.ratio }} />
                      {f.label}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="ui-as-brief__section">
              <span className="ui-as-brief__label">Details</span>
              <dl className="ui-as-brief__details">
                {details.map((d) => (
                  <div key={d.label}>
                    <dt>
                      <Icon icon={d.icon} size={14} />
                      {d.label}
                    </dt>
                    <dd>{d.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
        )}

        {section === "Sensei" && (
          <div className="ui-as-brief__panel" key="sensei">
            <section className="ui-as-brief__section ui-as-brief__section--first" role="radiogroup" aria-label="Guidance">
              <span className="ui-as-brief__label">Guidance</span>
              {guidance.map((g) => (
                <button key={g.id} type="button" role="radio" aria-checked={coaching === g.id} className="ui-as-brief__option" onClick={() => setCoaching(g.id)}>
                  <span className="ui-as-brief__radio" aria-hidden="true" />
                  <span className="ui-as-brief__name">
                    {g.label}
                    <small>{g.note}</small>
                  </span>
                </button>
              ))}
            </section>
            <section className="ui-as-brief__section">
              <span className="ui-as-brief__label">Rules</span>
              {senseiRules.map((r) => (
                <label key={r.id} className="ui-as-brief__channel">
                  <span className="ui-as-brief__name">
                    {r.label}
                    <small>{r.note}</small>
                  </span>
                  <input type="checkbox" className="ui-as-switch" checked={rules.has(r.id)} onChange={() => setRules((prev) => flip(prev, r.id))} />
                </label>
              ))}
            </section>
          </div>
        )}

        {section === "Assets" && <AssetsPanel />}
      </div>

      <footer className="ui-as-brief__go">
        <span className="ui-as-brief__tags">
          <span>{changes === 0 ? "No changes" : changes === 1 ? "1 change" : `${changes} changes`}</span>
        </span>
        <Button size="sm" onClick={() => setSaved(draft)} disabled={changes === 0}>
          Save
        </Button>
      </footer>
    </aside>
  );
}

/** A scheme's own colors for its swatches: its keyword, string and function colors */
function schemeSwatches(theme: Record<string, unknown>) {
  const rules = (theme.tokenColors ?? []) as { scope?: string | string[]; settings?: { foreground?: string } }[];
  // Scopes come as a list or a comma-separated string; "keyword" also takes "keyword.control" and the like
  const scopes = (rule: (typeof rules)[number]) => [rule.scope].flat().flatMap((scope) => scope?.split(",") ?? []).map((scope) => scope.trim());
  const find = (scope: string) => rules.find((rule) => rule.settings?.foreground && scopes(rule).some((s) => s === scope || s.startsWith(`${scope}.`)))?.settings?.foreground;
  return [find("keyword") ?? find("storage"), find("string"), find("entity.name.function") ?? find("support.function") ?? find("entity.name") ?? find("entity")].filter(Boolean) as string[];
}

/** The settings' color scheme choices on their own, styles included – for other screens that set the scheme; without
    notes, each is just its name and swatches */
export function ColorSchemeChoices({ notes = true }: { notes?: boolean }) {
  return <><style href="ui-screen-agent-chat" precedence="default">{css}</style><ColorSchemes notes={notes} /></>;
}

/** The editor's color scheme, apart from the theme: match the theme, or any scheme with any theme to compare */
function ColorSchemes({ notes = true }: { notes?: boolean }) {
  const preferences = useUiPreferences();
  const current = useEditorScheme();
  const options = [{ id: "match", label: "Match theme", note: `Now ${current.label}`, swatches: [] as string[] }, ...editorSchemes.map((scheme) => ({ id: scheme.id, label: scheme.label, note: scheme.light ? "Light and dark, with the page" : scheme.type === "dark" ? "Dark" : "Light", swatches: schemeSwatches(scheme.theme) }))];
  return (
    <section className="ui-as-brief__section" role="radiogroup" aria-label="Color scheme">
      <span className="ui-as-brief__label">Color scheme</span>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={preferences.editorScheme === option.id}
          className="ui-as-brief__option"
          onClick={() => setUiPreferences({ editorScheme: option.id as typeof preferences.editorScheme })}
        >
          <span className="ui-as-brief__radio" aria-hidden="true" />
          <span className="ui-as-brief__name">
            {option.label}
            {notes && <small>{option.note}</small>}
          </span>
          <span className="ui-as-brief__swatches" aria-hidden="true">
            {option.swatches.map((color, i) => (
              <i key={i} style={{ background: color }} />
            ))}
          </span>
        </button>
      ))}
    </section>
  );
}

/** Assets: the empty state, or the uploads as tiles – the whole tab takes files dropped on it */
function AssetsPanel() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const previews = useRef<string[]>([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const add = (files: FileList | null) => {
    if (!files?.length) return;
    const next = [...files].map((file) => {
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      if (preview) previews.current.push(preview);
      return { id: `${file.name}:${file.size}:${file.lastModified}:${Math.random()}`, name: file.name, type: file.type, size: file.size, preview };
    });
    setAssets((prev) => [...prev, ...next]);
  };
  const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");
  // Enter and leave fire for every child crossed: count the depth, so the zone only lets go when the pointer leaves it
  const drop = {
    onDragEnter: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      add(event.dataTransfer.files);
    },
  };
  const upload = (variant?: "secondary") => (
    <>
      <Button size="sm" variant={variant} onClick={() => input.current?.click()}>
        Upload
      </Button>
      <input ref={input} type="file" multiple hidden onChange={(event) => { add(event.currentTarget.files); event.currentTarget.value = ""; }} />
    </>
  );

  return (
    <div className="ui-as-brief__panel ui-as-brief__assets" key="assets" data-dragging={dragging || undefined} {...drop}>
      {assets.length ? (
        <>
          <div className="ui-as-brief__assets-head">
            <span className="ui-as-brief__label">{assets.length === 1 ? "1 asset" : `${assets.length} assets`}</span>
            {upload("secondary")}
          </div>
          <div className="ui-as-ads">
            {assets.map((asset, i) => (
              <figure key={asset.id} className="ui-as-ad ui-as-rise" style={{ "--i": i } as CSSProperties}>
                <span className="ui-as-ad__art ui-as-ad__art--file">
                  {asset.preview ? <img src={asset.preview} alt="" /> : <Icon icon={asset.type.startsWith("video/") ? PlayIcon : File01Icon} size={22} />}
                </span>
                <figcaption>
                  <span className="ui-as-ad__name">{asset.name}</span>
                  <span>{fileSize(asset.size)}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : (
        <div className="ui-as-brief__empty ui-as-rise">
          <span>
            <Icon icon={UploadIcon} size={18} />
          </span>
          <b>{dragging ? "Drop to upload" : "No assets yet"}</b>
          <p>{dragging ? "Images, video and files – they show up here." : "Upload files or drop them here – they show up here."}</p>
          {upload("secondary")}
        </div>
      )}
    </div>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
/* Agent chat: thread and composer on the left, the brief as a panel on the right */
.ui-as-chat { position: relative; display: flex; height: 100%; min-height: 0; }
/* The window's shadow, drawn again over everything in it: its inner parts on the window itself would sit under the
   editor, the settings and their footer, which paint their own surfaces (the outer parts are clipped here) */
.ui-as-chat::after { content: ""; position: absolute; z-index: 20; inset: 0; border-radius: var(--radius-panel); box-shadow: var(--shadow-3); pointer-events: none; }
.ui-as-main:has(> .ui-as-chat) { box-shadow: var(--shadow-3-outer); }
.ui-as-chat__main { display: flex; flex: 1; flex-direction: column; min-width: 0; }

.ui-as-chat__bar {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  height: 52px;
  padding: 0 12px 0 20px;
  border-bottom: 1px solid var(--line-soft);
  color: var(--muted);
}
.ui-as-chat__crumbs { display: flex; align-items: center; gap: 8px; font-size: var(--fs-body); }
.ui-as-chat__crumbs i { font-style: normal; color: var(--faint); }
.ui-as-chat__crumbs b { font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-as-chat__crumbs .ui-as-icon-btn { width: 24px; height: 24px; margin-left: -2px; }
/* The trail takes what the tools leave, short of a clear gap before them, and shortens from the left to fit */
.ui-as-chat__ide .ui-as-chat__crumbs { flex: 1; min-width: 0; margin-right: 16px; }
.ui-as-chat__tools { display: flex; gap: 2px; }
.ui-as-chat__tools .ui-as-icon-btn[aria-pressed="true"] { background: var(--chip); color: var(--ink); }

.ui-as-chat__thread { flex: 1; min-height: 0; overflow-y: auto; padding: 40px 32px 16px; }
.ui-as-chat__column { display: flex; flex-direction: column; gap: 22px; max-width: 680px; margin: 0 auto; }
.ui-as-chat__user {
  align-self: flex-end;
  margin: 0;
  padding: 8px 14px;
  border-radius: 14px;
  background: var(--chip);
  font-size: var(--fs-subtitle);
  color: var(--ink);
}
.ui-as-chat__answer {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  font-size: var(--fs-subtitle);
  line-height: 1.6;
  color: var(--ink);
}
.ui-as-chat__answer p { margin: 0; }
.ui-as-chat__who, .ui-as-chat__route { display: flex; align-items: center; gap: 8px; font-weight: 550; font-variation-settings: "opsz" 18; }
.ui-as-chat__avatar {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--chip);
  color: var(--ink);
}
.ui-as-chat__worked { display: flex; align-items: center; gap: 6px; font-size: var(--fs-body); color: var(--muted); }
.ui-as-chat__label { padding-top: 4px; font-size: var(--fs-caption); color: var(--muted); }
.ui-as-chat__agents { display: flex; flex-wrap: wrap; gap: 6px; margin-top: -6px; }
.ui-as-chat__agent {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 30px;
  padding: 0 12px 0 10px;
  border-radius: 999px;
  box-shadow: var(--shadow-2);
  font-size: var(--fs-body);
  color: var(--text);
}
.ui-as-chat__agent svg { color: var(--muted); }
.ui-as-chat__agent[data-active] { background: var(--chip); box-shadow: none; color: var(--ink); }
.ui-as-chat__agent[data-active] svg { color: var(--ink); }

.ui-as-chat__composer { display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 744px; margin: 0 auto; padding: 8px 32px 24px; }
.ui-as-chat__route { font-size: var(--fs-body); font-weight: 400; color: var(--muted); }

/* Workspace with the settings open: the window lays the IDE and the brief on the shell's own columns, so the brief
   covers the conversation exactly and the IDE stays put – the brief's hairline lands where the window's edge was.
   A size container can't be a subgrid (its layout is contained), so the window stops being one while it's this wide */
.ui-as-app[data-aside-covered] > .ui-as-main:has(> .ui-as-chat) { container-type: normal; display: grid; grid-template-columns: subgrid; grid-template-rows: minmax(0, 1fr); }
.ui-as-app[data-aside-covered] > .ui-as-main > .ui-as-chat { display: grid; grid-column: 1 / -1; grid-template-columns: subgrid; grid-template-rows: minmax(0, 1fr); }
.ui-as-app[data-aside-covered] > .ui-as-main > .ui-as-chat > * { min-height: 0; }
.ui-as-app[data-aside-covered] > .ui-as-main > .ui-as-chat > .ui-as-brief { width: auto; }
/* The IDE column answers the window's container queries itself, so what's in it (the evals) lays out the same with
   the settings open or closed: the column keeps its width either way, the window doesn't */
.ui-as-chat__ide { container: ui-as-main / inline-size; }
/* The evals sit under the IDE's toolbar, so their header needs no room for the sidebar's button */
.ui-as-chat__evals .ui-ev { --ui-ev-corner: 0px; }

/* IDE in place of the thread: a 16:9 code card with the lesson's details below it. Surfaces follow the elevation
   ladder (styles/fluid.css): the window is surface 2, so its cards are surface 3 with shadow 3 */
.ui-as-chat__evals { position: relative; flex: 1; min-height: 0; overflow-y: auto; }
/* Its own stacking context, so a stage's ambient glow (z-index -1) sits behind the stage and the details, on the window */
.ui-as-chat__editor { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; isolation: isolate; }
/* The stage (editor, slides, video) runs the column's full width right under the toolbar, as part of the UI */
.ui-as-chat__editor[data-details] { padding: 0; }
.ui-as-chat__code {
  display: flex;
  flex: none;
  flex-direction: column;
  width: 100%;
  aspect-ratio: 16 / 9;
  /* A short panel keeps room for the first lines of the details */
  max-height: calc(100% - 7rem);
  min-height: 0;
  box-shadow: 0 1px 0 var(--line);
}
/* The editor draws its own card (surface 3, its shadow and inner edge) – see components/editor */
.ui-as-chat__code > * { flex: 1; min-height: 0; }
.ui-as-chat__details { flex: 1; min-height: 0; overflow-y: auto; padding: 24px 24px 20px; color: var(--muted); font-size: var(--fs-body); line-height: var(--lh-body); }


/* Conversation on the page surface: no frame or rule; the thread fades where there is more to scroll */
.ui-as-chat__main[data-surface="page"] { height: 100%; }
/* Same height and line as the window's toolbar across the gap */
.ui-as-chat__main[data-surface="page"] > .ui-as-chat__bar { height: 52px; margin-top: var(--frame-gap); padding: 0 16px 0 20px; border-bottom: 0; }
.ui-as-chat__main[data-surface="page"] > .ui-as-chat__thread { padding: 16px 20px 24px; }
.ui-as-chat__main[data-surface="page"] > .ui-as-chat__composer { padding: 0 12px var(--frame-gap); }
/* The composer's card is the code card's twin: surface 3 with shadow 3. Its corners follow the window's outer
   corners, since it sits beside the window on the page */
.ui-as-chat__main[data-surface="page"] .ui-as-composer__card {
  border-radius: var(--radius-panel);
  background: var(--surface-3);
  box-shadow: var(--shadow-3);
}
.ui-as-chat__route b { font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
/* An agent's dot – the one its answers carry (ThinkingState's who), in the theme's brand color */
.ui-as-chat__dot { flex: none; width: 18px; height: 18px; border-radius: 50%; background: var(--brand); }
/* The agent in the conversation's bar: dot and name stay, the description shortens to fit */
.ui-as-chat__speaker { min-width: 0; padding-left: 0; }
.ui-as-chat__speaker b { flex: none; }
.ui-as-chat__speaker-note { overflow: hidden; min-width: 0; white-space: nowrap; text-overflow: ellipsis; }

/* Settings panel: the bar, the tabs and the save row stay; only the settings between them scroll (and fade) */
.ui-as-brief { position: relative; display: flex; flex: none; flex-direction: column; width: 400px; }
/* The divider stops short of the window's edges, so it never crosses the window's own inner edge */
.ui-as-brief::before { content: ""; position: absolute; z-index: 1; top: 1px; bottom: 1px; left: 0; width: 1px; background: var(--line-soft); pointer-events: none; }

.ui-as-brief__body { display: flex; flex: 1; flex-direction: column; min-height: 0; overflow-y: auto; }
/* The tabs are the shared segmented control; only their place in the brief is set here */
.ui-as-brief__seg { flex: none; margin: 20px 20px 4px; width: auto !important; }

.ui-as-brief__mode { margin: 18px 20px 6px; }

.ui-as-brief__section { display: flex; flex-direction: column; padding: 18px 20px; border-top: 1px solid var(--line-soft); }
.ui-as-brief__mode + .ui-as-brief__section { margin-top: 14px; }
.ui-as-brief__section--first { border-top: 0; }
.ui-as-brief__section--split { flex-direction: row; justify-content: space-between; gap: 16px; }
.ui-as-brief__label { padding-bottom: 12px; font-size: var(--fs-caption); font-weight: 550; font-variation-settings: "opsz" 18; line-height: 16px; color: var(--faint); }

.ui-as-brief__option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 46px;
  margin: 0 -10px;
  padding: 0 10px;
  border-radius: 10px;
  color: var(--muted);
  text-align: left;
  transition: background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast), box-shadow var(--motion-fast) var(--ease-fast);
}
.ui-as-brief__option:hover { background: var(--hover); color: var(--ink); }
.ui-as-brief__option[aria-checked="true"] { background: var(--chip); color: var(--ink); }
.ui-as-brief__radio { flex: none; width: 14px; height: 14px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--line-strong); transition: box-shadow var(--motion-fast) var(--ease-fast); }
.ui-as-brief__option[aria-checked="true"] .ui-as-brief__radio { box-shadow: inset 0 0 0 4px var(--ink); }
.ui-as-brief__name { display: flex; flex: 1; flex-direction: column; min-width: 0; font-size: var(--fs-body); font-weight: 550; font-variation-settings: "opsz" 18; line-height: 18px; color: var(--ink); }
.ui-as-brief__option .ui-as-brief__name { color: inherit; }
.ui-as-brief__name small { font-size: var(--fs-caption); font-weight: 400; line-height: 17px; color: var(--faint); }
/* Each theme's page, card and brand in dark, as three overlapping dots */
.ui-as-brief__swatches { display: flex; flex: none; }
.ui-as-brief__swatches i { width: 14px; height: 14px; border-radius: 50%; box-shadow: 0 0 0 1.5px var(--panel), inset 0 0 0 1px rgb(255 255 255 / 0.08); }
.ui-as-brief__swatches i + i { margin-left: -4px; }

/* Typography: a row per target – a label, then the choices as pills */
.ui-as-brief__type { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 36px; }
.ui-as-brief__type > span { font-size: var(--fs-body); color: var(--text); }
.ui-as-brief__pills { display: flex; flex-wrap: wrap; gap: 6px; }
.ui-as-brief__pills button { height: 28px; padding: 0 10px; border-radius: 999px; box-shadow: var(--shadow-2); font-size: var(--fs-caption); color: var(--muted); font-variant-numeric: tabular-nums; transition: background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast), box-shadow var(--motion-fast) var(--ease-fast); }
.ui-as-brief__pills button:hover { background: var(--hover); color: var(--ink); }
.ui-as-brief__pills button[aria-pressed="true"] { background: var(--select); box-shadow: none; color: var(--ink); font-weight: 550; font-variation-settings: "opsz" 18; }

.ui-as-brief__channel { display: flex; align-items: center; gap: 12px; min-height: 44px; cursor: pointer; }
.ui-as-brief__channel > svg { color: var(--muted); }
/* Small switch, drawn on the checkbox itself */
.ui-as-switch {
  appearance: none;
  position: relative;
  flex: none;
  width: 30px;
  height: 18px;
  margin: 0;
  border-radius: 999px;
  background: var(--toggle-off);
  cursor: pointer;
  transition: background-color var(--motion-fast) var(--ease-fast);
}
.ui-as-switch::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: var(--knob-shadow);
  transition: translate var(--motion-moderate) var(--ease-moderate);
}
.ui-as-switch:checked { background: var(--switch-on); }
.ui-as-switch:checked::after { translate: 12px 0; }
.ui-as-switch:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.ui-as-brief__swatches, .ui-as-brief__formats { display: flex; gap: 14px; font-size: var(--fs-caption); line-height: 16px; color: var(--muted); }
.ui-as-brief__swatches span, .ui-as-brief__formats span { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ui-as-brief__swatches i { width: 22px; height: 22px; border-radius: 50%; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08); }
.ui-as-brief__formats span { justify-content: flex-end; height: 44px; }
.ui-as-brief__formats i { height: 24px; max-width: 36px; border: 1.5px solid var(--faint); border-radius: 4px; }
.ui-as-brief__formats span:nth-child(3) i { width: 36px; height: auto; }

.ui-as-brief__details { display: grid; gap: 12px; margin: 0; }
.ui-as-brief__details div { display: flex; align-items: center; justify-content: space-between; font-size: var(--fs-body); }
.ui-as-brief__details dt { display: flex; align-items: center; gap: 8px; color: var(--muted); }
.ui-as-brief__details dd { margin: 0; font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); font-variant-numeric: tabular-nums; }

.ui-as-brief__panel { display: flex; flex: 1 0 auto; flex-direction: column; animation: ui-as-rise var(--motion-slow) var(--ease-slow) both; }
.ui-as-brief__assets { margin: 12px 16px 16px; padding: 4px; border-radius: 14px; transition: background-color var(--motion-fast) var(--ease-fast), box-shadow var(--motion-fast) var(--ease-fast); }
/* Files dragged over the tab: it becomes the drop zone */
.ui-as-brief__assets[data-dragging] { background: var(--hover); box-shadow: inset 0 0 0 1.5px var(--focus-ring); }
.ui-as-brief__assets[data-dragging] > * { pointer-events: none; }
.ui-as-brief__assets-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; }
.ui-as-brief__assets-head .ui-as-brief__label { padding-bottom: 0; }
.ui-as-ads { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.ui-as-ad { margin: 0; }
.ui-as-ad__art {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 12px;
  border-radius: 12px;
  background: var(--ad);
  box-shadow: var(--shadow-1);
  color: var(--ad-ink);
}
.ui-as-ad__art--file { position: relative; overflow: hidden; aspect-ratio: 1 / 1; background: var(--chip); color: var(--muted); }
.ui-as-ad__art--file img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.ui-as-ad__name { overflow: hidden; min-width: 0; text-overflow: ellipsis; white-space: nowrap; }
.ui-as-ad figcaption { gap: 8px; }
.ui-as-ad__art b { font-size: 15px; font-weight: 550; font-variation-settings: "opsz" 18; line-height: 1.2; }
.ui-as-ad figcaption { display: flex; justify-content: space-between; margin-top: 6px; font-size: var(--fs-caption); font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-as-ad figcaption span { font-weight: 400; color: var(--muted); }
.ui-as-brief__empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; }
.ui-as-brief__empty > span { display: grid; place-items: center; width: 42px; height: 42px; margin-bottom: 8px; border-radius: 12px; background: var(--chip); color: var(--muted); }
.ui-as-brief__empty b { font-size: var(--fs-subtitle); font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-as-brief__empty p { max-width: 240px; margin: 0 0 10px; font-size: var(--fs-body); line-height: 19px; color: var(--muted); }
.ui-as-activity { margin: 0; padding: 16px; list-style: none; }
.ui-as-activity li { position: relative; display: flex; gap: 12px; padding-bottom: 18px; }
/* A fine line joins the icons into a timeline */
.ui-as-activity li:not(:last-child)::before { content: ""; position: absolute; top: 28px; bottom: 2px; left: 13px; width: 1px; background: var(--line); }
.ui-as-activity__icon { display: grid; flex: none; place-items: center; width: 27px; height: 27px; border-radius: 50%; box-shadow: var(--shadow-2); color: var(--muted); }
.ui-as-activity__text { display: flex; flex-direction: column; padding-top: 3px; font-size: var(--fs-body); line-height: 19px; color: var(--ink); }
.ui-as-activity__text small { font-size: var(--fs-caption); color: var(--faint); }

.ui-as-brief__go {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  padding: 16px 20px 20px;
  border-top: 1px solid var(--line-soft);
}
.ui-as-brief__tags { display: flex; gap: 4px; }
.ui-as-brief__tags span { padding: 3px 9px; border-radius: 999px; background: var(--hover); font-size: var(--fs-caption); font-weight: 550; font-variation-settings: "opsz" 18; color: var(--text); }

:where(.dark, [data-theme="dark"]) .ui-as-brief__signal i:not([data-on]) { background: #3a3a3f; }

/* Room for the sidebar icon while the sidebar is collapsed */
.ui-as-chat__main > .ui-as-chat__bar { transition: padding-left var(--motion-slow) var(--ease-slow); }
.ui-as-chat__scrim { display: none; }
/* The chat's own toggles: narrow only, where the conversation is a sheet */
.ui-as-chat__narrow { display: none; }
/* In the shell's drawer the brief fills it, with no divider */
.ui-as-end > .ui-as-brief { flex: 1; width: auto; min-height: 0; }
.ui-as-end > .ui-as-brief::before { display: none; }

/* Narrow panels: the brief becomes a layer that slides in from the right over the chat (the workspace's settings
   leave the panel for the shell's drawer instead) */
@container ui-as-main (max-width: 900px) {
  .ui-as-brief {
    position: absolute;
    z-index: 12;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(400px, calc(100% - 32px));
    border-radius: 0 var(--radius-panel) var(--radius-panel) 0;
    background: var(--panel);
    box-shadow: var(--shadow-4);
    animation: ui-as-brief-in var(--motion-slow) var(--ease-slow) both;
  }
  .ui-as-brief::before { display: none; }
  .ui-as-chat__scrim {
    display: block;
    position: absolute;
    z-index: 11;
    inset: 0;
    border-radius: var(--radius-panel);
    background: rgba(0, 0, 0, 0.28);
    animation: ui-as-brief-fade var(--motion-slow) var(--ease-slow) both;
  }
  :where(.dark, [data-theme="dark"]) .ui-as-chat__scrim { background: rgba(0, 0, 0, 0.55); }
}
@keyframes ui-as-brief-in { from { translate: 100% 0; } }
@keyframes ui-as-brief-fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .ui-as-brief, .ui-as-chat__scrim { animation-duration: 0s !important; }
}
@container ui-as (max-width: 900px) {
  /* Room for the sidebar's button, which waits in the window's top left corner */
  .ui-as-main .ui-as-chat__main > .ui-as-chat__bar { padding-left: 52px; }
  .ui-as-chat__narrow { display: grid; }
  .ui-as-chat__bar > .ui-as-chat__narrow { flex: none; margin-left: auto; }
}
@container ui-as (max-width: 600px) {
  /* Only the chat's name stays in the bar */
  .ui-as-chat__main .ui-as-chat__crumbs { min-width: 0; }
  .ui-as-chat__main .ui-as-chat__crumbs > svg, .ui-as-chat__main .ui-as-chat__crumbs > i { display: none; }
  .ui-as-chat__main .ui-as-chat__crumbs { font-size: 0; }
  .ui-as-chat__main .ui-as-chat__crumbs > b { overflow: hidden; font-size: var(--fs-body); white-space: nowrap; text-overflow: ellipsis; }
  .ui-as-chat__bar { padding-right: 8px; }
  .ui-as-brief .ui-as-chat__bar { padding-left: 52px; }
  .ui-as-end > .ui-as-brief .ui-as-chat__bar { padding-left: 20px; }
  .ui-as-chat__thread { padding: 24px 16px 12px; }
  .ui-as-chat__composer { padding: 6px 8px 8px; }
  .ui-as-chat__route { padding-left: 6px; }
  .ui-as-brief { width: 100%; border-radius: var(--radius-panel); }
  .ui-as-brief__seg { margin: 16px 16px 0; }
  .ui-as-brief__mode { margin: 16px 16px 6px; }
  .ui-as-brief__section { padding: 16px; }
  .ui-as-brief__section--split { flex-wrap: wrap; }
  .ui-as-brief__go { padding: 14px 16px 16px; }
}
/* Phones: the conversation keeps the window's frame – the composer sits the frame gap from the edges on all three
   sides, with the window's corners, and what's inside it, the thread and the bar line up with its text */
@container ui-as (max-width: 420px) {
  .ui-as-chat__main[data-surface="page"] > .ui-as-chat__composer { padding: 0 var(--frame-gap) var(--frame-gap); }
  .ui-as-chat__main[data-surface="page"] .ui-as-composer__card { padding: 12px 8px 6px 12px; border-radius: 10px; }
  .ui-as-chat__main[data-surface="page"] .ui-as-composer__bar { margin-top: 14px; }
  .ui-as-chat__main[data-surface="page"] > .ui-as-chat__bar { padding: 0 calc(var(--frame-gap) + 8px) 0 calc(var(--frame-gap) + 12px); }
  .ui-as-chat__main[data-surface="page"] > .ui-as-chat__bar .ui-as-chat__speaker { padding-left: 0; }
  /* The thread runs to the frame gap too, so cards take the chat's full width like the composer; text keeps the
     composer's inner inset, so every line of it starts where the composer's does */
  .ui-as-chat__main[data-surface="page"] > .ui-as-chat__thread { --ui-as-chat-inset: 12px; padding: 12px var(--frame-gap) 16px; }
  .ui-as-chat__main[data-surface="page"] .ui-as-chat__column { gap: 16px; }
  .ui-as-chat__main[data-surface="page"] .ui-as-chat__column > :not(.ui-tc, .ui-tc-group) { padding-inline: var(--ui-as-chat-inset); }
  .ui-as-chat__main[data-surface="page"] .ui-tc-group__list { gap: 6px; padding-top: 6px; }
  /* The clip's room for the cards' shadows stays inside the thread's own gap, so nothing scrolls sideways */
  .ui-as-chat__main[data-surface="page"] .ui-tc-group > .ui-tc__body > .ui-tc__clip { margin-inline: calc(-1 * var(--frame-gap)); padding-inline: var(--frame-gap); }
  /* Cards: tighter insets */
  .ui-as-chat__main[data-surface="page"] .ui-tc__head { gap: 8px; min-height: 40px; padding: 6px 8px 6px 7px; }
  .ui-as-chat__main[data-surface="page"] .ui-tc__sections { gap: 10px; padding: 8px; }
  .ui-as-chat__main[data-surface="page"] .ui-tc__code { padding: 8px 10px; }
}
`;
