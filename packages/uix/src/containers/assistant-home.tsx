import type { UIMessage } from "@tanstack/ai-client";
import { ChatTranscript } from "../components/chat-transcript";
import { StreamedChatMessage } from "../components/streamed-message";
export { ChatStyles } from "../components/chat-message";
/*
 * Assistant Home – the start screen of an AI workspace, in a single file.
 * Greeting, a chat input in a gray tray (folder and app shortcuts below it) and quick prompts.
 * Sits in the affectUI App Shell; icons from the Hugeicons free set.
 */

import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ComposerPicker, ComposerSurface } from "../components/composer";
import type { ThinkingStep } from "../components/thinking-state";
import type { IconGlyph } from "../lib/icons";
import {
  AiBrain01Icon,
  AiMagicIcon,
  ArrowDown01Icon,
  Cancel01Icon,
  FolderOpenIcon,
  Globe02Icon,
  PencilEdit02Icon,
  SparklesIcon,
  ChartColumnIcon,
  Database01Icon,
  File01Icon,
  Image01Icon,
  Mic01Icon,
  Plug01Icon,
  PlusSignIcon,
  PresentationBarChart01Icon,
  Table01Icon,
  Telescope01Icon,
  UserAdd01Icon,
} from "../lib/icons";
import { GlassFolder } from "../components/glass-folder";
import { AppShell, Dropdown, Icon, defaultProjects, type AppShellProps } from "../components/app-shell";

type NavItem = { label: string; icon: IconGlyph };

const suggestions: NavItem[][] = [
  [
    { label: "Company knowledge", icon: Database01Icon },
    { label: "Create document", icon: File01Icon },
    { label: "Create presentation", icon: PresentationBarChart01Icon },
    { label: "Create table", icon: Table01Icon },
  ],
  [
    { label: "Generate image", icon: Image01Icon },
    { label: "Deep research", icon: Telescope01Icon },
    { label: "Visualize data", icon: ChartColumnIcon },
  ],
];

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Good morning!";
  if (h < 18) return "Good afternoon!";
  return "Good evening!";
}

export type AssistantHomeScreenProps = Pick<AppShellProps, "onNavigate" | "workspace" | "user" | "className">;

/** Prepared answers – picked by a keyword in the prompt; replace with your model's answer */
function replyFor(prompt: string): ChatReply {
  const p = prompt.toLowerCase();
  if (/document|doc|write/.test(p))
    return {
      steps: [
        { kind: "step", label: "Reading your request" },
        { kind: "step", label: "Checking Brand assets for tone of voice" },
        { kind: "step", label: "Outlining the document" },
      ],
      paragraphs: [
        "Here's an outline to start from – it follows your Tone-of-Voice guide:",
        "1. Summary – what this is about and why it matters now, in three sentences.",
        "2. Context – the numbers behind it, taken from Q3 Campaign.",
        "3. Proposal – what we do next, who owns it and by when.",
        "Shall I write the full draft into a new document in Q3 Campaign?",
      ],
    };
  if (/research|study|market/.test(p))
    return {
      steps: [
        { kind: "step", label: "Planning the research" },
        { kind: "step", label: "Reading Market-Study and Survey-Results" },
        { kind: "step", label: "Comparing the findings" },
      ],
      paragraphs: [
        "Two things stand out in your Research folder:",
        "Customers who buy twice do so within 30 days – after that, repeat orders drop by more than half.",
        "Price is rarely the reason to leave; slow delivery is named three times as often.",
        "Want a short report with sources, ready to share with the team?",
      ],
    };
  if (/table|data|visual|chart/.test(p))
    return {
      steps: [
        { kind: "step", label: "Reading Media-Budget and Results-Q2" },
        { kind: "step", label: "Matching spend to results" },
        { kind: "step", label: "Building the table" },
      ],
      paragraphs: [
        "I matched your Q2 spend against results per channel:",
        "Organic brought the most revenue at no media cost, paid ads the most new customers, and email the best return per dollar.",
        "Shall I add this as a table to Q3 Campaign, with a chart for the weekly trend?",
      ],
    };
  return {
    steps: [
      { kind: "step", label: "Reading your message" },
      { kind: "step", label: "Looking through Q3 Campaign and Brand assets" },
      { kind: "step", label: "Sorting ideas by effort and impact" },
    ],
    paragraphs: [
      `Here are a few directions for “${prompt}”:`,
      "1. Start with the problem customers name most often in reviews and support chats – it gives every idea a real reason to exist.",
      "2. Turn your strongest proof into the story: 412 orders of the Linen Overshirt last month make a good headline.",
      "3. Test two angles side by side for a week before you commit budget – desire-driven and problem–solution usually split clearly.",
      "Want me to turn one of these into a brief or a first draft?",
    ],
  };
}

export function AssistantHomeScreen(props: AssistantHomeScreenProps) {
  // start: greeting in the middle · leaving: greeting and chips fade · chat: thread on top, composer at the bottom
  const [phase, setPhase] = useState<"start" | "leaving" | "chat">("start");
  const chat = useChatThread(replyFor);
  const slot = useRef<HTMLDivElement>(null);
  const from = useRef<DOMRect | null>(null);
  const thread = useRef<HTMLDivElement>(null);

  const send = (text: string) => {
    if (phase !== "start") return chat.send(text);
    from.current = slot.current?.getBoundingClientRect() ?? null;
    setPhase("leaving");
    window.setTimeout(() => {
      setPhase("chat");
      chat.send(text);
    }, 180);
  };

  // The composer glides from the middle down to its place at the bottom (FLIP – measured, then animated back)
  useLayoutEffect(() => {
    const el = slot.current;
    if (phase !== "chat" || !el || !from.current) return;
    const to = el.getBoundingClientRect();
    // Inside a scaled preview the measured pixels are scaled too
    const scale = to.width / el.offsetWidth || 1;
    const dy = (from.current.top - to.top) / scale;
    from.current = null;
    el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 720, easing: "cubic-bezier(0.22, 1, 0.36, 1)" });
  }, [phase]);

  return (
    <AppShell active="New chat" {...props}>
      <style href="ui-screen-assistant-home" precedence="default">
        {css}
      </style>
      <button type="button" className="ui-as-invite">
        <Icon icon={UserAdd01Icon} size={14} />
        Invite people
      </button>

      <section className="ui-as-start" data-phase={phase}>
        {phase === "chat" && (
          <div ref={thread} className="ui-as-start__thread scroll-fade">
            <div className="ui-as-start__column">
              <ChatMessages messages={chat.messages} name="Assistant" scroller={thread} onDone={chat.finish} />
            </div>
          </div>
        )}
        {phase !== "chat" && <h1 className="ui-as-start__title">{greeting()} What's next on your list?</h1>}
        <div ref={slot} className="ui-as-start__composer">
          <Composer onSend={send} busy={chat.busy} placeholder={phase === "chat" ? "Reply…" : undefined} />
        </div>
        {phase !== "chat" && (
          <div className="ui-as-chips">
            {suggestions.map((row, i) => (
              <div key={i} className="ui-as-chips__row">
                {row.map((s) => (
                  <button key={s.label} type="button" className="ui-as-chip" onClick={() => send(s.label)}>
                    <Icon icon={s.icon} size={15} />
                    {s.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

/* ---------- Chat ---------- */

/** An answer: thinking steps first, then the text, written out word by word */
export type ChatReply = { steps: ThinkingStep[]; paragraphs: string[] };
export type ChatMessage = { id: number; role: "user"; text: string } | { id: number; role: "assistant"; reply: ChatReply };

/** Messages of a chat with prepared answers; one answer at a time */
export function useChatThread(replyFor: (prompt: string) => ChatReply) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const send = (text: string) => {
    if (busy || !text.trim()) return;
    const id = Date.now();
    setMessages((m) => [...m, { id, role: "user", text }, { id: id + 1, role: "assistant", reply: replyFor(text) }]);
    setBusy(true);
  };
  return { messages, busy, send, finish: () => setBusy(false) };
}

/**
 * The thread, as the app's chat renders it (StreamedChatMessage): the person's messages, and each answer as a
 * thinking panel – its steps inside – then its text streaming in as Markdown, a few words at a time
 */
export function ChatMessages({
  messages,
  scroller,
  onDone,
}: {
  messages: ChatMessage[];
  /** Who answers (unused: the thinking panel names the activity, as in the app) */
  name?: string;
  /** Scroll container that follows the newest text */
  scroller: RefObject<HTMLElement | null>;
  onDone: () => void;
}) {
  // Keep the newest text in view while it grows – unless someone scrolled up to read
  const follow = () => {
    const el = scroller.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };
  // The newest answer thinks for a moment per step, then writes; how many of its words are out
  const live = messages.at(-1)?.role === "assistant" ? messages.at(-1) as Extract<ChatMessage, { role: "assistant" }> : undefined;
  const [written, setWritten] = useState<{ id: number; words: number }>();
  const words = live ? live.reply.paragraphs.join("\n\n").split(" ") : [];
  const writing = live && written?.id === live.id ? written.words : undefined;
  useEffect(() => {
    if (!live) return;
    const start = window.setTimeout(() => setWritten({ id: live.id, words: 0 }), 700 * Math.max(1, live.reply.steps.length));
    return () => window.clearTimeout(start);
  }, [live?.id]);
  useEffect(() => {
    follow();
    if (!live || writing === undefined) return;
    if (writing >= words.length) { onDone(); return; }
    const next = window.setTimeout(() => setWritten({ id: live.id, words: writing + 2 }), 45);
    return () => window.clearTimeout(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, writing]);

  const thread: UIMessage[] = messages.map((m) => m.role === "user"
    ? { id: `m${m.id}`, role: "user", parts: [{ type: "text", content: m.text }] }
    : { id: `m${m.id}`, role: "assistant", parts: [
      { type: "thinking", content: m.reply.steps.map((step) => step.label).join("\n") },
      ...(m !== live ? [{ type: "text" as const, content: m.reply.paragraphs.join("\n\n") }]
        : writing ? [{ type: "text" as const, content: words.slice(0, writing).join(" ") }] : []),
    ] });
  return <ChatTranscript messages={thread} streaming={Boolean(live) && (writing === undefined || writing < words.length)}
    renderMessage={(message, streaming) => <StreamedChatMessage key={message.id} message={message} streaming={streaming} />} />;
}

/** Models in the composer's picker – the first one is selected */
export type ComposerModel = { value?: string; name: string; effort?: string; description: string; icon: IconGlyph };
export type ComposerAgent = { value: string; name: string; icon: IconGlyph; description?: string };
const defaultModels: ComposerModel[] = [
  { name: "Auto", description: "Picks the best model for each task", icon: AiMagicIcon },
  { name: "Claude", description: "Thoughtful writing and code", icon: AiBrain01Icon },
  { name: "ChatGPT", description: "Quick answers for everyday tasks", icon: SparklesIcon },
  { name: "Gemini", description: "Long documents and research", icon: Telescope01Icon },
];
const pluginList = [
  { label: "Web search", description: "Look things up while answering", icon: Globe02Icon },
  { label: "Canvas", description: "Write and edit side by side", icon: PencilEdit02Icon },
  { label: "Image generation", description: "Create images from a prompt", icon: Image01Icon },
];

/**
 * Chat input: white card in a gray tray, the tray holds the folder and app shortcuts.
 * Used by the Pages templates and production; hosts can own drafts and model selection.
 */
export function Composer({
  placeholder = "Help me brainstorm ideas for...",
  onSend,
  busy,
  tray = true,
  models = defaultModels,
  agent, agents, onAgentChange, agentChanging, loading,
  className, value, onValueChange, history, disabled, onStop, id, label, queueing,
  model: controlledModel, onModelChange, modelChanging,
  attachments = true, files: controlledFiles, onFilesChange, dictation = true, plugins: pluginsEnabled = true,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  history?: string[];
  disabled?: boolean;
  onStop?: () => void;
  queueing?: boolean;
  id?: string;
  label?: string;
  model?: string;
  onModelChange?: (value: string) => void;
  modelChanging?: boolean;
  /** Keep the + control visible but disabled when this connection cannot accept files. */
  attachments?: boolean | "unavailable";
  files?: File[];
  onFilesChange?: (files: File[]) => void;
  dictation?: boolean;
  plugins?: boolean;
  placeholder?: string;
  /** The picker's models – the first one is selected; the default is a general assistant's */
  models?: ComposerModel[];
  /** A selected coding agent in place of the general assistant's plugins. */
  agent?: { value?: string; name: string; icon: IconGlyph };
  /** Available coding agents; the host owns selection and session transitions. */
  agents?: ComposerAgent[];
  onAgentChange?: (value: string) => void;
  agentChanging?: boolean;
  /** The host is still loading the agent's session: the agent and model pickers show it and wait */
  loading?: boolean;
  /** Resolves when the host accepts the text and selected files. A rejection keeps the draft. */
  onSend?: (text: string, files: File[]) => void | Promise<void>;
  /** While an answer is being written, sending waits */
  busy?: boolean;
  /** The outer tray with the folder and connected apps; without it only the card remains */
  tray?: boolean;
  className?: string;
}) {
  const [draft, setDraft] = useState("");
  const text = value ?? draft;
  const setText = (next: string | ((previous: string) => string)) => {
    const updated = typeof next === "function" ? next(text) : next;
    if (onValueChange) onValueChange(updated); else setDraft(updated);
  };
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(models[0]?.value ?? models[0]?.name);
  const model = controlledModel ?? selected;
  const selectedModel = models.find(item => (item.value ?? item.name) === model);
  const [plugins, setPlugins] = useState<string[]>([]);
  const [folder, setFolder] = useState<string | null>(null);
  const [apps, setApps] = useState<string[]>(["Gmail"]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const files = controlledFiles ?? selectedFiles;
  const setFiles = onFilesChange ?? setSelectedFiles;
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [recording, setRecording] = useState(false);
  const toggleIn = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  // Dictation: a short sample sentence appears after a moment – wire up real speech-to-text here
  useEffect(() => {
    if (!recording) return;
    const t = window.setTimeout(() => {
      setText((v) => (v ? v + " " : "") + "Draft a short update for the team about this week.");
      setRecording(false);
      field.current?.focus();
    }, 1800);
    return () => window.clearTimeout(t);
  }, [recording]);

  const submit = async () => {
    if ((!text.trim() && !files.length) || submitting || (busy && !queueing)) return;
    setSubmitting(true);
    setSubmitError(undefined);
    try {
      await onSend?.(text.trim(), files);
      setText("");
      setFiles([]);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "The message could not be sent. Try again.");
    } finally { setSubmitting(false); }
  };

  return <ComposerSurface value={text} onValueChange={setText} onSend={submit} busy={busy}
    placeholder={placeholder} className={className} fieldRef={field}
    history={history} disabled={disabled || submitting} onStop={onStop} id={id} label={label} queueing={queueing} hasAttachments={files.length > 0}
    attachments={<>{files.length > 0 && (
          <div className="ui-as-attachments">
            {files.map((f) => (
              <span key={f.name} className="ui-as-attachment">
                <Icon icon={File01Icon} size={13} />
                {f.name}
                <button type="button" disabled={submitting} aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter(x => x !== f))}>
                  <Icon icon={Cancel01Icon} size={11} />
                </button>
              </span>
            ))}
          </div>
        )}{submitError && <p role="alert" className="text-sm text-destructive">{submitError}</p>}</>}
    leading={<>{attachments && <><button type="button" className="ui-as-icon-btn" aria-label="Add file" disabled={attachments === "unavailable" || disabled || submitting}
            title={attachments === "unavailable" ? "Attachments are not available in this connection yet" : undefined} onClick={() => fileInput.current?.click()}>
            <Icon icon={PlusSignIcon} size={15} />
          </button>
          {attachments === true && <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              setFiles([...files, ...picked.filter(file => !files.some(existing => existing.name === file.name))]);
              e.target.value = "";
            }}
          />}</>}
          {(agent || pluginsEnabled) && <ComposerPicker title={agent ? "Agent" : "Plugins"} icon={agent?.icon ?? Plug01Icon} active={plugins.length > 0}
            loading={Boolean(agent && (loading || agentChanging))}
            disabled={Boolean(agent && (!onAgentChange || !agents?.length || modelChanging || disabled || busy))}
            items={agent ? (agents ?? []).map(choice => ({ label: choice.name, description: choice.description, icon: choice.icon,
              checked: choice.value === agent.value, onSelect: () => onAgentChange?.(choice.value) })) : pluginList.map(p => ({
              label: p.label, description: p.description, icon: p.icon, checked: plugins.includes(p.label),
              onSelect: () => setPlugins(list => toggleIn(list, p.label)),
            }))}>
            {agent?.name ?? (plugins.length ? `Plugins · ${plugins.length}` : "Plugins")}
          </ComposerPicker>}</>}
    controls={<><ComposerPicker title="Model" model loading={loading || agentChanging || modelChanging}
              disabled={!models.length || disabled || busy} icon={agent ? undefined : selectedModel?.icon ?? AiMagicIcon}
              items={models.map(m => ({ label: [m.name, m.effort].filter(Boolean).join(" "), description: m.description, icon: m.icon,
                checked: (m.value ?? m.name) === model, onSelect: () => { const next = m.value ?? m.name; if (onModelChange) onModelChange(next); else setSelected(next); } }))}>
              {selectedModel?.name ?? model ?? (loading || agentChanging ? "Loading…" : "Model")}{selectedModel?.effort && <span className="ui-as-composer__effort"> {selectedModel.effort}</span>}
            </ComposerPicker>
            {dictation && <button
              type="button"
              className="ui-as-icon-btn ui-as-mic"
              aria-label={recording ? "Stop dictation" : "Dictate"}
              aria-pressed={recording}
              onClick={() => setRecording((r) => !r)}
            >
              <Icon icon={Mic01Icon} size={15} />
            </button>}</>}
    tray={tray && <div className="ui-as-composer__tray">
        <Dropdown
          title="Work in a folder"
          items={[
            ...defaultProjects.map((name) => ({ label: name, icon: FolderOpenIcon, checked: folder === name, onSelect: () => setFolder(folder === name ? null : name) })),
          ]}
          trigger={({ open, toggle }) => (
            <button type="button" className="ui-as-tray-link" aria-expanded={open} onClick={toggle}>
              {/* The library's Glass Folder; it tips open while the link is hovered */}
              <span className="ui-as-tray-link__folder">
                <GlassFolder label="" />
              </span>
              {folder ?? "Work in a folder"}
            </button>
          )}
        />
        <Dropdown
          align="end"
          title="Apps"
          items={["Gmail", "Slack", "ClickUp"].map((name) => ({
            label: name,
            description: apps.includes(name) ? "Connected" : "Not connected",
            checked: apps.includes(name),
            onSelect: () => setApps((list) => toggleIn(list, name)),
          }))}
          trigger={({ open, toggle }) => (
            <button type="button" className="ui-as-tray-link ui-as-tray-link--apps" aria-expanded={open} onClick={toggle}>
              Connect apps
              <span className="ui-as-apps" aria-hidden="true">
                <GmailLogo />
                <SlackLogo />
                <ClickUpLogo />
              </span>
            </button>
          )}
        />
      </div>} />;
}

/* Brand marks (Gmail, Slack, ClickUp) for the "Connect apps" shortcut */
/** Unique ids for gradients, so several logos on one page don't clash */
const useSvgId = () => "lg" + useId().replace(/[^a-zA-Z0-9_-]/g, "");

const GmailLogo = () => {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 56.4108 44.8722" fill="none" aria-hidden="true">
      <path
        d="M44.2255 5.76727H56.4051V41.0239C56.4051 43.148 54.683 44.8701 52.5589 44.8701H46.1486C45.8961 44.8701 45.646 44.8204 45.4127 44.7237C45.1794 44.6271 44.9674 44.4854 44.7888 44.3069C44.6102 44.1283 44.4686 43.9163 44.3719 43.683C44.2753 43.4497 44.2255 43.1996 44.2255 42.947V5.76727Z"
        fill={`url(#${id}-0)`}
      />
      <path
        d="M12.1796 5.76727H0V41.0239C0 43.148 1.72213 44.8701 3.84618 44.8701H10.2565C10.509 44.8701 10.7591 44.8204 10.9924 44.7237C11.2257 44.6271 11.4377 44.4854 11.6163 44.3069C11.7949 44.1283 11.9365 43.9163 12.0332 43.683C12.1298 43.4497 12.1796 43.1996 12.1796 42.947V5.76727Z"
        fill="#FC413D"
      />
      <path
        d="M10.0085 1.42778C7.43377 -0.736342 3.5924 -0.403647 1.42828 2.17105C-0.735843 4.74543 -0.403148 8.58681 2.17155 10.7512L26.5557 31.2479C27.0178 31.6362 27.602 31.8492 28.2056 31.8492C28.8091 31.8492 29.3934 31.6362 29.8554 31.2479L54.2396 10.7509C56.814 8.58681 57.1467 4.74543 54.9825 2.17073C52.8184 -0.403648 48.977 -0.736342 46.4027 1.42778L28.2054 16.724L10.0085 1.42778Z"
        fill={`url(#${id}-1)`}
      />
      <defs>
        <linearGradient
          id={`${id}-0`}
          x1="50.3153"
          y1="5.76727"
          x2="50.3153"
          y2="44.8701"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#60D673" />
          <stop offset="0.17" stopColor="#42C868" />
          <stop offset="0.39" stopColor="#0EBC5F" />
          <stop offset="0.62" stopColor="#00A9BB" />
          <stop offset="0.86" stopColor="#3C90FF" />
          <stop offset="1" stopColor="#3186FF" />
        </linearGradient>
        <linearGradient
          id={`${id}-1`}
          x1="6.04194e-05"
          y1="6.45153"
          x2="56.4107"
          y2="6.45153"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0.08" stopColor="#FF63A0" />
          <stop offset="0.3" stopColor="#FC413D" />
          <stop offset="0.5" stopColor="#FC413D" />
          <stop offset="0.65" stopColor="#FC413D" />
          <stop offset="0.72" stopColor="#FC5C30" />
          <stop offset="0.86" stopColor="#FEB10C" />
          <stop offset="0.91" stopColor="#FEC700" />
          <stop offset="0.96" stopColor="#FFDB0F" />
        </linearGradient>
      </defs>
    </svg>
  );
};

const SlackLogo = () => (
  <svg viewBox="0 0 49.883 49.877" fill="none" aria-hidden="true">
    <g transform="translate(0 0)">
      <path
        d="M18.3549 10.4784C15.4713 10.4784 13.1157 8.12279 13.1157 5.2392C13.1157 2.35561 15.4713 0 18.3549 0C21.2385 0 23.5941 2.35561 23.5941 5.2392V10.4784H18.3549Z"
        fill="#36C5F0"
      />
      <path
        d="M18.3575 13.12C21.2411 13.12 23.5967 15.4756 23.5967 18.3592C23.5967 21.2428 21.2411 23.5984 18.3575 23.5984H5.2392C2.35561 23.5984 0 21.2428 0 18.3592C0 15.4756 2.35561 13.12 5.2392 13.12H18.3575Z"
        fill="#36C5F0"
      />
    </g>
    <g transform="translate(26.28 0)">
      <path
        d="M13.1244 18.3592C13.1244 15.4756 15.48 13.12 18.3636 13.12C21.2472 13.12 23.6028 15.4756 23.6028 18.3592C23.6028 21.2428 21.2472 23.5984 18.3636 23.5984H13.1244V18.3592Z"
        fill="#2EB67D"
      />
      <path
        d="M10.4785 18.3575C10.4785 21.2411 8.12286 23.5967 5.23927 23.5967C2.35568 23.5967 7.4362e-05 21.2411 7.4362e-05 18.3575V5.2392C7.4362e-05 2.35561 2.35568 0 5.23927 0C8.12286 0 10.4785 2.35561 10.4785 5.2392V18.3575Z"
        fill="#2EB67D"
      />
    </g>
    <g transform="translate(0 26.28)">
      <path
        d="M10.4784 5.2392C10.4784 8.12279 8.12279 10.4784 5.2392 10.4784C2.35561 10.4784 0 8.12279 0 5.2392C0 2.35561 2.35561 0 5.2392 0H10.4784V5.2392Z"
        fill="#E01E5A"
      />
      <path
        d="M13.1157 5.2392C13.1157 2.35561 15.4713 0 18.3549 0C21.2385 0 23.5941 2.35561 23.5941 5.2392V18.3575C23.5941 21.2411 21.2385 23.5967 18.3549 23.5967C15.4713 23.5967 13.1157 21.2411 13.1157 18.3575V5.2392Z"
        fill="#E01E5A"
      />
    </g>
    <g transform="translate(26.28 26.28)">
      <path
        d="M5.23927 13.1157C8.12286 13.1157 10.4785 15.4713 10.4785 18.3549C10.4785 21.2385 8.12286 23.5941 5.23927 23.5941C2.35568 23.5941 7.4362e-05 21.2385 7.4362e-05 18.3549V13.1157H5.23927Z"
        fill="#ECB22E"
      />
      <path
        d="M5.23927 10.4784C2.35568 10.4784 7.4362e-05 8.12279 7.4362e-05 5.2392C7.4362e-05 2.35561 2.35568 0 5.23927 0H18.3576C21.2412 0 23.5968 2.35561 23.5968 5.2392C23.5968 8.12279 21.2412 10.4784 18.3576 10.4784H5.23927Z"
        fill="#ECB22E"
      />
    </g>
  </svg>
);

const ClickUpLogo = () => {
  const id = useSvgId();
  return (
    <svg viewBox="0 0 49.7096 59.6884" fill="none" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M0 45.9002L9.1618 38.8247C14.0602 45.1745 19.2307 48.1679 24.9455 48.1679C30.6603 48.1679 35.7401 45.2652 40.3663 38.9154L49.7096 45.8094C42.997 54.8805 34.6516 59.6882 24.9455 59.6882C15.3301 59.6882 6.89403 54.8805 0 45.9002Z"
        fill={`url(#${id}-0)`}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M24.9535 15.3301L8.62558 29.3903L1.09657 20.5914L25.0442 0L48.8105 20.5914L41.1908 29.2996L24.9535 15.3301Z"
        fill={`url(#${id}-1)`}
      />
      <defs>
        <linearGradient id={`${id}-0`} x1="0" y1="49.2666" x2="49.75" y2="49.2666" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8930FD" />
          <stop offset="1" stopColor="#49CCF9" />
        </linearGradient>
        <linearGradient
          id={`${id}-1`}
          x1="1.09231"
          y1="14.6901"
          x2="48.7603"
          y2="14.6901"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF02F0" />
          <stop offset="1" stopColor="#FFC800" />
        </linearGradient>
      </defs>
    </svg>
  );
};



/* ---------- Styles ---------- */

const css = /* css */ `
/* Assistant start screen – layout taken 1 : 1 from the reference, styled with affectUI tokens */

.ui-as-invite {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border-radius: calc(8px * var(--squircle-factor, 1));
  font-size: var(--fs-caption);
  color: var(--text);
}
.ui-as-invite svg { color: var(--muted); }
.ui-as-invite:hover { background: var(--hover); color: var(--ink); }

.ui-as-start {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: min(672px, calc(100% - 48px));
  /* Fills the main area, so heading, composer and suggestions sit in its exact vertical middle */
  min-height: 100%;
  margin: 0 auto;
  padding: 64px 0;
}

.ui-as-start__title {
  margin: 0;
  font-size: 28px;
  line-height: 34px;
  font-weight: 550; font-variation-settings: "opsz" 18;
  color: var(--ink);
  text-align: center;
  text-wrap: balance;
}

.ui-as-start__composer { width: 100%; margin-top: 30px; }
.ui-as-start__title, .ui-as-chips { transition: opacity var(--motion-fast) var(--ease-fast), transform var(--motion-fast) var(--ease-fast); }
.ui-as-start[data-phase="leaving"] .ui-as-start__title { opacity: 0; transform: translateY(-8px); }
.ui-as-start[data-phase="leaving"] .ui-as-chips { opacity: 0; transform: translateY(8px); }

/* Chat: the thread fills the area and scrolls, the composer waits at the bottom */
.ui-as-start[data-phase="chat"] { width: 100%; height: 100%; min-height: 0; padding: 0; justify-content: flex-end; }
.ui-as-start__thread { flex: 1; width: 100%; min-height: 0; overflow-y: auto; padding: 64px 32px 24px; }
.ui-as-start__column { display: flex; flex-direction: column; gap: 22px; max-width: 672px; margin: 0 auto; }
.ui-as-start[data-phase="chat"] .ui-as-start__composer { flex: none; width: min(672px, calc(100% - 64px)); margin: 0 0 24px; }

/* Suggestions */
.ui-as-chips { display: grid; gap: 7px; margin-top: 18px; }
.ui-as-chips__row { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.ui-as-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 12px 0 11px;
  border-radius: calc(16px * var(--squircle-factor, 1));
  background: var(--chip);
  font-size: var(--fs-caption);
  color: var(--text);
  transition: background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast);
}
.ui-as-chip svg { color: var(--text); }
.ui-as-chip:hover { background: var(--chip-hover); color: var(--ink); }

/* Narrow: a little less room around the column; on a phone the composer runs almost edge to edge */
@container ui-as (max-width: 600px) {
  .ui-as-start { width: calc(100% - 24px); padding: 56px 0 40px; }
  .ui-as-start__title { font-size: 23px; line-height: 29px; }
  .ui-as-start__composer { margin-top: 22px; }
  .ui-as-chips { margin-top: 14px; }
  .ui-as-chips__row { gap: 6px; }
  .ui-as-start__thread { padding: 56px 16px 16px; }
  .ui-as-start[data-phase="chat"] .ui-as-start__composer { width: calc(100% - 16px); margin-bottom: 8px; }
}
`;
