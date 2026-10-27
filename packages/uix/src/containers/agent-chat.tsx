import { AgentChatWorkspace } from "./learning-workspace";
export { AgentChatWorkspace } from "./learning-workspace";
import { learningWorkspaceCss as css } from "../lib/learning-workspace-styles";
import { paneViewTransition } from "../lib/view-transition";
import { Switch } from "../components/switch";
/*
 * Agent Chat – a chat with an orchestrating agent and a brief beside it, in a single file.
 * The thread shows the agent's answer and which agents are working; the composer sits at the bottom.
 * On the right a brief to fill in: selling angle, palette and formats, then one button to generate.
 * Sits in the affectUI App Shell with the same composer as Assistant Home; Button from the library, icons from the Hugeicons free set.
 */

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
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
} from "../lib/icons";
import { Button } from "../components/button";
import { ChatMessages, Composer, useChatThread, type ChatReply } from "./assistant-home";
import { AppShell, Dropdown, Icon, type AppShellProps, type ShellGroup, type ShellNavItem } from "../components/app-shell";
import { SegmentedControl } from "../components/segmented-control";
import { editorSchemes, editorSizes, setPageMode, setUiPreferences, uiThemes, useEditorScheme, usePageMode, useUiPreferences } from "../lib/ui-preferences";

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
 * window on the page; settings share its resizable pane and join the window's frame.
 */
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
                  <Switch aria-label={c.label} checked={active.has(c.label)} onCheckedChange={() => setActive((prev) => flip(prev, c.label))} />
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
                  <Switch aria-label={r.label} checked={rules.has(r.id)} onCheckedChange={() => setRules((prev) => flip(prev, r.id))} />
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
