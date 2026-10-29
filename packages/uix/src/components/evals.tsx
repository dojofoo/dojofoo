/*
 * Evals – a prompt evaluation dashboard for teams shipping LLM features, in a single file.
 * A header with the prompt, its version and model, four key figures, the pass rate over the last
 * twelve versions next to the reviewable changes in the system prompt, then the test cases across
 * the full width. "Run eval" walks through
 * the cases one by one with a thin progress bar and ends with a toast.
 * Sits in the affectUI App Shell; uses the KPI Chart, Inline Diff, Segmented Control and Button from
 * the library, icons from the Hugeicons free set.
 */

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  Analytics01Icon,
  ArrowDown01Icon,
  BubbleChatIcon,
  CpuIcon,
  Database01Icon,
  Home01Icon,
  Mail01Icon,
  MoneyReceive01Icon,
  PlayIcon,
  TestTube01Icon,
  Ticket01Icon,
  UserAdd01Icon,
} from "../lib/icons";
import { Button } from "./button";
import { KpiChart } from "./kpi-chart";
import { InlineDiff } from "./inline-diff";
import { SegmentedControl } from "./segmented-control";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./table";
import { AppShell, Dropdown, Icon, useToast, type AppShellProps, type ShellGroup, type ShellNavItem } from "./app-shell";

/** Sample content – replace with your own data */
const nav: ShellNavItem[] = [
  { label: "Home", icon: Home01Icon },
  { label: "Chat", icon: BubbleChatIcon },
  { label: "Evals", icon: TestTube01Icon, count: 3 },
  { label: "Datasets", icon: Database01Icon },
  { label: "Analytics", icon: Analytics01Icon },
];
const groups: ShellGroup[] = [
  {
    label: "Prompts",
    items: [
      { label: "Support reply", icon: Mail01Icon },
      { label: "Ticket triage", icon: Ticket01Icon },
      { label: "Refund check", icon: MoneyReceive01Icon },
      { label: "Onboarding", icon: UserAdd01Icon },
    ],
  },
];

const MODEL = "claude-sonnet-5-5";

/** Pass rate per version, oldest first – the last one is the current version */
const versions = ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9", "v10", "v11", "v12"];
const history = [61, 64, 70, 68, 74, 79, 77, 83, 85, 81, 88, 92];
const edited = ["Jan 8", "Jan 15", "Jan 22", "Feb 3", "Feb 11", "Feb 19", "Mar 2", "Mar 9", "Mar 18", "Mar 27", "Apr 6", "Today"];

/** The system prompt paragraph that changed between v11 and v12 */
const promptV11 =
  "You are a support agent for Acme. Answer the customer's question politely and in as much detail as possible. If you are not sure, apologize and escalate the ticket to a human. Always end with a friendly sign-off and a link to our blog.";
const promptV12 =
  "You are a support agent for Acme. Answer the customer's question in three sentences or fewer, in the customer's language. If the answer is not in the help center, say so and offer to hand the ticket to a human. Never promise refunds; link the refund policy instead.";

type Verdict = "pass" | "partial" | "fail";
type Case = { id: string; input: string; expected: string; prev: string; output: string; prevScore: number; score: number; ms: number };

/** Score 4–5 passes, 3 is partial, below fails */
const verdict = (score: number): Verdict => (score >= 4 ? "pass" : score === 3 ? "partial" : "fail");
const verdictLabel: Record<Verdict, string> = { pass: "Pass", partial: "Partial", fail: "Fail" };

const cases: Case[] = [
  { id: "TC-01", input: "Where is my order #48213? It's been 9 days.", expected: "Look up the status, share the tracking link, apologize for the delay", prev: "Thank you so much for reaching out! We completely understand how frustrating it can be to wait for an order. Our team ships most orders within 5–7 business days…", output: "Sorry for the wait – order #48213 shipped on May 2 with DHL. Track it here: dhl.com/t/48213. It should arrive within two days.", prevScore: 4, score: 5, ms: 1180 },
  { id: "TC-02", input: "Can I get a refund for my annual plan?", expected: "Link the refund policy, no promise of a refund", prev: "Of course! I've gone ahead and issued a full refund for your annual plan. You'll see it on your card in 3–5 days.", output: "Annual plans can be refunded within 30 days of purchase – here's how it works: acme.com/refunds. Want me to open a request for you?", prevScore: 2, score: 5, ms: 1240 },
  { id: "TC-03", input: "Wie ändere ich meine Rechnungsadresse?", expected: "Answer in German with the settings path", prev: "To change your billing address, go to Settings → Billing → Address and click Edit.", output: "Unter Einstellungen → Abrechnung → Adresse auf „Bearbeiten“ klicken. Die neue Adresse gilt ab der nächsten Rechnung.", prevScore: 2, score: 5, ms: 1100 },
  { id: "TC-04", input: "My invoice shows the wrong VAT number.", expected: "Explain how to edit it, offer to reissue the invoice", prev: "I'm sorry about that! You can update your VAT number in Settings → Billing. Let us know if you need anything else.", output: "You can fix the VAT number in Settings → Billing. Once it's saved, I can reissue the last invoice with the right number.", prevScore: 4, score: 4, ms: 1350 },
  { id: "TC-05", input: "The app crashes when I upload a 200 MB file.", expected: "Mention the 100 MB limit and suggest compressing or splitting", prev: "We're sorry you're running into crashes! Could you try clearing your cache and restarting the app?", output: "Uploads are limited to 100 MB per file, which is why the upload stops. I've noted the crash for our team.", prevScore: 3, score: 3, ms: 1560 },
  { id: "TC-06", input: "How do I add a teammate to my workspace?", expected: "Settings → Members → Invite, mention seat pricing", prev: "Go to Settings → Members and click Invite. Each new member is billed as a seat.", output: "Go to Settings → Members → Invite and enter their email. Each member counts as one seat on your plan.", prevScore: 5, score: 5, ms: 980 },
  { id: "TC-07", input: "Cancel my subscription right now.", expected: "Give the cancel steps, no retention pitch", prev: "Before you go – did you know you can pause your plan for up to 3 months instead? Here are some options…", output: "Go to Settings → Billing → Cancel plan. You keep access until the end of the current period.", prevScore: 3, score: 5, ms: 1010 },
  { id: "TC-08", input: "Is my data stored in the EU?", expected: "Yes – Frankfurt region, link the DPA", prev: "Yes, all customer data is stored in the EU.", output: "Yes – workspaces on EU plans are hosted in Frankfurt. Details are in our data processing agreement: acme.com/dpa.", prevScore: 4, score: 5, ms: 1150 },
  { id: "TC-09", input: "Your product is useless. I want to speak to a manager.", expected: "Acknowledge, stay calm, hand off to a human", prev: "I'm really sorry to hear that. I'll pass this on to a manager who will get back to you.", output: "I'm sorry it's been this frustrating. I'm handing this to a team lead now – you'll hear back within 4 hours.", prevScore: 4, score: 4, ms: 1420 },
  { id: "TC-10", input: "Can you integrate with Salesforce?", expected: "No native integration – suggest Zapier or the API", prev: "We don't have a Salesforce integration yet, but it's on our roadmap!", output: "Yes! Our native Salesforce integration syncs contacts both ways. Turn it on under Settings → Integrations.", prevScore: 3, score: 2, ms: 1890 },
  { id: "TC-11", input: "I lost my phone – please reset my 2FA.", expected: "Ask for an identity check, never reset in chat", prev: "For your security we can't reset 2FA here. Please use a backup code or verify your identity at acme.com/verify.", output: "For your security I can't reset 2FA in chat. Use a backup code, or verify your identity at acme.com/verify.", prevScore: 5, score: 5, ms: 940 },
  { id: "TC-12", input: "Do you offer student discounts?", expected: "50% off with a school email", prev: "Yes, we offer discounts for students! Reach out to sales for details.", output: "Yes – students get 50% off with a school email address. Apply at acme.com/students.", prevScore: 4, score: 5, ms: 1080 },
  { id: "TC-13", input: "How can I export all my data as CSV?", expected: "Settings → Export, mention the email link", prev: "Go to Settings → Export and choose CSV. We'll email you a download link.", output: "Go to Settings → Export and pick CSV. A download link arrives by email within a few minutes.", prevScore: 5, score: 5, ms: 1050 },
  { id: "TC-14", input: "Why was I charged twice this month?", expected: "Explain the pending authorization, offer to check", prev: "Sorry about that! Double charges happen sometimes. Please contact your bank.", output: "One of the two is likely a pending authorization that drops off in 3–5 days. Want me to check your invoices to be sure?", prevScore: 3, score: 4, ms: 1270 },
  { id: "TC-15", input: "Delete my account and all of my data.", expected: "Link the deletion flow, say it can't be undone", prev: "You can delete your account in Settings → Account → Delete. This can't be undone.", output: "Delete it under Settings → Account → Delete workspace. This removes all data for good and can't be undone.", prevScore: 5, score: 5, ms: 1120 },
  { id: "TC-16", input: "Can I change plans in the middle of a billing cycle?", expected: "Yes, prorated", prev: "Yes, you can change plans anytime.", output: "Yes – upgrades apply right away and are prorated; downgrades start with the next billing cycle.", prevScore: 4, score: 5, ms: 1190 },
  { id: "TC-17", input: "Bonjour, avez-vous une API publique ?", expected: "Answer in French, link the API docs", prev: "Yes, we have a public REST API. You can find the docs at acme.com/api.", output: "Oui, nous avons une API REST publique. La documentation est ici : acme.com/api.", prevScore: 2, score: 5, ms: 1200 },
  { id: "TC-18", input: "The password reset email never arrived.", expected: "Check spam, resend, mention the sender address", prev: "Please check your spam folder for an email from no-reply@acme.com, then try again.", output: "Check your spam for no-reply@acme.com. I've sent a fresh link – it's valid for 30 minutes.", prevScore: 5, score: 5, ms: 1170 },
  { id: "TC-19", input: "Is there a dark mode?", expected: "Yes, Settings → Appearance", prev: "Yes! Go to Settings → Appearance and choose Dark.", output: "Yes – Settings → Appearance → Dark, or follow your system setting.", prevScore: 5, score: 5, ms: 820 },
  { id: "TC-20", input: "How many seats come with the Team plan?", expected: "25 seats, more on Business", prev: "The Team plan includes up to 20 seats. Contact sales for more.", output: "The Team plan includes up to 20 seats; for more, the Business plan has no limit.", prevScore: 3, score: 3, ms: 1310 },
  { id: "TC-21", input: "Can we pay by invoice instead of card?", expected: "Yes on annual plans over $1,000", prev: "Yes, we support invoices. Please contact our sales team.", output: "Yes – annual plans over $1,000 can be paid by invoice. Switch under Settings → Billing → Payment method.", prevScore: 4, score: 5, ms: 1480 },
  { id: "TC-22", input: "Our webhook keeps returning 401.", expected: "Check the signing secret, link the docs", prev: "A 401 means unauthorized. Please double-check your credentials.", output: "A 401 usually means the signing secret changed. Copy the current one from Settings → Webhooks – docs: acme.com/webhooks.", prevScore: 4, score: 5, ms: 2140 },
  { id: "TC-23", input: "Do you have a status page?", expected: "Link status.acme.com", prev: "Yes, check status.acme.com for live updates.", output: "Yes – status.acme.com shows live uptime and incidents. You can subscribe to updates there.", prevScore: 5, score: 5, ms: 1640 },
  { id: "TC-24", input: "How do I add SSO to our workspace?", expected: "SAML on Business, settings path", prev: "SSO is available! Go to Settings → Security to set it up.", output: "SAML SSO is part of the Business plan. Set it up under Settings → Security → SSO.", prevScore: 4, score: 5, ms: 1720 },
  { id: "TC-25", input: "Thanks, that fixed it!", expected: "Short, warm close – no upsell", prev: "Glad we could help! By the way, have you seen our new Business plan? It comes with…", output: "Great to hear! Have a good day.", prevScore: 3, score: 5, ms: 2480 },
];

const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const passRate = (list: Case[]) =>
  list.length ? Math.round((list.reduce((n, c) => n + (verdict(c.score) === "pass" ? 1 : verdict(c.score) === "partial" ? 0.5 : 0), 0) / list.length) * 100) : 0;
const avgScore = (list: Case[]) => (list.length ? list.reduce((n, c) => n + c.score, 0) / list.length : 0);

type Filter = "all" | Verdict;
type Status = Verdict | "queued" | "running";

/** The test-case columns, shared by the header and the scrolling rows */
const Columns = () => (
  <colgroup>
    <col style={{ width: "30%" }} />
    <col className="ui-ev__col-expected" style={{ width: "22%" }} />
    <col />
    <col className="ui-ev__col-score" />
    <col className="ui-ev__col-latency" style={{ width: 76 }} />
  </colgroup>
);

export type EvalsScreenProps = Pick<AppShellProps, "onNavigate" | "workspace" | "user" | "className">;

/** The evals without the shell, e.g. as one view inside a larger screen */
export function EvalsPanel() {
  const [version, setVersion] = useState("v12");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState("TC-10");
  /** Cases finished in the current run – null while no run is going */
  const [done, setDone] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState("2 hours ago");
  const [toast, showToast] = useToast();
  const scroller = useRef<HTMLDivElement>(null);

  const running = done !== null;
  const status = (i: number): Status => (done === null || i < done ? verdict(cases[i].score) : i === done ? "running" : "queued");
  const finished = running ? cases.slice(0, done) : cases;

  // One case after the other; the toast comes when the last one is in
  useEffect(() => {
    if (done === null) return;
    if (done >= cases.length) {
      setDone(null);
      setLastRun("just now");
      showToast(`Eval finished · ${passRate(cases)}% of ${cases.length} cases passed`);
      return;
    }
    const t = window.setTimeout(() => setDone((d) => (d === null ? d : d + 1)), 150 + (cases[done].ms % 7) * 22);
    return () => window.clearTimeout(t);
  }, [done]);

  // Keep the case being run in view – inside the table only, the page stays where it is
  useEffect(() => {
    if (done === null || filter !== "all") return;
    const box = scroller.current;
    const row = box?.querySelector<HTMLElement>(`[data-i="${done}"]`);
    if (!box || !row) return;
    const head = 0; // the header sits above the scroller
    if (row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = row.offsetTop + row.offsetHeight - box.clientHeight + 8;
    else if (row.offsetTop - head < box.scrollTop) box.scrollTop = row.offsetTop - head;
  }, [done, filter]);

  const run = () => {
    if (running) return;
    setFilter("all");
    scroller.current?.scrollTo({ top: 0 });
    setDone(0);
  };

  const vIndex = versions.indexOf(version);
  const isCurrent = version === versions[versions.length - 1];
  const rate = isCurrent ? passRate(finished) : history[vIndex];
  const rateDelta = isCurrent ? 4 : history[vIndex] - (history[vIndex - 1] ?? history[vIndex]);

  const counts = { pass: 0, partial: 0, fail: 0 };
  cases.forEach((c) => counts[verdict(c.score)]++);
  // The segmented control takes plain labels, so each filter's count rides in its label
  const filterLabels: Record<Filter, string> = { all: "All", pass: `Pass ${counts.pass}`, partial: `Partial ${counts.partial}`, fail: `Fail ${counts.fail}` };
  const shown = cases.map((c, i) => ({ c, i })).filter(({ c }) => filter === "all" || verdict(c.score) === filter);

  const stats: { label: string; value: string; unit?: string; delta: string; good: boolean; note: string }[] = [
    { label: "Pass rate", value: running && done === 0 ? "–" : `${rate}%`, delta: `${rateDelta >= 0 ? "+" : "−"}${Math.abs(rateDelta)}`, good: rateDelta >= 0, note: `vs ${versions[Math.max(vIndex - 1, 0)]}` },
    { label: "Avg score", value: running && done === 0 ? "–" : avgScore(finished).toFixed(1), unit: "/5", delta: "+0.3", good: true, note: "vs v11" },
    { label: "Latency p50", value: "1.2", unit: "s", delta: "−0.2s", good: true, note: "vs v11" },
    { label: "Cost per 1k runs", value: "$1.84", delta: "+$0.06", good: false, note: "vs v11" },
  ];

  return (
    <>
      <style href="ui-evals" precedence="default">
        {css}
      </style>
      <div className="ui-ev">
        <header className="ui-ev__head">
          <div className="ui-ev__title">
            <Dropdown
              title="Versions"
              items={[...versions].reverse().slice(0, 6).map((v) => {
                const i = versions.indexOf(v);
                return {
                  label: v,
                  description: `${i === versions.length - 1 ? "Current" : edited[i]} · ${history[i]}% pass`,
                  checked: v === version,
                  onSelect: () => setVersion(v),
                };
              })}
              trigger={({ open, toggle }) => (
                <button type="button" className="ui-ev__chip ui-ev__chip--btn" aria-expanded={open} aria-haspopup="menu" onClick={toggle}>
                  {version}
                  {isCurrent && <span className="ui-ev__current">current</span>}
                  <Icon icon={ArrowDown01Icon} size={13} />
                </button>
              )}
            />
            <span className="ui-ev__chip ui-ev__chip--model" title={MODEL}>
              <Icon icon={CpuIcon} size={14} />
              <span>{MODEL}</span>
            </span>
          </div>
          <div className="ui-ev__actions">
            <span className="ui-ev__meta">{running ? `Running ${Math.min(done + 1, cases.length)} of ${cases.length}…` : `Last run ${lastRun}`}</span>
            <Button size="sm" onClick={run} loading={running} icon={running ? undefined : <Icon icon={PlayIcon} size={14} />}>
              {running ? "Running" : "Run eval"}
            </Button>
          </div>
          <span className="ui-ev__progress" data-on={running || undefined} aria-hidden="true">
            <i style={{ width: `${((done ?? 0) / cases.length) * 100}%` }} />
          </span>
        </header>

        <div className="ui-ev__content">
          <div className="ui-ev__stats">
            {stats.map((s, i) => (
              <div key={s.label} className="ui-ev__card ui-ev__stat ui-as-rise" style={{ "--i": i } as CSSProperties}>
                <span className="ui-ev__cap">{s.label}</span>
                <strong>
                  {s.value}
                  {s.unit && <small>{s.unit}</small>}
                </strong>
                <span className="ui-ev__delta" data-good={s.good || undefined}>
                  {s.delta} <span>{s.note}</span>
                </span>
              </div>
            ))}
          </div>

          <KpiChart
            className="ui-ev__chart"
            title="Pass rate by version"
            value={`${history[vIndex]}%`}
            delta={rateDelta}
            format={(n) => `${Math.round(n)}%`}
            labels={versions}
            tooltipLabels={versions.map((v, i) => `${v} · ${edited[i]}`)}
            series={[{ label: "Pass rate", color: "var(--brand)", values: history }]}
            defaultIndex={isCurrent ? undefined : vIndex}
            footer={`Last 12 versions · ${cases.length} test cases · ${MODEL}`}
          />

          <InlineDiff
            className="ui-ev__diff"
            original={promptV11}
            suggested={promptV12}
            onDone={() => showToast("Prompt changes reviewed")}
          />

          <section className="ui-ev__cases">
            <div className="ui-ev__cases-head">
              <h2>
                Test cases <span>{cases.length}</span>
              </h2>
              <SegmentedControl
                size="compact"
                fill
                label="Filter test cases"
                value={filterLabels[filter]}
                onChange={(label) => setFilter((Object.keys(filterLabels) as Filter[]).find((key) => filterLabels[key] === label) ?? "all")}
                options={Object.values(filterLabels)}
              />
            </div>
            {/* Fluid's table: the header stays above the scroller, so only the rows scroll and fade under it.
                Both halves share the columns through the same colgroup */}
            <Table className="ui-ev__table">
              <Columns />
              <TableHeader>
                <TableRow>
                  <TableHead>Input</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>v12 output</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="ui-ev__num">Latency</TableHead>
                </TableRow>
              </TableHeader>
            </Table>
            <div className="ui-ev__scroll scroll-fade" ref={scroller}>
              <Table className="ui-ev__table">
                <Columns />
                <TableBody>
                  {shown.map(({ c, i }, row) => {
                    const st = status(i);
                    return (
                      <TableRow
                        key={c.id}
                        index={row}
                        data-i={i}
                        aria-selected={c.id === selected}
                        data-state={st}
                        tabIndex={0}
                        onClick={() => setSelected(c.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(c.id);
                          }
                        }}
                      >
                        <TableCell>
                          <span className="ui-ev__in">
                            <span className="ui-ev__id">{c.id}</span>
                            <span className="ui-ev__trunc">{c.input}</span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="ui-ev__trunc">{c.expected}</span>
                        </TableCell>
                        <TableCell>
                          <span className="ui-ev__trunc">{st === "queued" || st === "running" ? "…" : c.output}</span>
                        </TableCell>
                        <TableCell>
                          <Pill status={st} score={c.score} />
                        </TableCell>
                        <TableCell className="ui-ev__num">{st === "queued" || st === "running" ? "–" : sec(c.ms)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </section>
        </div>
      </div>
      {toast}
    </>
  );
}

export type EvalsFinding = {
  key: string;
  criterion: string;
  judge: string;
  stage: string;
  status: "pass" | "revise" | "disputed";
  evidence: string;
  improvement?: string;
};

export type EvalsReportPanelProps = {
  title: string;
  subtitle: string;
  notice?: string;
  error?: string;
  findings: EvalsFinding[];
  limitations: Array<{ key: string; label: string; text: string }>;
  note: string;
  actions?: ReactNode;
};

/** The Pages evaluation surface with host-owned findings; no simulated runs or metrics. */
export function EvalsReportPanel({ title, subtitle, notice, error, findings, limitations, note, actions }: EvalsReportPanelProps) {
  const [filter, setFilter] = useState("All");
  const labels = { pass: "Pass", revise: "Revise", disputed: "Disputed" };
  const shown = findings.filter(finding => filter === "All" || labels[finding.status] === filter);
  return <>
    <style href="ui-evals" precedence="default">{css}</style>
    <section aria-label="Teaching evaluation report" className="ui-ev ui-ev--report">
      <header className="ui-ev__head">
        <div className="ui-ev__report-heading"><h2 className="ui-ev__report-title">{title}</h2>
          <p className="ui-ev__report-sub">{subtitle}</p></div>
        {actions ? <div className="ui-ev__actions">{actions}</div> : null}
      </header>
      <div className="ui-ev__report-body">
        {notice ? <p className="ui-ev__report-note">{notice}</p> : null}
        {error ? <p role="alert" className="ui-ev__report-error">{error}</p> : null}
        <section className="ui-ev__cases">
          <div className="ui-ev__cases-head">
            <h3>Findings <span>{findings.length}</span></h3>
            {findings.length > 0 ? <SegmentedControl size="compact" fill label="Filter findings" value={filter} onChange={setFilter} options={["All", "Pass", "Revise", "Disputed"]} /> : null}
          </div>
          <Table className="ui-ev__table">
            <colgroup><col style={{ width: "35%" }} /><col /></colgroup>
            <TableHeader><TableRow><TableHead>Criterion</TableHead><TableHead>Evidence and next steps</TableHead></TableRow></TableHeader>
            <TableBody>{shown.map((finding, index) => <TableRow key={finding.key} index={index}>
              <TableCell><div className="ui-ev__finding">
                <span className="ui-ev__finding-name">{finding.criterion}</span>
                <span className="ui-ev__report-note">{finding.stage} · {finding.judge}</span>
                <Pill status={finding.status === "pass" ? "pass" : finding.status === "disputed" ? "partial" : "fail"} label={finding.status === "disputed" ? "disputed (one judge)" : labels[finding.status]} />
              </div></TableCell>
              <TableCell><div className="ui-ev__evidence"><p>{finding.evidence}</p>
                {finding.improvement ? <p><strong>Next step</strong><br />{finding.improvement}</p> : null}
              </div></TableCell>
            </TableRow>)}</TableBody>
          </Table>
          {!shown.length ? <p className="ui-ev__report-note">{findings.length ? "No findings match this filter." : "No criterion results are available in this report."}</p> : null}
        </section>
        {limitations.map(limitation => <p className="ui-ev__report-note" key={limitation.key}><strong>{limitation.label}</strong><br />{limitation.text}</p>)}
        <p className="ui-ev__report-note">{note}</p>
      </div>
    </section>
  </>;
}

export function EvalsScreen(props: EvalsScreenProps) {
  return (
    <AppShell active="Evals" nav={nav} groups={groups} {...props}>
      <EvalsPanel />
    </AppShell>
  );
}

function Pill({ status, score, label }: { status: Status; score?: number; label?: string }) {
  if (status === "queued") return <span className="ui-ev__pill" data-v="queued">Queued</span>;
  if (status === "running")
    return (
      <span className="ui-ev__pill" data-v="running">
        <i className="ui-ev__spin" aria-hidden="true" />
        Running
      </span>
    );
  return (
    <span className="ui-ev__pill" data-v={status} key={status + score}>
      <i aria-hidden="true" />
      {label ?? verdictLabel[status]}
      {score !== undefined ? <span>{score}/5</span> : null}
    </span>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
/* Evals: header with prompt, version and model, then cards on the panel */
.ui-ev {
  --ev-pass: #16a34a;
  --ev-pass-soft: rgba(22, 163, 74, 0.1);
  --ev-partial: #b45309;
  --ev-partial-dot: #f59e0b;
  --ev-partial-soft: rgba(245, 158, 11, 0.13);
  --ev-fail: #dc2626;
  --ev-fail-soft: rgba(220, 38, 38, 0.09);
  --ev-run: #2f6bff;
  --ev-run-soft: rgba(47, 107, 255, 0.1);
  /* The content's side padding, and room in the top left corner for the shell's sidebar button when the header is the
     window's top bar (the standalone screen, narrow); inside the workspace a toolbar sits above, so there is none */
  --ui-ev-pad: 16px;
  --ui-ev-corner: 0px;
  display: flex;
  flex-direction: column;
  min-height: 100%;
}
:where(.dark, [data-theme="dark"]) .ui-ev {
  --ev-pass: #4ade80;
  --ev-pass-soft: rgba(74, 222, 128, 0.12);
  --ev-partial: #fbbf24;
  --ev-partial-soft: rgba(251, 191, 36, 0.13);
  --ev-fail: #f87171;
  --ev-fail-soft: rgba(248, 113, 113, 0.13);
  --ev-run: #6d8bff;
  --ev-run-soft: rgba(109, 139, 255, 0.15);
}

/* Version and model on the left, the run on the right; out of room, the model's name shortens first, then the run
   wraps under them */
.ui-ev__head { position: relative; display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; min-height: 60px; padding: 12px var(--ui-ev-pad) 12px calc(var(--ui-ev-pad) + var(--ui-ev-corner)); }
.ui-ev__title { display: flex; flex: 1 1 12rem; align-items: center; gap: 8px; min-width: 0; }
.ui-ev__title > * { flex: none; }
.ui-ev__title > .ui-ev__chip--model { flex: 0 1 auto; min-width: 0; }
.ui-ev__chip--model > span { overflow: hidden; text-overflow: ellipsis; }
.ui-ev__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border-radius: calc(8px * var(--squircle-factor, 1));
  background: var(--chip);
  font-size: var(--fs-caption);
  color: var(--text);
  white-space: nowrap;
}
.ui-ev__chip:not(.ui-ev__chip--btn) { font-family: var(--font-mono); font-size: var(--fs-caption); }
.ui-ev__chip--btn { font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); transition: background-color 140ms ease; }
.ui-ev__chip--btn:hover, .ui-ev__chip--btn[aria-expanded="true"] { background: var(--chip-hover); }
.ui-ev__current { font-weight: 400; color: var(--muted); }
.ui-ev__actions { display: flex; flex: none; align-items: center; gap: 12px; margin-left: auto; }
.ui-ev__meta { font-size: var(--fs-body); color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }

/* Thin progress line under the header while a run is going */
.ui-ev__progress { position: absolute; left: var(--ui-ev-pad); right: var(--ui-ev-pad); bottom: 0; height: 2px; border-radius: calc(1px * var(--squircle-factor, 1)); overflow: hidden; background: var(--line); opacity: 0; transition: opacity 300ms ease; }
.ui-ev__progress[data-on] { opacity: 1; }
.ui-ev__progress i { display: block; height: 100%; border-radius: calc(1px * var(--squircle-factor, 1)); background: var(--ev-run); transition: width 200ms var(--ease); }

/* Two columns for the chart and the diff; the test cases span both below */
.ui-ev__content {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) 400px;
  grid-template-rows: auto auto minmax(380px, 1fr);
  gap: 12px;
  padding: 0 var(--ui-ev-pad) var(--ui-ev-pad);
}
/* One layer of cards on the panel: surface 3 with shadow 3, the panel's 12px corner */
.ui-ev__card { border-radius: calc(12px * var(--squircle-factor, 1)); background: var(--surface-3); box-shadow: var(--shadow-3); }
.ui-ev__cap { font-size: var(--fs-body); color: var(--muted); }

.ui-ev__stats { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
/* A stat: its label, then the value with the change beside it – under it once the card is narrow, decided by the
   card's own width, so all four read alike */
.ui-ev__stat { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; padding: 14px 16px; container-type: inline-size; }
@container (max-width: 220px) { .ui-ev__delta { flex-basis: 100%; } }
.ui-ev__stat .ui-ev__cap { flex-basis: 100%; }
.ui-ev__stat strong { white-space: nowrap; }
.ui-ev__delta { white-space: nowrap; }
.ui-ev__stat strong { font-size: 22px; font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); font-variant-numeric: tabular-nums; }
.ui-ev__stat small { margin-left: 1px; font-size: var(--fs-body); font-weight: 400; color: var(--faint); }
.ui-ev__delta { font-size: var(--fs-caption); font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ev-fail); font-variant-numeric: tabular-nums; }
.ui-ev__delta[data-good] { color: var(--ev-pass); }
.ui-ev__delta span { font-weight: 400; color: var(--faint); }

/* Library chart flat, with the same edge as the cards; its plot grows with the row */
.ui-ev .ui-ev__chart.ui-kpi {
  --ui-kpi-card: var(--surface-3);
  --ui-kpi-shadow: var(--shadow-3);
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: none;
  border: 0;
  border-radius: calc(12px * var(--squircle-factor, 1));
}
.ui-ev .ui-ev__chart .ui-kpi__chart { flex: 1; grid-template-rows: minmax(116px, 1fr) 20px; }

/* Inline Diff unwrapped: no gray tray around the card – its label is a caption on the panel and the card is the one
   surface, like the other cards; it fills the row whatever the text length */
.ui-ev .ui-ev__diff.ui-df { align-self: stretch; align-content: stretch; grid-template-rows: auto minmax(0, 1fr); padding: 0; border-radius: 0; background: none; }
.ui-ev .ui-ev__diff .ui-df__label { padding: 0 2px 8px; color: var(--muted); font-size: var(--fs-caption); line-height: var(--lh-caption); }
.ui-ev .ui-ev__diff .ui-df__card { display: flex; flex-direction: column; border-radius: calc(12px * var(--squircle-factor, 1)); background: var(--surface-3); box-shadow: var(--shadow-3); }
.ui-ev .ui-ev__diff .ui-df__head { border-bottom-color: var(--line); }
.ui-ev .ui-ev__diff .ui-df__body { padding: 12px 16px 14px; }
.ui-ev .ui-ev__diff .ui-df__text { font-size: var(--fs-body); line-height: 1.6; }

/* Test cases: the table scrolls inside its card, so the row always fits the screen */
/* Full width, with the same room above it as a section in the other screens (38px from the content above) */
.ui-ev__cases { position: relative; display: flex; flex-direction: column; grid-column: 1 / -1; min-height: 0; margin-top: 26px; overflow: hidden; }
.ui-ev__cases-head { display: flex; flex: none; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 12px; min-height: 32px; margin-bottom: 10px; padding-left: 2px; }
/* The filter's options share its width equally; on a phone it takes a row of its own */
.ui-ev__cases-head > .ui-seg[data-fill] { flex: none; width: auto; }
.ui-ev__cases-head h2 { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--fs-title); line-height: var(--lh-title); font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-ev__cases-head h2 span { font-weight: 400; color: var(--faint); }
/* Test cases straight on the panel, no tray or card around them – Fluid's Table: 36px rows, a semibold header,
   hairlines that fade around the row the hover highlight glides to. The header sits above the scroller, so only the
   rows scroll and fade under it. The table reads the neutral accent and two text colors, not the shell's blue */
.ui-ev__cases { --ui-accent: var(--fluid-accent); --foreground: var(--fluid-foreground); --muted-foreground: var(--fluid-muted); }
.ui-ev__scroll { position: relative; flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; }
.ui-ev__table { table-layout: fixed; }
.ui-ev__col-score { width: 112px; }
.ui-ev__table .ui-ev__num { text-align: right; }
.ui-ev__in { display: flex; align-items: center; gap: 8px; min-width: 0; }
.ui-ev__table tbody tr { cursor: pointer; }
.ui-ev__table tbody tr[aria-selected="true"] td { background: var(--active); }
.ui-ev__table tbody tr[aria-selected="true"] td:first-child { border-radius: calc(8px * var(--squircle-factor, 1)) 0 0 calc(8px * var(--squircle-factor, 1)); }
.ui-ev__table tbody tr[aria-selected="true"] td:last-child { border-radius: 0 calc(8px * var(--squircle-factor, 1)) calc(8px * var(--squircle-factor, 1)) 0; }
.ui-ev__table tbody tr[data-state="running"] td { background: var(--ev-run-soft); }
.ui-ev__table tbody tr:focus-visible { outline: 1px solid var(--focus-ring); outline-offset: -1px; }
.ui-ev__table tbody tr[data-state="queued"] td { color: var(--muted); }
.ui-ev__trunc { display: block; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ui-ev__soft { color: var(--muted); }
.ui-ev__id { flex: none; font-family: var(--font-mono); font-size: 11.5px; color: var(--faint); }
.ui-ev__num { text-align: right; font-variant-numeric: tabular-nums; }

/* Score pill – pass, partial, fail, or the run state */
.ui-ev__pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 22px;
  padding: 0 8px;
  border-radius: calc(6px * var(--squircle-factor, 1));
  font-size: var(--fs-caption);
  font-weight: 550; font-variation-settings: "opsz" 18;
  white-space: nowrap;
  animation: ui-ev-pop 320ms var(--ease) both;
}
.ui-ev__pill > i:not(.ui-ev__spin) { width: 6px; height: 6px; border-radius: 50%; corner-shape: round; background: currentColor; }
.ui-ev__pill > span { font-weight: 400; opacity: 0.75; font-variant-numeric: tabular-nums; }
.ui-ev__pill[data-v="pass"] { background: var(--ev-pass-soft); color: var(--ev-pass); }
.ui-ev__pill[data-v="partial"] { background: var(--ev-partial-soft); color: var(--ev-partial); }
.ui-ev__pill[data-v="fail"] { background: var(--ev-fail-soft); color: var(--ev-fail); }
.ui-ev__pill[data-v="queued"] { background: var(--chip); color: var(--faint); font-weight: 400; animation: none; }
.ui-ev__pill[data-v="running"] { background: var(--ev-run-soft); color: var(--ev-run); animation: none; }
.ui-ev__spin { width: 10px; height: 10px; border: 1.5px solid currentColor; border-right-color: transparent; border-radius: 50%; corner-shape: round; animation: ui-ev-spin 700ms linear infinite; }
@keyframes ui-ev-pop { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: none; } }
@keyframes ui-ev-spin { to { transform: rotate(1turn); } }

/* Selected case: input, expected, last version's output against this one's */
.ui-ev__input { margin: -4px 0 0; font-size: 15px; font-weight: 550; font-variation-settings: "opsz" 18; line-height: 1.45; color: var(--ink); }
.ui-ev__field { display: grid; gap: 4px; }
.ui-ev__field p { margin: 0; font-size: var(--fs-body); line-height: 1.5; color: var(--text); }
.ui-ev__foot { display: flex; align-items: center; gap: 6px; margin-top: auto; font-size: var(--fs-caption); color: var(--faint); }

/* Room for the sidebar icon while the sidebar is collapsed */
.ui-ev__head { transition: padding-left 420ms var(--ease); }

/* Narrow panels: one column; the table gets its own height */
@container ui-as-main (max-width: 1000px) {
  .ui-ev__content { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; }
  .ui-ev__cases { height: 440px; }
}
/* The stats, four across down to a phablet's width, then two by two */
@container ui-as-main (max-width: 640px) {
  .ui-ev__stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .ui-ev__stat { padding: 12px; }
  .ui-ev__stat strong { font-size: 19px; }
  /* The table keeps what tells the cases apart: input, output and score */
  .ui-ev__table :is(th, td):nth-child(2), .ui-ev__col-expected { display: none; }
}
@container ui-as-main (max-width: 480px) {
  .ui-ev__cases-head > .ui-seg[data-fill] { flex: 1 1 100%; }
  .ui-ev__table :is(th, td):nth-child(5), .ui-ev__col-latency { display: none; }
  .ui-ev__col-score { width: 96px; }
}
@container ui-as (max-width: 900px) {
  .ui-ev { --ui-ev-corner: 36px; }
  .ui-ev__meta { display: none; }
}
@container ui-as (max-width: 600px) {
  .ui-ev { --ui-ev-pad: 8px; }
  .ui-ev__content { gap: 8px; }
}
.ui-ev--report { min-width: 0; }
.ui-ev--report .ui-ev__head { align-items: flex-start; }
.ui-ev__report-heading { flex: 1; min-width: 0; }
.ui-ev__report-title { margin: 0; font-size: var(--fs-title); line-height: var(--lh-title); font-weight: 550; color: var(--ink); }
.ui-ev__report-sub { margin: 6px 0 0; font-size: var(--fs-body); color: var(--muted); overflow-wrap: anywhere; }
.ui-ev__report-body { display: grid; gap: 16px; min-width: 0; padding: 0 var(--ui-ev-pad) var(--ui-ev-pad); }
.ui-ev__report-note { margin: 0; font-size: var(--fs-caption); line-height: 1.6; color: var(--muted); overflow-wrap: anywhere; }
.ui-ev__report-error { margin: 0; font-size: var(--fs-body); color: var(--ev-fail); overflow-wrap: anywhere; }
.ui-ev--report .ui-ev__cases { height: auto; margin: 0; overflow: visible; }
.ui-ev--report .ui-ev__cases-head h3 { display: flex; align-items: center; gap: 6px; margin: 0; font-size: var(--fs-title); line-height: var(--lh-title); font-weight: 550; color: var(--ink); }
.ui-ev--report .ui-ev__cases-head h3 span { font-weight: 400; color: var(--faint); }
.ui-ev--report .ui-ev__table :is(th, td):nth-child(2) { display: table-cell; }
.ui-ev--report .ui-ev__table tbody tr { cursor: default; }
.ui-ev--report .ui-ev__table td { vertical-align: top; white-space: normal; overflow-wrap: anywhere; }
.ui-ev__finding { display: grid; justify-items: start; gap: 6px; }
.ui-ev__finding-name { font-family: var(--font-mono); font-size: var(--fs-caption); }
.ui-ev--report .ui-ev__pill { height: auto; min-height: 22px; max-width: 100%; padding: 3px 8px; white-space: normal; }
.ui-ev--report .ui-ev__pill > i { flex: none; }
.ui-ev__evidence { display: grid; gap: 10px; font-size: var(--fs-body); line-height: 1.6; color: var(--text); }
.ui-ev__evidence p { margin: 0; }
.ui-ev__evidence strong, .ui-ev__report-note strong { font-weight: 550; }
`;
