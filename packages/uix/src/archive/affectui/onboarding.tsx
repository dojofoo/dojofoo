
/*
 * Onboarding – the first-run flow of an AI workspace, in a single file.
 * A greeting, a four-part progress bar and one step at a time: name the workspace, connect tools,
 * invite the team, pick a first agent. A quiet "Getting started" card mirrors the progress beside it,
 * and finishing ends on a calm success state with next steps.
 * Sits in the affectUI App Shell; icons from the Hugeicons free set, brand marks from Simple Icons (CC0).
 */

import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { IconGlyph } from "~/lib/icons";
import {
  Analytics01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  BubbleChatIcon,
  Cancel01Icon,
  ChartColumnIcon,
  Copy01Icon,
  CustomerSupportIcon,
  DashboardSquare02Icon,
  Home01Icon,
  Link01Icon,
  Tick02Icon,
  UserSearch01Icon,
} from "~/lib/icons";
import { Button } from "~/components/button";
import { SegmentedControl } from "~/components/segmented-control";
import { SetupChecklist } from "~/components/setup-checklist";
import { AppShell, Icon, MenuButton, useToast, type AppShellProps, type ShellNavItem } from "~/components/app-shell";

const nav: ShellNavItem[] = [
  { label: "Home", icon: Home01Icon },
  { label: "Chat", icon: BubbleChatIcon },
  { label: "Analytics", icon: Analytics01Icon },
  { label: "Integrations", icon: DashboardSquare02Icon },
];

/* ---------- Data ---------- */

const STEPS = [
  { id: "workspace", short: "Workspace", title: "Workspace", heading: "Set up your workspace", text: "Give it a name and an address your team will recognize.", time: "About 1 min" },
  { id: "tools", short: "Tools", title: "Connect your tools", heading: "Connect your tools", text: "Your agents can read from and act in the apps you connect. Change this anytime.", time: "About 1 min" },
  { id: "team", short: "Team", title: "Invite your team", heading: "Invite your team", text: "Work together on chats, folders and agents. They'll get an email invite.", time: "Under a minute" },
  { id: "agent", short: "Agent", title: "Your first agent", heading: "Create your first agent", text: "Start from a template – you can change its instructions and tools later.", time: "About 1 min" },
] as const;

type Tool = { id: string; name: string; description: string; logo: ReactNode; tile?: string };

const mark = (d: string, color: string) => (
  <svg viewBox="0 0 24 24" fill={color} aria-hidden="true">
    <path d={d} />
  </svg>
);

const SlackLogo = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#E01E5A" d="M5.04 15.17a2.53 2.53 0 0 1-2.52 2.52A2.53 2.53 0 0 1 0 15.17a2.53 2.53 0 0 1 2.52-2.53h2.52zm1.27 0a2.53 2.53 0 0 1 2.53-2.53 2.53 2.53 0 0 1 2.52 2.53v6.31A2.53 2.53 0 0 1 8.84 24a2.53 2.53 0 0 1-2.53-2.52z" />
    <path fill="#36C5F0" d="M8.84 5.04a2.53 2.53 0 0 1-2.53-2.52A2.53 2.53 0 0 1 8.84 0a2.53 2.53 0 0 1 2.52 2.52v2.52zm0 1.27a2.53 2.53 0 0 1 2.52 2.53 2.53 2.53 0 0 1-2.52 2.52H2.52A2.53 2.53 0 0 1 0 8.84a2.53 2.53 0 0 1 2.52-2.53z" />
    <path fill="#2EB67D" d="M18.96 8.84a2.53 2.53 0 0 1 2.52-2.53A2.53 2.53 0 0 1 24 8.84a2.53 2.53 0 0 1-2.52 2.52h-2.52zm-1.27 0a2.53 2.53 0 0 1-2.53 2.52 2.53 2.53 0 0 1-2.52-2.52V2.52A2.53 2.53 0 0 1 15.16 0a2.53 2.53 0 0 1 2.53 2.52z" />
    <path fill="#ECB22E" d="M15.16 18.96a2.53 2.53 0 0 1 2.53 2.52A2.53 2.53 0 0 1 15.16 24a2.53 2.53 0 0 1-2.52-2.52v-2.52zm0-1.27a2.53 2.53 0 0 1-2.52-2.53 2.53 2.53 0 0 1 2.52-2.52h6.32A2.53 2.53 0 0 1 24 15.16a2.53 2.53 0 0 1-2.52 2.53z" />
  </svg>
);

const tools: Tool[] = [
  { id: "slack", name: "Slack", description: "Ask your agents from any channel and get their reports there.", logo: <SlackLogo /> },
  {
    id: "notion",
    name: "Notion",
    description: "Search pages while you chat and save answers as docs.",
    logo: mark(
      "M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.981-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.887l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952L12.21 19s0 .84-1.168.84l-3.222.186c-.093-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.456-.233 4.764 7.279v-6.44l-1.215-.139c-.093-.514.28-.887.747-.933zM1.936 1.035l13.31-.98c1.634-.14 2.055-.047 3.082.7l4.249 2.986c.7.513.934.653.934 1.213v16.378c0 1.026-.373 1.634-1.68 1.726l-15.458.934c-.98.047-1.448-.093-1.962-.747l-3.129-4.06c-.56-.747-.793-1.306-.793-1.96V2.667c0-.839.374-1.54 1.447-1.632z",
      "currentColor",
    ),
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Pick files from Drive and let agents read them for context.",
    logo: mark(
      "M12.01 1.485c-2.082 0-3.754.02-3.743.047.01.02 1.708 3.001 3.774 6.62l3.76 6.574h3.76c2.081 0 3.753-.02 3.742-.047-.005-.02-1.708-3.001-3.775-6.62l-3.76-6.574zm-4.76 1.73a789.828 789.861 0 0 0-3.63 6.319L0 15.868l1.89 3.298 1.885 3.297 3.62-6.335 3.618-6.33-1.88-3.287C8.1 4.704 7.255 3.22 7.25 3.214zm2.259 12.653-.203.348c-.114.198-.96 1.672-1.88 3.287a423.93 423.948 0 0 1-1.698 2.97c-.01.026 3.24.042 7.222.042h7.244l1.796-3.157c.992-1.734 1.85-3.23 1.906-3.323l.104-.167h-7.249z",
      "#1FA463",
    ),
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Look up contacts and deals, and log what agents find.",
    logo: mark(
      "M18.164 7.93V5.084a2.198 2.198 0 001.267-1.978v-.067A2.2 2.2 0 0017.238.845h-.067a2.2 2.2 0 00-2.193 2.193v.067a2.196 2.196 0 001.252 1.973l.013.006v2.852a6.22 6.22 0 00-2.969 1.31l.012-.01-7.828-6.095A2.497 2.497 0 104.3 4.656l-.012.006 7.697 5.991a6.176 6.176 0 00-1.038 3.446c0 1.343.425 2.588 1.147 3.607l-.013-.02-2.342 2.343a1.968 1.968 0 00-.58-.095h-.002a2.033 2.033 0 102.033 2.033 1.978 1.978 0 00-.1-.595l.005.014 2.317-2.317a6.247 6.247 0 104.782-11.134l-.036-.005zm-.964 9.378a3.206 3.206 0 113.215-3.207v.002a3.206 3.206 0 01-3.207 3.207z",
      "#FF7A59",
    ),
  },
  {
    id: "linear",
    name: "Linear",
    description: "Turn requests from chat into issues and follow them to release.",
    tile: "#5E6AD2",
    logo: mark(
      "M2.886 4.18A11.982 11.982 0 0 1 11.99 0C18.624 0 24 5.376 24 12.009c0 3.64-1.62 6.903-4.18 9.105L2.887 4.18ZM1.817 5.626l16.556 16.556c-.524.33-1.075.62-1.65.866L.951 7.277c.247-.575.537-1.126.866-1.65ZM.322 9.163l14.515 14.515c-.71.172-1.443.282-2.195.322L0 11.358a12 12 0 0 1 .322-2.195Zm-.17 4.862 9.823 9.824a12.02 12.02 0 0 1-9.824-9.824Z",
      "#ffffff",
    ),
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Schedule agent runs and prepare briefs before meetings.",
    logo: mark(
      "M18.316 5.684H24v12.632h-5.684V5.684zM5.684 24h12.632v-5.684H5.684V24zM18.316 5.684V0H1.895A1.894 1.894 0 0 0 0 1.895v16.421h5.684V5.684h12.632zm-7.207 6.25v-.065c.272-.144.5-.349.687-.617s.279-.595.279-.982c0-.379-.099-.72-.3-1.025a2.05 2.05 0 0 0-.832-.714 2.703 2.703 0 0 0-1.197-.257c-.6 0-1.094.156-1.481.467-.386.311-.65.671-.793 1.078l1.085.452c.086-.249.224-.461.413-.633.189-.172.445-.257.767-.257.33 0 .602.088.816.264a.86.86 0 0 1 .322.703c0 .33-.12.589-.36.778-.24.19-.535.284-.886.284h-.567v1.085h.633c.407 0 .748.109 1.02.327.272.218.407.499.407.843 0 .336-.129.614-.387.832s-.565.327-.924.327c-.351 0-.651-.103-.897-.311-.248-.208-.422-.502-.521-.881l-1.096.452c.178.616.505 1.082.977 1.401.472.319.984.478 1.538.477a2.84 2.84 0 0 0 1.293-.291c.382-.193.684-.458.902-.794.218-.336.327-.72.327-1.149 0-.429-.115-.797-.344-1.105a2.067 2.067 0 0 0-.881-.689zm2.093-1.931l.602.913L15 10.045v5.744h1.187V8.446h-.827l-2.158 1.557zM22.105 0h-3.289v5.184H24V1.895A1.894 1.894 0 0 0 22.105 0zm-3.289 23.5l4.684-4.684h-4.684V23.5zM0 22.105C0 23.152.848 24 1.895 24h3.289v-5.184H0v3.289z",
      "#4285F4",
    ),
  },
];

const sizes = [
  { value: "1", label: "Just me" },
  { value: "2-10", label: "2–10" },
  { value: "11-50", label: "11–50" },
  { value: "51-200", label: "51–200" },
  { value: "200+", label: "200+" },
];

type Role = "member" | "admin" | "viewer";
const roles: { value: Role; label: string }[] = [
  { value: "member", label: "Member" },
  { value: "admin", label: "Admin" },
  { value: "viewer", label: "Viewer" },
];

const templates: { id: string; name: string; text: string; meta: string; icon: IconGlyph }[] = [
  { id: "weekly-report", name: "Weekly report", text: "Pulls numbers and updates from your tools into a short Monday summary.", meta: "Every Monday", icon: ChartColumnIcon },
  { id: "lead-research", name: "Lead research", text: "Researches new sign-ups and adds company notes to your CRM.", meta: "On new leads", icon: UserSearch01Icon },
  { id: "support-triage", name: "Support triage", text: "Sorts incoming requests, drafts replies and flags anything urgent.", meta: "On new tickets", icon: CustomerSupportIcon },
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);

/* ---------- Screen ---------- */

export type OnboardingValues = {
  workspace: string;
  slug: string;
  teamSize: string;
  tools: string[];
  invites: string[];
  role: Role;
  template: string;
};

export type OnboardingScreenProps = Pick<AppShellProps, "onNavigate" | "workspace" | "user" | "className"> & {
  /** Step shown first (1–4); the steps before it count as done */
  defaultStep?: 1 | 2 | 3 | 4;
  /** Called after "Create agent" with everything that was entered */
  onComplete?: (values: OnboardingValues) => void;
};

type Status = "done" | "skipped";

export function OnboardingScreen({ defaultStep = 2, onComplete, ...props }: OnboardingScreenProps) {
  const workspaceName = props.workspace ?? "Acme";
  const firstName = (props.user?.name ?? "Alex Morgan").split(" ")[0];

  // 0–3 are the steps, 4 is the finished state
  const [step, setStep] = useState(defaultStep - 1);
  const [dir, setDir] = useState<"next" | "back">("next");
  const [status, setStatus] = useState<Record<number, Status>>(() =>
    Object.fromEntries(Array.from({ length: defaultStep - 1 }, (_, i) => [i, "done" as Status])),
  );

  const [name, setName] = useState(workspaceName);
  const [slug, setSlug] = useState(slugify(workspaceName));
  const [slugEdited, setSlugEdited] = useState(false);
  const [teamSize, setTeamSize] = useState("2-10");
  const [nameError, setNameError] = useState(false);

  const [connected, setConnected] = useState<Set<string>>(() => new Set(["slack"]));
  const [busy, setBusy] = useState<Set<string>>(() => new Set());

  const [invites, setInvites] = useState<string[]>(["jamie@acme.com"]);
  const [role, setRole] = useState<Role>("member");

  const [template, setTemplate] = useState("weekly-report");
  const [creating, setCreating] = useState(false);
  const [toast, showToast] = useToast();

  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const later = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

  const values = (): OnboardingValues => ({ workspace: name.trim(), slug, teamSize, tools: [...connected], invites, role, template });

  const go = (to: number) => {
    if (to === step) return;
    setDir(to > step ? "next" : "back");
    setStep(to);
  };
  const setStepStatus = (i: number, s: Status) => setStatus((prev) => ({ ...prev, [i]: s }));

  const finish = () => {
    setStepStatus(3, "done");
    onComplete?.(values());
    go(4);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (creating) return;
    if (step === 0 && !name.trim()) {
      setNameError(true);
      return;
    }
    if (step === 3) {
      // Creating takes a moment – the button shimmers, then the success state
      setCreating(true);
      later(() => {
        setCreating(false);
        finish();
      }, 1100);
      return;
    }
    setStepStatus(step, "done");
    go(step + 1);
  };

  const skip = () => {
    if (status[step] !== "done") setStepStatus(step, "skipped");
    if (step === 3) {
      onComplete?.(values());
      go(4);
    } else go(step + 1);
  };

  const restart = () => {
    setStatus({});
    setDir("back");
    setStep(0);
  };

  const toggleTool = (tool: Tool) => {
    if (busy.has(tool.id)) return;
    if (connected.has(tool.id)) {
      setConnected((prev) => new Set([...prev].filter((id) => id !== tool.id)));
      return;
    }
    setBusy((prev) => new Set(prev).add(tool.id));
    later(() => {
      setBusy((prev) => new Set([...prev].filter((id) => id !== tool.id)));
      setConnected((prev) => new Set(prev).add(tool.id));
    }, 800);
  };

  const done = step === 4;
  const doneCount = Object.values(status).filter((s) => s === "done").length;
  const current = STEPS[Math.min(step, 3)];
  const chosen = templates.find((t) => t.id === template)!;

  const summary = (i: number) => {
    if (i === 0) return `${name.trim() || workspaceName} · ${teamSize === "1" ? "Just you" : `${sizes.find((s) => s.value === teamSize)?.label} people`}`;
    if (i === 1) return connected.size ? `${connected.size} ${connected.size === 1 ? "tool" : "tools"} connected` : "No tools yet";
    if (i === 2) return invites.length ? `${invites.length} ${invites.length === 1 ? "invite" : "invites"} sent` : "Just you for now";
    return chosen.name;
  };

  const continueLabel = step === 3 ? "Create agent" : step === 2 && invites.length > 0 ? "Send invites" : "Continue";

  return (
    <AppShell active="Home" nav={nav} {...props}>
      <div className="ui-ob">
        <header className="ui-ob-head">
          <span className="ui-ob-kicker">{done ? "All set" : `Step ${step + 1} of ${STEPS.length}`}</span>
          <h1 className="ui-ob-title">
            Welcome to {name.trim() || workspaceName}, {firstName}
          </h1>
          <p className="ui-ob-sub">{done ? "Your workspace is ready. Here's where to go next." : "A few quick steps and your workspace is ready – about two minutes."}</p>
          {/* Four steps in a row: a check once done, a dark ring on the current one */}
          <ol className="ui-ob-steps" aria-label="Onboarding progress">
            {STEPS.map((s, i) => {
              const st = done || i < step ? "done" : i === step ? "current" : "next";
              return (
                <li key={s.id} className="ui-ob-steps__item" data-state={st} aria-current={st === "current" ? "step" : undefined}>
                  <span className="ui-ob-steps__mark" aria-hidden="true">
                    {st === "done" ? <Icon key="done" icon={Tick02Icon} size={11} stroke={2.4} /> : i + 1}
                  </span>
                  <span className="ui-ob-steps__label">
                    {s.short}
                    <span className="ui-ob-sr">{st === "done" ? ", done" : st === "current" ? ", current step" : ""}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </header>

        <div className="ui-ob-card">
          {done ? (
            <Success
              key="done"
              workspace={name.trim() || workspaceName}
              agent={chosen.name}
              tools={connected.size}
              invites={status[2] === "done" ? invites.length : 0}
              onNavigate={props.onNavigate}
              onRestart={restart}
            />
          ) : (
            <form className="ui-ob-form" onSubmit={submit} noValidate>
              <div key={step} className="ui-ob-step" data-dir={dir}>
                <div className="ui-ob-step__head">
                  <h2 className="ui-ob-step__title">{current.heading}</h2>
                  <p className="ui-ob-step__text">{current.text}</p>
                </div>

                {step === 0 && (
                  <div className="ui-ob-fields">
                    <label className="ui-ob-field">
                      <span className="ui-ob-label">Workspace name</span>
                      <input
                        className="ui-ob-input"
                        value={name}
                        aria-invalid={nameError || undefined}
                        placeholder="e.g. Acme"
                        onChange={(e) => {
                          setName(e.target.value);
                          setNameError(false);
                          if (!slugEdited) setSlug(slugify(e.target.value));
                        }}
                      />
                      {nameError && <span className="ui-ob-error">Give your workspace a name to continue.</span>}
                    </label>
                    <label className="ui-ob-field">
                      <span className="ui-ob-label">Workspace URL</span>
                      <span className="ui-ob-input ui-ob-input--prefix">
                        <span className="ui-ob-prefix">app.workspace.ai/</span>
                        <input
                          value={slug}
                          placeholder="acme"
                          aria-label="Workspace URL"
                          onChange={(e) => {
                            setSlugEdited(true);
                            setSlug(slugify(e.target.value) + (e.target.value.endsWith("-") ? "-" : ""));
                          }}
                        />
                      </span>
                      <span className="ui-ob-hint">
                        {slug ? (
                          <>
                            Your team signs in at <b>app.workspace.ai/{slug.replace(/-+$/, "")}</b>
                          </>
                        ) : (
                          "Letters, numbers and dashes"
                        )}
                      </span>
                    </label>
                    <div className="ui-ob-field">
                      <span className="ui-ob-label" id="ui-ob-size">
                        How many people will use it?
                      </span>
                      <SegmentedControl options={sizes.map((s) => s.label)} value={sizes.find((s) => s.value === teamSize)?.label ?? ""} onChange={(label) => setTeamSize(sizes.find((s) => s.label === label)?.value ?? teamSize)} fill label="How many people will use it?" />
                    </div>
                  </div>
                )}

                {step === 1 && (
                  <ul className="ui-ob-tools">
                    {tools.map((tool, i) => {
                      const on = connected.has(tool.id);
                      const loading = busy.has(tool.id);
                      return (
                        <li key={tool.id} className="ui-ob-tool" style={{ "--i": i } as CSSProperties}>
                          <span className="ui-ob-logo" style={tool.tile ? { background: tool.tile, boxShadow: "none" } : undefined}>
                            {tool.logo}
                          </span>
                          <span className="ui-ob-tool__text">
                            <span className="ui-ob-tool__name">
                              {tool.name}
                              {on && <span className="ui-ob-tool__state">Connected</span>}
                            </span>
                            <span className="ui-ob-tool__desc">{tool.description}</span>
                          </span>
                          {loading && <span className="ui-ob-spinner" aria-hidden="true" />}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-busy={loading || undefined}
                            aria-label={`Connect ${tool.name}`}
                            className="ui-ob-switch"
                            data-busy={loading || undefined}
                            onClick={() => toggleTool(tool)}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}

                {step === 2 && (
                  <Invites
                    invites={invites}
                    onChange={setInvites}
                    role={role}
                    onRole={setRole}
                    link={`app.workspace.ai/${slug.replace(/-+$/, "") || "acme"}/join`}
                    onCopy={() => showToast("Invite link copied")}
                  />
                )}

                {step === 3 && (
                  <div className="ui-ob-templates" role="radiogroup" aria-label="Agent template">
                    {templates.map((t, i) => (
                      <button
                        key={t.id}
                        type="button"
                        role="radio"
                        aria-checked={template === t.id}
                        className="ui-ob-template"
                        style={{ "--i": i } as CSSProperties}
                        onClick={() => setTemplate(t.id)}
                      >
                        <span className="ui-ob-template__top">
                          <span className="ui-ob-template__icon">
                            <Icon icon={t.icon} size={17} />
                          </span>
                          <span className="ui-ob-template__check" aria-hidden="true">
                            <Icon icon={Tick02Icon} size={12} stroke={2.4} />
                          </span>
                        </span>
                        <b className="ui-ob-template__name">{t.name}</b>
                        <span className="ui-ob-template__text">{t.text}</span>
                        <span className="ui-ob-template__meta">{t.meta}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <footer className="ui-ob-foot">
                <button type="button" className="ui-ob-skip" onClick={skip}>
                  Skip for now
                </button>
                <span className="ui-ob-foot__actions">
                  {step > 0 && (
                    <Button size="sm" variant="secondary" icon={<Icon icon={ArrowLeft01Icon} size={14} />} onClick={() => go(step - 1)} disabled={creating}>
                      Back
                    </Button>
                  )}
                  <Button size="sm" type="submit" loading={creating} iconRight={step < 3 ? <Icon icon={ArrowRight01Icon} size={14} /> : undefined}>
                    {creating ? "Creating agent" : continueLabel}
                  </Button>
                </span>
              </footer>
            </form>
          )}
        </div>

        <aside className="ui-ob-aside" aria-label="Setup checklist">
          <SetupChecklist
            onSelect={go}
            help={{ icon: CustomerSupportIcon, title: "Need a hand?", text: "Book a free 15-minute setup call" }}
            steps={STEPS.map((s, i) => {
              const st = status[i] ?? (i === step ? "current" : "todo");
              return { id: s.id, title: s.title, state: st, sub: st === "done" ? summary(i) : st === "skipped" ? "Skipped – pick it up anytime" : st === "current" ? "In progress" : s.time };
            })}
          />
        </aside>
      </div>
      {toast}
    </AppShell>
  );
}

/* ---------- Invite step ---------- */

function Invites({
  invites,
  onChange,
  role,
  onRole,
  link,
  onCopy,
}: {
  invites: string[];
  onChange: (invites: string[]) => void;
  role: Role;
  onRole: (role: Role) => void;
  link: string;
  onCopy: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // Adds every valid address in the text; whatever isn't an email stays in the field with a hint
  const commit = (text: string) => {
    const parts = text.split(/[\s,;]+/).filter(Boolean);
    if (!parts.length) return true;
    const good = parts.filter((p) => EMAIL.test(p));
    const bad = parts.filter((p) => !EMAIL.test(p));
    const fresh = good.map((p) => p.toLowerCase()).filter((p, i, a) => !invites.includes(p) && a.indexOf(p) === i);
    if (fresh.length) onChange([...invites, ...fresh]);
    setDraft(bad.join(" "));
    setError(bad.length ? `“${bad[0]}” doesn't look like an email address.` : "");
    return bad.length === 0;
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === "," || e.key === " " || e.key === "Tab") && draft.trim()) {
      e.preventDefault();
      commit(draft);
    } else if (e.key === "Enter") {
      // An empty field: Enter continues as usual
    } else if (e.key === "Backspace" && !draft && invites.length) {
      onChange(invites.slice(0, -1));
    }
  };

  return (
    <div className="ui-ob-fields">
      <div className="ui-ob-field">
        <span className="ui-ob-label" id="ui-ob-invite-label">
          Email addresses
        </span>
        <div className="ui-ob-invite-row">
          <div className="ui-ob-chips" data-invalid={error ? true : undefined} onClick={() => input.current?.focus()}>
            {invites.map((email) => (
              <span key={email} className="ui-ob-chip">
                <span className="ui-ob-chip__avatar" aria-hidden="true">
                  {email[0].toUpperCase()}
                </span>
                {email}
                <button
                  type="button"
                  className="ui-ob-chip__remove"
                  aria-label={`Remove ${email}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(invites.filter((x) => x !== email));
                  }}
                >
                  <Icon icon={Cancel01Icon} size={11} stroke={2.2} />
                </button>
              </span>
            ))}
            <input
              ref={input}
              value={draft}
              aria-labelledby="ui-ob-invite-label"
              aria-invalid={error ? true : undefined}
              placeholder={invites.length ? "Add more…" : "name@company.com"}
              onChange={(e) => {
                setDraft(e.target.value);
                if (error) setError("");
              }}
              onKeyDown={onKey}
              onBlur={() => draft.trim() && commit(draft)}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text");
                if (/[\s,;]/.test(text.trim())) {
                  e.preventDefault();
                  commit(draft + " " + text);
                }
              }}
            />
          </div>
          <MenuButton value={role} options={roles} onChange={onRole} className="ui-ob-role" />
        </div>
        {error ? <span className="ui-ob-error">{error}</span> : <span className="ui-ob-hint">Separate several addresses with a comma or space.</span>}
      </div>

      <div className="ui-ob-link">
        <span className="ui-ob-link__icon">
          <Icon icon={Link01Icon} size={15} />
        </span>
        <span className="ui-ob-link__text">
          <b>Or share an invite link</b>
          <span>{link}</span>
        </span>
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon icon={Copy01Icon} size={14} />}
          onClick={() => {
            navigator.clipboard?.writeText(`https://${link}`).catch(() => {});
            onCopy();
          }}
        >
          Copy link
        </Button>
      </div>
    </div>
  );
}

/* ---------- Finished ---------- */

function Success({
  workspace,
  agent,
  tools,
  invites,
  onNavigate,
  onRestart,
}: {
  workspace: string;
  agent: string;
  tools: number;
  invites: number;
  onNavigate?: (label: string) => void;
  onRestart: () => void;
}) {
  const next = [
    { label: `Say hello to your ${agent} agent`, text: "Open a chat and give it its first task.", icon: BubbleChatIcon, to: "Chat" },
    { label: tools ? "Connect more tools" : "Connect your first tool", text: tools ? `${tools} connected – add the rest when you need them.` : "Agents get far more useful with your data.", icon: DashboardSquare02Icon, to: "Integrations" },
    { label: "See how your workspace is doing", text: invites ? `${invites} ${invites === 1 ? "teammate is" : "teammates are"} on the way.` : "Usage, agent runs and time saved.", icon: Analytics01Icon, to: "Analytics" },
  ];
  return (
    <div className="ui-ob-success">
      <div className="ui-ob-success__body">
      <span className="ui-ob-success__badge" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M6.5 12.5l3.5 3.5 7.5-8" pathLength={1} />
        </svg>
      </span>
      <h2 className="ui-ob-step__title">{workspace} is ready</h2>
      <p className="ui-ob-step__text">Your {agent} agent is set up and waiting for its first task.</p>
      <ul className="ui-ob-next">
        {next.map((n, i) => (
          <li key={n.label} style={{ "--i": i } as CSSProperties}>
            <button type="button" className="ui-ob-next__item" onClick={() => onNavigate?.(n.to)}>
              <span className="ui-ob-next__icon">
                <Icon icon={n.icon} size={16} />
              </span>
              <span className="ui-ob-next__text">
                <b>{n.label}</b>
                <span>{n.text}</span>
              </span>
              <Icon icon={ArrowRight01Icon} size={14} />
            </button>
          </li>
        ))}
      </ul>
      </div>
      <footer className="ui-ob-foot">
        <button type="button" className="ui-ob-skip" onClick={onRestart}>
          Start over
        </button>
        <Button size="sm" iconRight={<Icon icon={ArrowRight01Icon} size={14} />} onClick={() => onNavigate?.("Chat")}>
          Open chat
        </Button>
      </footer>
    </div>
  );
}

/* ---------- Styles ---------- */
