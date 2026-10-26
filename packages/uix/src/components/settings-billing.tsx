"use client";

/*
 * Settings & Billing – the settings page of an AI product, in a single file.
 * Tabs for General, Members, Billing and API keys in a bar that stays at the top while the page scrolls.
 * Billing shows the current plan, usage (credits, seats, storage), the payment method and billing email,
 * a monthly/yearly plan comparison and the invoices. Every action works and answers with a short toast.
 * Sits in the affectUI App Shell; uses the Usage Meter, Segmented Control and Button from the library,
 * icons from the Hugeicons free set.
 */

import { useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  Analytics01Icon,
  BubbleChatIcon,
  Copy01Icon,
  CreditCardIcon,
  DashboardSquare02Icon,
  Delete02Icon,
  Download04Icon,
  Folder01Icon,
  Globe02Icon,
  ImageUpload01Icon,
  Key01Icon,
  Mail01Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  PlusSignIcon,
  Settings01Icon,
  Tick02Icon,
  UserAdd01Icon,
} from "~/lib/icons";
import { Button } from "~/components/button";
import { SegmentedControl } from "~/components/segmented-control";
import { UsageMeter, type UsageDay } from "~/components/usage-meter";
import { AvatarUpload } from "~/components/arc/avatar-upload/avatar-upload";
import { ProfileFields, useHandleCheck } from "~/containers/profile-fields";
import { AppearanceSettings } from "~/containers/appearance-settings";
import { fadeViewTransition } from "~/lib/view-transition";
import {
  AppShell,
  Dropdown,
  EmptyState,
  Icon,
  IconButton,
  MenuButton,
  Popover,
  Tabs,
  useToast,
  type AppShellProps,
  type ShellNavItem,
} from "~/components/app-shell";

/* ---------- Sample content – replace with your own data ---------- */

const nav: ShellNavItem[] = [
  { label: "New chat", icon: PencilEdit02Icon },
  { label: "Chat", icon: BubbleChatIcon },
  { label: "Folders", icon: Folder01Icon },
  { label: "Integrations", icon: DashboardSquare02Icon },
  { label: "Analytics", icon: Analytics01Icon },
  { label: "Settings", icon: Settings01Icon },
];

export type SettingsTab = "General" | "Members" | "Appearance" | "API keys";
const tabs: SettingsTab[] = ["General", "Members", "Appearance", "API keys"];

type Cycle = "monthly" | "yearly";
type Plan = { id: string; name: string; monthly: number; yearly: number; blurb: string; features: string[] };

/** Yearly prices are per month, billed once a year */
const plans: Plan[] = [
  { id: "starter", name: "Starter", monthly: 19, yearly: 15, blurb: "For individuals trying things out", features: ["10,000 credits / month", "3 seats", "10 GB storage"] },
  { id: "pro", name: "Pro", monthly: 49, yearly: 39, blurb: "For small teams shipping every day", features: ["50,000 credits / month", "10 seats", "100 GB storage", "Agents and API access"] },
  { id: "team", name: "Team", monthly: 99, yearly: 79, blurb: "For growing teams with more seats", features: ["150,000 credits / month", "25 seats", "1 TB storage", "SSO and audit log"] },
];

const RENEWS = "Nov 12, 2026";

type Invoice = { id: string; date: string; amount: string; status: "Paid" | "Due" };
const invoices: Invoice[] = [
  { id: "INV-2026-0412", date: "Oct 12, 2026", amount: "$49.00", status: "Due" },
  { id: "INV-2026-0371", date: "Sep 12, 2026", amount: "$49.00", status: "Paid" },
  { id: "INV-2026-0329", date: "Aug 12, 2026", amount: "$69.00", status: "Paid" },
  { id: "INV-2026-0288", date: "Jul 12, 2026", amount: "$49.00", status: "Paid" },
  { id: "INV-2026-0240", date: "Jun 12, 2026", amount: "$49.00", status: "Paid" },
];

type Role = "Owner" | "Admin" | "Member" | "Viewer";
type Member = { id: string; name: string; email: string; role: Role; invited?: boolean };
const initialMembers: Member[] = [
  { id: "m1", name: "Alex Morgan", email: "alex@acme.com", role: "Owner" },
  { id: "m2", name: "Priya Shah", email: "priya@acme.com", role: "Admin" },
  { id: "m3", name: "Jonas Weber", email: "jonas@acme.com", role: "Member" },
  { id: "m4", name: "Mia Chen", email: "mia@acme.com", role: "Member" },
  { id: "m5", name: "Leo Martins", email: "leo@acme.com", role: "Viewer" },
];
const roles: { value: Role; label: string }[] = (["Admin", "Member", "Viewer"] as const).map((r) => ({ value: r, label: r }));

type ApiKey = { id: string; name: string; secret: string; created: string; lastUsed: string };
const initialKeys: ApiKey[] = [
  { id: "k1", name: "Production", secret: "sk-live-4f9a2c71d0e84b6a8F2q", created: "Mar 4, 2026", lastUsed: "2 minutes ago" },
  { id: "k2", name: "Staging", secret: "sk-test-91bd03e6aa7c4f12Lm7x", created: "May 18, 2026", lastUsed: "Yesterday" },
  { id: "k3", name: "Zapier sync", secret: "sk-live-0c6e57b2f1a948d3Qz4k", created: "Aug 2, 2026", lastUsed: "Sep 28, 2026" },
];

type Region = "eu" | "us" | "ap";
const regions: { value: Region; label: string }[] = [
  { value: "eu", label: "Europe (Frankfurt)" },
  { value: "us", label: "United States (Virginia)" },
  { value: "ap", label: "Asia Pacific (Singapore)" },
];

/** Credits per day this period – null for the days still to come */
const daily: UsageDay[] = Array.from({ length: 30 }, (_, i) => ({
  label: `Oct ${i + 1}`,
  value: i < 10 ? Math.round(900 + 650 * Math.abs(Math.sin(i * 1.3)) + i * 40) : null,
}));

const mask = (secret: string) => `${secret.slice(0, 8)}••••••••••••${secret.slice(-4)}`;
const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");

export type SettingsBillingScreenProps = Pick<AppShellProps, "onNavigate" | "workspace" | "user" | "className"> & {
  /** Tab that is open first */
  defaultTab?: SettingsTab;
};

export type SettingsContentProps = {
  workspace?: string;
  userName?: string;
  defaultTab?: SettingsTab;
  onClose?: () => void;
};

export function SettingsBillingScreen({ defaultTab = "Appearance", ...props }: SettingsBillingScreenProps) {
  return <AppShell active="Settings" nav={nav} {...props}><SettingsContent workspace={props.workspace} userName={props.user?.name} defaultTab={defaultTab} /></AppShell>;
}

/** The installed AffectUI settings layout, embedded in the current workspace's main window. */
export function SettingsContent({ defaultTab = "Appearance", workspace = "Dojo", userName = "Sam Rivera", onClose }: SettingsContentProps) {
  const [tab, setTab] = useState<SettingsTab>(defaultTab);
  const [profile, setProfile] = useState<AccountProfile>({ name: userName, handle: userName.toLowerCase().replace(/[^a-z0-9]/g, "") });
  const [toast, showToast] = useToast();
  return <section className="ui-sb" role="region" aria-label="Account settings">
    <style href="ui-settings-billing" precedence="default">{css}</style>
    {onClose && <button type="button" className="ui-sb-back" onClick={onClose}>Back to workspace</button>}
    <h1 className="ui-as-page-title" tabIndex={-1}>Settings</h1>
    <p className="ui-as-page-sub">Your profile, appearance, members and API access.</p>
    <div className="ui-as-toolbar ui-sb__bar">
      <Tabs items={tabs} value={tab} onChange={next => setTab(next as SettingsTab)} />
    </div>
    <div key={tab} className="ui-sb__body">
      <div className="ui-sb__content">
        {tab === "General" && <GeneralTab profile={profile} onSave={setProfile} toast={showToast} />}
        {tab === "Members" && <MembersTab toast={showToast} />}
        {tab === "Appearance" && <div className="ui-account-appearance"><AppearanceSettings /></div>}
        {tab === "API keys" && <KeysTab toast={showToast} />}
      </div>
      <aside className="ui-sb-help" aria-label={`About ${tab}`}>
        <p>{help[tab].about}</p>
        <small>{help[tab].tip}</small>
      </aside>
    </div>
    {toast}
  </section>;
}

type Toast = (text: string) => void;
const help: Record<SettingsTab, { about: string; tip: string }> = {
  General: {
    about: "Your name and photo help other learners recognise you. Your handle is the address of your Dojo profile.",
    tip: "A photo is optional. Choose a handle with 3–24 letters, numbers or dashes, and save when you’re ready.",
  },
  Members: {
    about: "Manage the people in your workspace and the role each person has. Invite someone when you want to learn or work together.",
    tip: "Review a person’s role before inviting them. Remove access when they no longer need the workspace.",
  },
  Appearance: {
    about: "Make Dojo comfortable to work in. Choose a light or dark interface, then the theme and syntax colours that suit you.",
    tip: "Match theme pairs the editor with your interface. Pick a separate colour scheme to keep your preferred syntax colours.",
  },
  "API keys": {
    about: "API keys let scripts, integrations and developer tools authenticate with Dojo without signing in through the interface each time.",
    tip: "Treat keys like passwords. Keep them out of public repositories and shared messages. Replace exposed keys and delete ones you no longer use.",
  },
};

/* ---------- Billing ---------- */

function BillingTab({ toast }: { toast: Toast }) {
  const [current, setCurrent] = useState<{ id: string; cycle: Cycle }>({ id: "pro", cycle: "monthly" });
  const [cycle, setCycle] = useState<Cycle>("monthly");
  const [canceled, setCanceled] = useState(false);
  const [email, setEmail] = useState("billing@acme.com");
  const [draft, setDraft] = useState<string | null>(null);
  const plansRef = useRef<HTMLElement>(null);

  const plan = plans.find((p) => p.id === current.id)!;
  const price = current.cycle === "monthly" ? `$${plan.monthly}/mo` : `$${plan.yearly * 12}/yr`;

  const saveEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!draft?.includes("@")) return;
    setEmail(draft.trim());
    setDraft(null);
    toast("Billing email updated");
  };

  return (
    <>
      <div className="ui-sb-overview">
        <div className="ui-sb-usage ui-as-rise" style={{ "--i": 0 } as CSSProperties}>
          <UsageMeter
            title="Usage this period"
            plan={`${plan.name} plan`}
            total={50000}
            used={[
              { label: "Chat", value: 18400 },
              { label: "Agents", value: 9200 },
              { label: "API", value: 4100 },
              { label: "Images", value: 2300 },
            ]}
            limits={[
              { label: "Seats", used: 8, total: 10 },
              { label: "Storage", used: 42.6, total: 100, unit: "GB" },
            ]}
            daily={daily}
            resetAt={new Date(2026, 10, 12)}
            onUpgrade={(state) => toast(state === "ok" ? "Opening plans" : "1,000 credits added")}
          />
        </div>
        <div className="ui-sb-stack">
          {/* Current plan */}
          <section className="ui-sb-card ui-sb-plan ui-as-rise" style={{ "--i": 1 } as CSSProperties}>
            <div className="ui-sb-plan__top">
              <span className="ui-sb-cap">Current plan</span>
              <span className="ui-sb-pill" data-tone={canceled ? "amber" : "green"}>
                {canceled ? "Cancels soon" : "Active"}
              </span>
            </div>
            <strong className="ui-sb-plan__name">
              {plan.name} <span>· {price}</span>
            </strong>
            <p className="ui-sb-muted">
              {canceled ? `Your plan ends on ${RENEWS}. You keep every feature until then.` : `Renews on ${RENEWS} · billed ${current.cycle}`}
            </p>
            <div className="ui-sb-actions">
              <Button size="sm" onClick={() => plansRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}>
                Change plan
              </Button>
              {canceled ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setCanceled(false);
                    toast(`${plan.name} plan resumed`);
                  }}
                >
                  Resume plan
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCanceled(true);
                    toast(`Plan canceled – active until ${RENEWS}`);
                  }}
                >
                  Cancel plan
                </Button>
              )}
            </div>
          </section>

          {/* Payment method and billing email */}
          <section className="ui-sb-card ui-sb-pay ui-as-rise" style={{ "--i": 2 } as CSSProperties}>
            <div className="ui-sb-pay__row">
              <span className="ui-sb-visa" aria-hidden="true">
                VISA
              </span>
              <span className="ui-sb-pay__text">
                <b>Visa •••• 4242</b>
                <span>Expires 08/2028</span>
              </span>
              <Button size="sm" variant="secondary" icon={<Icon icon={CreditCardIcon} size={14} />} onClick={() => toast("Payment method updated")}>
                Update
              </Button>
            </div>
            <div className="ui-sb-pay__row">
              <span className="ui-sb-tile" aria-hidden="true">
                <Icon icon={Mail01Icon} size={15} />
              </span>
              {draft === null ? (
                <>
                  <span className="ui-sb-pay__text">
                    <b>{email}</b>
                    <span>Invoices and receipts go here</span>
                  </span>
                  <Button size="sm" variant="secondary" onClick={() => setDraft(email)}>
                    Edit
                  </Button>
                </>
              ) : (
                <form className="ui-sb-inline" onSubmit={saveEmail}>
                  <input
                    className="ui-sb-input"
                    type="email"
                    autoFocus
                    value={draft}
                    aria-label="Billing email"
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setDraft(null)}
                  />
                  <Button size="sm" type="submit" disabled={!draft.includes("@")}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" type="button" onClick={() => setDraft(null)}>
                    Cancel
                  </Button>
                </form>
              )}
            </div>
          </section>
        </div>

      </div>

      {/* Plans */}
      <section ref={plansRef} className="ui-sb-section">
        <div className="ui-sb-section__head">
          <div>
            <h2 className="ui-sb-h2">Plans</h2>
            <p className="ui-sb-muted">Switch any time – we prorate the difference.</p>
          </div>
          <SegmentedControl
            size="compact"
            label="Billing period"
            value={cycle}
            onChange={value => setCycle(value as Cycle)}
            options={["monthly", "yearly"]}
          />
        </div>
        <div className="ui-sb-plans">
          {plans.map((p, i) => {
            const isCurrent = p.id === current.id && cycle === current.cycle;
            const label = p.id === current.id ? `Switch to ${cycle}` : `Switch to ${p.name}`;
            return (
              <div key={p.id} className="ui-sb-card ui-sb-tier ui-as-rise" data-current={p.id === current.id || undefined} style={{ "--i": i } as CSSProperties}>
                <div className="ui-sb-tier__top">
                  <b>{p.name}</b>
                  {p.id === current.id && <span className="ui-sb-pill">Current</span>}
                </div>
                <div className="ui-sb-tier__price">
                  <strong key={cycle}>${cycle === "monthly" ? p.monthly : p.yearly}</strong>
                  <span>/ month{cycle === "yearly" ? ", billed yearly" : ""}</span>
                </div>
                <p className="ui-sb-muted">{p.blurb}</p>
                <ul className="ui-sb-tier__list">
                  {p.features.map((f) => (
                    <li key={f}>
                      <Icon icon={Tick02Icon} size={14} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant={isCurrent ? "secondary" : p.id === "team" ? "primary" : "secondary"}
                  disabled={isCurrent}
                  onClick={() => {
                    setCurrent({ id: p.id, cycle });
                    setCanceled(false);
                    toast(`Switched to ${p.name} · ${cycle}`);
                  }}
                >
                  {isCurrent ? "Current plan" : label}
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Invoices */}
      <section className="ui-sb-section">
        <div className="ui-sb-section__head">
          <h2 className="ui-sb-h2">Invoices</h2>
          <Button size="sm" variant="secondary" icon={<Icon icon={Download04Icon} size={14} />} onClick={() => toast("Downloading all invoices")}>
            Download all
          </Button>
        </div>
        <div className="ui-sb-table-wrap">
          <table className="ui-sb-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Invoice</th>
                <th className="ui-sb-num">Amount</th>
                <th>Status</th>
                <th aria-label="Download" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.date}</td>
                  <td className="ui-sb-mono">{inv.id}</td>
                  <td className="ui-sb-num">{inv.amount}</td>
                  <td>
                    <span className="ui-sb-pill" data-tone={inv.status === "Paid" ? "green" : "amber"}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="ui-sb-end">
                    <IconButton icon={Download04Icon} label={`Download ${inv.id}`} onClick={() => toast(`Downloaded ${inv.id}.pdf`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ---------- General ---------- */

type AccountProfile = { name: string; handle: string; photo?: string };

function GeneralTab({ profile, onSave, toast }: { profile: AccountProfile; onSave: (profile: AccountProfile) => void; toast: Toast }) {
  const [name, setName] = useState(profile.name);
  const [handle, setHandle] = useState(profile.handle);
  const handleState = useHandleCheck(handle);
  const dirty = name.trim() !== profile.name || handle !== profile.handle;
  const valid = Boolean(name.trim()) && handleState === "available";
  return <form className="ui-sb-tray ui-sb-form" onSubmit={event => {
    event.preventDefault();
    if (!dirty || !valid) return;
    onSave({ ...profile, name: name.trim(), handle });
    setName(name.trim());
    toast("Profile settings saved");
  }}>
    <div className="ui-sb-card ui-sb-profile__fields">
      <AvatarUpload name={name || profile.name} src={profile.photo}
        onUpload={(image, { report, signal }) => new Promise<string>((resolve, reject) => {
          // The Storybook workspace keeps the chosen crop locally; no simulated network upload.
          const reader = new FileReader();
          const cancel = () => reader.abort();
          signal.addEventListener("abort", cancel, { once: true });
          reader.onprogress = event => { if (event.lengthComputable) report(event.loaded / event.total); };
          reader.onerror = () => reject(new Error("That photo couldn’t be saved. Try again."));
          reader.onabort = () => reject(new DOMException("Upload canceled", "AbortError"));
          reader.onload = () => {
            if (signal.aborted) return;
            const photo = String(reader.result);
            onSave({ ...profile, photo });
            report(1);
            resolve(photo);
          };
          reader.onloadend = () => signal.removeEventListener("abort", cancel);
          if (signal.aborted) { reject(new DOMException("Upload canceled", "AbortError")); return; }
          reader.readAsDataURL(image);
        })}
        onRemove={() => onSave({ ...profile, photo: undefined })} />
      <ProfileFields name={name} handle={handle} handleState={handleState} onNameChange={setName} onHandleChange={setHandle} />
    </div>
    <div className="ui-sb-form__foot">
      <Button type="button" size="sm" variant="ghost" disabled={!dirty} onClick={() => { setName(profile.name); setHandle(profile.handle); }}>Discard</Button>
      <Button type="submit" size="sm" disabled={!dirty || !valid}>Save changes</Button>
    </div>
  </form>;
}

/* ---------- Members ---------- */

function MembersTab({ toast }: { toast: Toast }) {
  const [members, setMembers] = useState(initialMembers);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  const invite = (e: FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const address = email.trim();
    setMembers((list) => [...list, { id: `m${Date.now()}`, name: address.split("@")[0], email: address, role: "Member", invited: true }]);
    setEmail("");
    setOpen(false);
    toast(`Invite sent to ${address}`);
  };

  return (
    <section className="ui-sb-section ui-sb-section--first">
      <div className="ui-sb-section__head">
        <div>
          <h2 className="ui-sb-h2">Members</h2>
          <p className="ui-sb-muted">{members.length} of 10 seats used</p>
        </div>
        <span className="ui-as-anchor">
          <Button size="sm" icon={<Icon icon={UserAdd01Icon} size={14} />} onClick={() => setOpen((o) => !o)}>
            Invite
          </Button>
          <Popover open={open} onClose={() => setOpen(false)} align="end" className="ui-as-menu ui-sb-invite">
            <form onSubmit={invite}>
              <b>Invite a teammate</b>
              <span>They get an email with a link to join.</span>
              <input className="ui-sb-input" autoFocus type="email" value={email} placeholder="name@company.com" aria-label="Email address" onChange={(e) => setEmail(e.target.value)} />
              <Button size="sm" type="submit" disabled={!valid}>
                Send invite
              </Button>
            </form>
          </Popover>
        </span>
      </div>
      <div className="ui-sb-tray">
      <div className="ui-sb-tray__head" aria-hidden="true">
        <span>Member</span>
        <span className="ui-sb-tray__end">Role</span>
      </div>
      <div className="ui-sb-card ui-sb-list">
        {members.map((m, i) => (
          <div key={m.id} className="ui-sb-row ui-as-rise" style={{ "--i": i } as CSSProperties}>
            <span className="ui-sb-avatar" data-tone={i % 4}>
              {initials(m.name)}
            </span>
            <span className="ui-sb-row__text">
              <b>
                {m.name}
                {m.invited && <span className="ui-sb-pill">Invited</span>}
              </b>
              <span>{m.email}</span>
            </span>
            {m.role === "Owner" ? (
              <span className="ui-sb-role">Owner</span>
            ) : (
              <MenuButton
                value={m.role}
                options={roles}
                onChange={(role) => {
                  setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, role } : x)));
                  toast(`${m.name} is now ${role.toLowerCase() === "admin" ? "an" : "a"} ${role}`);
                }}
              />
            )}
            {m.role === "Owner" ? (
              <span className="ui-sb-row__spacer" />
            ) : (
              <Dropdown
                align="end"
                items={[
                  ...(m.invited ? [{ label: "Resend invite", icon: Mail01Icon, onSelect: () => toast(`Invite resent to ${m.email}`) }] : []),
                  {
                    label: m.invited ? "Revoke invite" : "Remove from workspace",
                    icon: Delete02Icon,
                    danger: true,
                    onSelect: () => {
                      setMembers((list) => list.filter((x) => x.id !== m.id));
                      toast(m.invited ? `Invite to ${m.email} revoked` : `${m.name} removed`);
                    },
                  },
                ]}
                trigger={({ open, toggle }) => (
                  <button type="button" className="ui-as-tool" aria-label={`More for ${m.name}`} aria-expanded={open} onClick={toggle}>
                    <Icon icon={MoreHorizontalIcon} size={15} />
                  </button>
                )}
              />
            )}
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}

/* ---------- API keys ---------- */

function KeysTab({ toast }: { toast: Toast }) {
  const [keys, setKeys] = useState(initialKeys);

  const create = () => {
    const n = keys.length + 1;
    const secret = `sk-live-${Array.from({ length: 20 }, () => "0123456789abcdefABCDEFxyz"[Math.floor(Math.random() * 25)]).join("")}`;
    setKeys((list) => [{ id: `k${Date.now()}`, name: `New key ${n}`, secret, created: "Just now", lastUsed: "Never" }, ...list]);
    toast("API key created");
  };
  const copy = (k: ApiKey) => {
    navigator.clipboard?.writeText(k.secret).catch(() => {});
    toast(`${k.name} key copied`);
  };

  return (
    <section className="ui-sb-section ui-sb-section--first">
      <div className="ui-sb-section__head">
        <div>
          <h2 className="ui-sb-h2">API keys</h2>
          <p className="ui-sb-muted">Keys give full access to this workspace – keep them secret.</p>
        </div>
        <Button size="sm" icon={<Icon icon={PlusSignIcon} size={14} />} onClick={create}>
          Create key
        </Button>
      </div>
      {keys.length === 0 ? (
        <div className="ui-as-rise">
          <EmptyState title="No API keys" text="Create a key to call the API from your own code." />
        </div>
      ) : (
        <div className="ui-sb-tray">
        <div className="ui-sb-tray__head" aria-hidden="true">
          <span>Name</span>
          <span className="ui-sb-tray__end ui-sb-tray__end--key">Key</span>
        </div>
        <div className="ui-sb-card ui-sb-list">
          {keys.map((k, i) => (
            <div key={k.id} className="ui-sb-row ui-as-rise" style={{ "--i": i } as CSSProperties}>
              <span className="ui-sb-tile" aria-hidden="true">
                <Icon icon={Key01Icon} size={15} />
              </span>
              <span className="ui-sb-row__text">
                <b>{k.name}</b>
                <span>
                  Created {k.created} · last used {k.lastUsed}
                </span>
              </span>
              <code className="ui-sb-key">{mask(k.secret)}</code>
              <IconButton icon={Copy01Icon} label={`Copy ${k.name} key`} onClick={() => copy(k)} />
              <button
                type="button"
                className="ui-as-tool ui-sb-danger"
                aria-label={`Revoke ${k.name} key`}
                title="Revoke"
                onClick={() => {
                  setKeys((list) => list.filter((x) => x.id !== k.id));
                  toast(`${k.name} key revoked`);
                }}
              >
                <Icon icon={Delete02Icon} size={15} />
              </button>
            </div>
          ))}
        </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
.ui-sb-back { display: block; margin-bottom: 20px; color: var(--muted); font-size: var(--fs-body); }
.ui-sb-back:hover { color: var(--ink); }
/* Settings & Billing – a centered column of white cards on the panel */
.ui-sb {
  width: min(1040px, calc(100% - 64px));
  margin: 0 auto;
  padding: 40px 0 64px;
}
.ui-sb__bar {
  position: sticky;
  top: 0;
  z-index: 5;
  margin: 10px -16px 0;
  padding: 18px 16px 12px;
  background: var(--panel);
}
/* Soft fade below the bar, so content dissolves instead of being cut by a line */
.ui-sb__bar::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 24px;
  background: linear-gradient(to bottom, var(--panel), transparent);
  pointer-events: none;
}
.ui-sb__body { display: grid; grid-template-columns: minmax(0, 1.8fr) minmax(240px, 1fr); gap: 48px; align-items: start; margin-top: 14px; }
.ui-sb__content { min-width: 0; }
.ui-sb-help { position: sticky; top: 112px; display: grid; gap: 12px; padding-top: 12px; }
.ui-sb-help p { margin: 0; color: var(--text); font-size: 17px; line-height: 1.55; text-wrap: pretty; }
.ui-sb-help small { color: var(--muted); font-size: var(--fs-body); line-height: 1.5; }
.ui-sb-profile__fields { display: grid; gap: 28px; padding: 24px; }
@container ui-as-main (max-width: 900px) {
  .ui-sb__body { grid-template-columns: minmax(0, 1fr); gap: 28px; }
  .ui-sb-help { position: static; }
}
@container ui-as-main (max-width: 620px) {
  .ui-sb-profile__fields { padding: 20px 16px; }
  .ui-account-appearance .ui-setup__looks { grid-template-columns: minmax(0, 1fr); }
}

.ui-sb-card {
  border-radius: 14px;
  background: var(--card);
  box-shadow: 0 0 0 1px var(--line), var(--shadow);
}
.ui-sb-cap { font-size: 13px; color: var(--muted); }
.ui-sb-muted { margin: 0; font-size: 13px; line-height: 19px; color: var(--muted); }
.ui-sb-h2 { margin: 0; font-size: 15px; line-height: 20px; font-weight: 500; color: var(--ink); }
.ui-sb-actions { display: flex; align-items: center; gap: 6px; }

/* Small status pills: neutral, green (paid, active), amber (due, canceling) */
.ui-sb-pill {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 7px;
  border-radius: 999px;
  background: var(--chip);
  font-size: 11.5px;
  font-weight: 500;
  line-height: 1;
  color: var(--text);
  white-space: nowrap;
}
.ui-sb-pill[data-tone="green"] { background: #ecfdf3; color: #15803d; }
.ui-sb-pill[data-tone="amber"] { background: #fff7e6; color: #b45309; }
:where(.dark, [data-theme="dark"]) .ui-sb-pill[data-tone="green"] { background: rgba(34, 197, 94, 0.14); color: #4ade80; }
:where(.dark, [data-theme="dark"]) .ui-sb-pill[data-tone="amber"] { background: rgba(245, 158, 11, 0.14); color: #fbbf24; }

/* Overview: usage across the full width, plan and payment side by side below */
.ui-sb-overview { display: grid; gap: 16px; }
.ui-sb-stack { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: stretch; }
.ui-sb-usage .ui-um { max-width: none; }

/* Wide: the meter in two columns so it stays low – figure, bar and categories left; daily bars and limits right */
@container ui-as-main (min-width: 901px) {
  .ui-sb-usage .ui-um__inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    column-gap: 40px;
    padding: 16px 20px 18px;
  }
  .ui-sb-usage .ui-um__head { grid-column: 1; grid-row: 1; }
  .ui-sb-usage .ui-um__figure { grid-column: 1; grid-row: 2; }
  .ui-sb-usage .ui-um__bar { grid-column: 1; grid-row: 3; }
  .ui-sb-usage .ui-um__legend { grid-column: 1; grid-row: 4; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 24px; }
  .ui-sb-usage .ui-um__daily { grid-column: 2; grid-row: 1 / span 3; align-self: end; margin-top: 0; }
  .ui-sb-usage .ui-um__daily .ui-um__spark { height: 64px; }
  .ui-sb-usage .ui-um__limits { grid-column: 2; grid-row: 4; align-self: start; margin-top: 10px; }
}

.ui-sb-plan { display: grid; gap: 8px; padding: 16px 18px 18px; }
.ui-sb-plan__top { display: flex; align-items: center; justify-content: space-between; }
.ui-sb-plan__name { font-size: 22px; line-height: 28px; font-weight: 500; letter-spacing: -0.02em; color: var(--ink); }
.ui-sb-plan__name span { color: var(--muted); font-weight: 400; }
.ui-sb-plan .ui-sb-actions { margin-top: 8px; }

.ui-sb-pay { display: grid; padding: 4px 18px; }
.ui-sb-pay__row { display: flex; align-items: center; gap: 12px; min-height: 64px; }
.ui-sb-pay__row + .ui-sb-pay__row { border-top: 1px solid var(--line-soft); }
.ui-sb-pay__text { display: grid; flex: 1; gap: 2px; min-width: 0; }
.ui-sb-pay__text b, .ui-sb-row__text b { display: flex; align-items: center; gap: 8px; overflow: hidden; font-size: 13.5px; line-height: 19px; font-weight: 500; color: var(--ink); white-space: nowrap; text-overflow: ellipsis; }
.ui-sb-pay__text span, .ui-sb-row__text > span { overflow: hidden; font-size: 12.5px; line-height: 17px; color: var(--muted); white-space: nowrap; text-overflow: ellipsis; }
.ui-sb-visa {
  display: grid;
  place-items: center;
  flex: none;
  width: 42px;
  height: 28px;
  border-radius: 6px;
  background: #1a1f71;
  font-size: 11px;
  font-style: italic;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: #ffffff;
}
.ui-sb-tile {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--chip);
  color: var(--muted);
}
.ui-sb-pay .ui-sb-tile { width: 42px; height: 28px; border-radius: 6px; }
.ui-sb-inline { display: flex; flex: 1; align-items: center; gap: 6px; min-width: 0; }
.ui-sb-inline .ui-sb-input { flex: 1; min-width: 0; }

.ui-sb-input {
  height: 34px;
  padding: 0 10px;
  border: 0;
  border-radius: 9px;
  background: var(--card);
  box-shadow: 0 0 0 1px var(--line);
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  outline: none;
  transition: box-shadow 140ms ease;
}
.ui-sb-input::placeholder { color: var(--placeholder); }
.ui-sb-input:focus { box-shadow: 0 0 0 1px var(--line-strong), 0 0 0 3px var(--hover); }

/* Sections below the overview */
.ui-sb-section { margin-top: 40px; scroll-margin-top: 72px; }
.ui-sb-section--first { margin-top: 10px; }
.ui-sb-section__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.ui-sb-section__head .ui-sb-muted { margin-top: 2px; }

.ui-sb-plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.ui-sb-tier { display: flex; flex-direction: column; gap: 10px; padding: 16px 18px 18px; }
/* Current plan: a darker gray hairline with a wider soft gray halo around it – highlighted, still quiet */
.ui-sb-tier[data-current] {
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ink) 22%, transparent),
    0 0 0 5px color-mix(in srgb, var(--ink) 6%, transparent),
    var(--shadow);
}
.ui-sb-tier__top { display: flex; align-items: center; justify-content: space-between; height: 20px; }
.ui-sb-tier__top b { font-size: 14px; font-weight: 500; color: var(--ink); }
.ui-sb-tier__price { display: flex; align-items: baseline; gap: 6px; }
.ui-sb-tier__price strong { font-size: 26px; line-height: 32px; font-weight: 500; letter-spacing: -0.02em; color: var(--ink); font-variant-numeric: tabular-nums; animation: ui-as-rise 360ms var(--ease) both; }
.ui-sb-tier__price span { font-size: 12.5px; color: var(--muted); }
.ui-sb-tier__list { display: grid; gap: 7px; flex: 1; margin: 4px 0 6px; padding: 12px 0 0; border-top: 1px solid var(--line-soft); list-style: none; }
.ui-sb-tier__list li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text); }
.ui-sb-tier__list svg { color: var(--muted); }
.ui-sb-tier .ui-button { width: 100%; }

/* Invoices: a plain table in a card */
/* Invoices: the header row sits on a gray tray, the rows in a white card inside it */
.ui-sb-table-wrap { overflow-x: auto; padding: 0 4px 4px; border-radius: 18px; background: var(--tray); }
.ui-sb-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
.ui-sb-table th {
  height: 38px;
  padding: 0 18px;
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  text-align: left;
  white-space: nowrap;
}
.ui-sb-table td { height: 52px; padding: 0 18px; background: var(--card); color: var(--text); white-space: nowrap; transition: background-color 140ms ease; }
.ui-sb-table tbody tr + tr td { border-top: 1px solid var(--line-soft); }
.ui-sb-table tbody tr:first-child td { border-top: 1px solid var(--line); }
.ui-sb-table tbody tr:last-child td { border-bottom: 1px solid var(--line); }
.ui-sb-table tbody td:first-child { border-left: 1px solid var(--line); }
.ui-sb-table tbody td:last-child { border-right: 1px solid var(--line); }
.ui-sb-table tbody tr:first-child td:first-child { border-top-left-radius: 14px; }
.ui-sb-table tbody tr:first-child td:last-child { border-top-right-radius: 14px; }
.ui-sb-table tbody tr:last-child td:first-child { border-bottom-left-radius: 14px; }
.ui-sb-table tbody tr:last-child td:last-child { border-bottom-right-radius: 14px; }
.ui-sb-table tbody tr:hover td { background: var(--subtle); }
.ui-sb-table .ui-sb-num { text-align: right; font-variant-numeric: tabular-nums; }
.ui-sb-table td.ui-sb-num { color: var(--ink); }
.ui-sb-table .ui-sb-end { width: 1%; padding-right: 12px; }
.ui-sb-mono { font-variant-numeric: tabular-nums; color: var(--muted) !important; }

/* General: label on the left, control on the right */
/* Gray tray around a white card, like the library components: column labels or actions sit on the gray */
.ui-sb-tray { padding: 0 4px 4px; border-radius: 18px; background: var(--tray); }
.ui-sb-tray > .ui-sb-card { box-shadow: 0 0 0 1px var(--line); }
.ui-sb-tray__head { display: flex; align-items: center; justify-content: space-between; height: 38px; padding: 0 18px; font-size: 12px; font-weight: 500; color: var(--muted); }
.ui-sb-tray__end { padding-right: 44px; }
.ui-sb-tray__end--key { padding-right: 258px; }

.ui-sb-form { display: grid; padding: 4px; }
.ui-sb-form__fields { padding: 4px 22px; }
.ui-sb-field { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 24px; align-items: center; padding: 20px 0; }
.ui-sb-field + .ui-sb-field { border-top: 1px solid var(--line-soft); }
.ui-sb-field__label { display: grid; gap: 3px; }
.ui-sb-field__label b { font-size: 13.5px; font-weight: 500; color: var(--ink); }
.ui-sb-field__label span { font-size: 12.5px; line-height: 17px; color: var(--muted); }
.ui-sb-logo-row { display: flex; align-items: center; gap: 12px; }
.ui-sb-logo {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--ink);
  font-size: 18px;
  font-weight: 600;
  color: var(--on-ink);
}
.ui-sb-form__foot { display: flex; justify-content: flex-end; gap: 6px; padding: 6px 2px 2px; }

/* Members and API keys: rows in one card */
.ui-sb-list { display: grid; padding: 4px 8px; }
.ui-sb-row { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 0 10px; }
.ui-sb-row + .ui-sb-row { border-top: 1px solid var(--line-soft); }
.ui-sb-row__text { display: grid; flex: 1; gap: 2px; min-width: 0; }
.ui-sb-row__spacer { width: 32px; flex: none; }
.ui-sb-role { padding: 0 10px; font-size: 13px; color: var(--muted); }
.ui-sb-avatar {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #eef3ff;
  font-size: 12px;
  font-weight: 500;
  color: #3756d9;
}
.ui-sb-avatar[data-tone="1"] { background: #fdf2f8; color: #be185d; }
.ui-sb-avatar[data-tone="2"] { background: #ecfdf3; color: #15803d; }
.ui-sb-avatar[data-tone="3"] { background: #fff7e6; color: #b45309; }
:where(.dark, [data-theme="dark"]) .ui-sb-avatar { background: rgba(109, 139, 255, 0.16); color: #a5b8ff; }
:where(.dark, [data-theme="dark"]) .ui-sb-avatar[data-tone="1"] { background: rgba(236, 72, 153, 0.16); color: #f9a8d4; }
:where(.dark, [data-theme="dark"]) .ui-sb-avatar[data-tone="2"] { background: rgba(34, 197, 94, 0.14); color: #86efac; }
:where(.dark, [data-theme="dark"]) .ui-sb-avatar[data-tone="3"] { background: rgba(245, 158, 11, 0.14); color: #fcd34d; }
.ui-sb-key {
  padding: 5px 9px;
  border-radius: 8px;
  background: var(--chip);
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 12px;
  color: var(--text);
  white-space: nowrap;
}
.ui-sb-danger:hover { color: #dc2626; }
.ui-sb-danger:hover svg { color: #dc2626; }

.ui-sb-invite { width: 280px; padding: 14px; }
.ui-sb-invite form { display: grid; gap: 6px; }
.ui-sb-invite b { font-size: 13.5px; font-weight: 500; color: var(--ink); }
.ui-sb-invite span { font-size: 12.5px; color: var(--muted); }
.ui-sb-invite .ui-sb-input { margin: 6px 0 4px; }

/* Narrower panels: overview and plans stack, fields put the label above */
@container ui-as-main (max-width: 900px) {
  .ui-sb-stack { grid-template-columns: minmax(0, 1fr); }
  .ui-sb-plans { grid-template-columns: minmax(0, 1fr); }
}
@container ui-as-main (max-width: 640px) {
  .ui-sb-field { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .ui-sb-key, .ui-sb-tray__end--key { display: none; }
  .ui-sb-section__head { flex-wrap: wrap; align-items: flex-start; }
}
@container ui-as (max-width: 900px) {
  .ui-sb { width: calc(100% - 48px); }
}
@container ui-as (max-width: 600px) {
  .ui-sb { width: calc(100% - 32px); padding: 52px 0 48px; }
  .ui-sb__bar { margin: 6px -12px 0; padding: 14px 12px 10px; overflow-x: auto; }
  .ui-sb-pay { padding: 4px 14px; }
  .ui-sb-pay__row { flex-wrap: wrap; padding: 12px 0; }
  .ui-sb-form__fields { padding: 4px 16px; }
  .ui-sb-tray__end { display: none; }
}
`;
