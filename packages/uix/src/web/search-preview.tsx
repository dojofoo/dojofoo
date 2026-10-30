import { useState, type ReactNode } from "react";
import { Icon } from "../components/app-shell";
import { ArrowDown01Icon, ArrowRight01Icon } from "../lib/icons";
import { SiteStyles } from "./site";
import { questions, SITE, searchPages, socialMetadata, structuredData, type SearchPage } from "./seo";

/*
 * Dojo.foo as search engines, AI answers and link previews see it – from web/seo, which the website's head is built
 * from: the result we'd like Google to show (laid out as MasterClass's is, with its sitelinks and questions), each
 * page's tags, the social cards, the JSON-LD, what the AI crawlers may read, and what stands between the site and the
 * index. Facts about Google's and the platforms' rules are as their docs stated them on 2026-10-30.
 */

const CHECKED = "2026-10-30";

/** A Google result for the site, in Google's dark or light colours: the site, its sitelinks, the questions asked */
export function GoogleResult({ theme = "dark", whatIf = true }: { theme?: "dark" | "light"; /** The planned pages too, as they'd show */ whatIf?: boolean }) {
  const [open, setOpen] = useState<number | null>(null);
  const links = searchPages.filter((page) => whatIf || page.status === "live");
  return (
    <div className="ui-seo-serp" data-theme={theme}>
      <div className="ui-seo-serp__site">
        <span className="ui-seo-serp__favicon"><img src={`${SITE.url}/favicon.svg`} alt="" /></span>
        <span><b>{SITE.name}</b><small>{SITE.url}</small></span>
      </div>
      <a className="ui-seo-serp__title" href={SITE.url}>{SITE.title}</a>
      <p className="ui-seo-serp__snippet">{SITE.description}</p>
      <ul className="ui-seo-serp__links">
        {links.map((page) => (
          <li key={page.path} data-status={page.status}>
            <span>
              <b>{page.label}</b>
              <small>{page.description}</small>
            </span>
            {page.status !== "live" && <em title={page.note}>{page.status}</em>}
            <Icon icon={ArrowRight01Icon} size={18} />
          </li>
        ))}
      </ul>
      <p className="ui-seo-serp__more">More results from dojo.foo »</p>
      <h3 className="ui-seo-serp__ask">People also ask</h3>
      <ul className="ui-seo-serp__questions">
        {questions.slice(0, 5).map((item, index) => (
          <li key={item.question} data-open={open === index || undefined}>
            <button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>
              {item.question}<span><Icon icon={ArrowDown01Icon} size={18} /></span>
            </button>
            {open === index && <p>{item.answer}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

const length = (text: string, limit: number) => <span className="ui-seo-count" data-over={text.length > limit || undefined}>{text.length}/{limit}</span>;

/** A page's tags, with Google's display limits: about 60 characters of title, 155 of description */
function PageRow({ page }: { page: SearchPage }) {
  return (
    <tr data-status={page.status}>
      <td><code>{page.path}</code><small>{page.status}{page.note ? ` – ${page.note}` : ""}</small></td>
      <td>{page.title} {length(page.title, 60)}</td>
      <td>{page.description} {length(page.description, 155)}</td>
      <td>{page.status === "live" ? <img src={`${SITE.url}${page.path === "/" ? "" : page.path}/og.webp`} alt={`${page.path}'s card`} loading="lazy" /> : <span className="ui-seo-none">–</span>}</td>
    </tr>
  );
}

/** How a link to the site unfurls: X's large card and a chat app's preview */
function SocialCards() {
  const tags = Object.fromEntries(socialMetadata({ title: SITE.title, description: SITE.description, url: SITE.url }).map((tag) => ["property" in tag ? tag.property : tag.name, tag.content]));
  return (
    <div className="ui-seo-cards">
      <figure className="ui-seo-x">
        <img src={tags["twitter:image"]} alt={tags["twitter:image:alt"]} />
        <figcaption><span>dojo.foo</span><b>{tags["twitter:title"]}</b></figcaption>
        <small>X: summary_large_image – takes WebP</small>
      </figure>
      <figure className="ui-seo-chat">
        <span className="ui-seo-chat__bar" />
        <div>
          <b>{tags["og:site_name"]}</b>
          <a href={SITE.url}>{tags["og:title"]}</a>
          <p>{tags["og:description"]}</p>
          <img src={tags["og:image"]} alt={tags["og:image:alt"]} />
        </div>
        <small>Slack, Discord, LinkedIn, iMessage: Open Graph – WebP not stated by any of them</small>
      </figure>
    </div>
  );
}

/** The JSON-LD each kind of page carries, pretty-printed */
function StructuredData() {
  const data = structuredData();
  const graphs: Array<[string, string, Record<string, unknown>[]]> = [
    ["Home", "WebSite names the site in results; Organization its logo", [data.website, data.organization, data.cli]],
    ["Courses", "CollectionPage with an ItemList: Google's course list carousel wants three or more courses, each page with Course", [data.collection({ name: "Find your dojo", description: searchPages[1].description, path: "/dojos", items: [{ name: "Effect-TS", path: "/courses/dojofoo/effect-ts" }, { name: "Pydantic Agents", path: "/courses/dojofoo/pydantic-agents" }, { name: "Everyday TypeScript", path: "/courses/dojofoo/everyday-typescript" }] })]],
    ["Course", "Course: name and description (60 characters show) and provider count for Google; the rest for other readers", [data.course({ name: "Effect-TS", description: "Master Effect-TS through hands-on katas, from Effect.succeed to managed runtimes.", path: "/courses/dojofoo/effect-ts", author: "Dojo.foo", language: "TypeScript", tags: ["effect", "functional"], publishedAt: "2026-09-18", version: "1.3.0", repositoryUrl: "https://github.com/dojofoo/effect-ts" }), data.breadcrumbs([["Dojos", "/dojos"], ["Effect-TS", "/courses/dojofoo/effect-ts"]])]],
    ["Docs", "TechArticle and its trail (Google shows breadcrumbs on desktop only since January 2025)", [data.techArticle({ headline: "Quickstart", description: "From nothing to your first lesson.", path: "/docs/quickstart" }), data.breadcrumbs([["Docs", "/docs"], ["Quickstart", "/docs/quickstart"]])]],
    ["FAQ", "FAQPage: no rich result since May 2026 – only on a page that shows the questions, for other readers", [data.faqPage(questions.filter((item) => item.status === "confirmed"))]],
  ];
  const [at, setAt] = useState(0);
  return (
    <div className="ui-seo-ld">
      <div className="ui-seo-tabs" role="tablist">
        {graphs.map(([name], index) => <button key={name} type="button" role="tab" aria-selected={at === index} onClick={() => setAt(index)}>{name}</button>)}
      </div>
      <p>{graphs[at][1]}</p>
      <pre>{JSON.stringify({ "@context": "https://schema.org", "@graph": graphs[at][2] }, null, 2)}</pre>
    </div>
  );
}

/** The crawlers that feed AI answers, what each is for, and what robots.txt (User-agent: * Allow: /) lets them do */
const crawlers: Array<[agent: string, owner: string, purpose: string]> = [
  ["Googlebot", "Google", "Search, and AI Overviews and AI Mode (opting out of those is a Search Console setting)"],
  ["Google-Extended", "Google", "A token, not a crawler: Gemini's training and grounding. Search is unaffected"],
  ["Bingbot", "Microsoft", "Bing's search"],
  ["OAI-SearchBot", "OpenAI", "Pages in ChatGPT's search answers"],
  ["GPTBot", "OpenAI", "Training"],
  ["ChatGPT-User", "OpenAI", "Pages a user asks ChatGPT to read (robots.txt may not apply)"],
  ["Claude-SearchBot", "Anthropic", "Claude's search"],
  ["ClaudeBot", "Anthropic", "Training"],
  ["Claude-User", "Anthropic", "Pages a user asks Claude to read"],
  ["PerplexityBot", "Perplexity", "Perplexity's search (not training)"],
  ["Applebot-Extended", "Apple", "A token: training Apple's models. Applebot's search is unaffected"],
  ["CCBot", "Common Crawl", "The open crawl many models train on"],
];

/** What stands between the site and the index, as probed on CHECKED */
const checks: Array<[state: "ok" | "fixed" | "todo" | "note", what: string, detail: string]> = [
  ["ok", "Crawlable", "robots.txt allows / (not /api, the auth pages or /pricing) and names the sitemap; pages answer 200, server-rendered, to Googlebot"],
  ["ok", "Sitemap", "/sitemap.xml lists the home page, the dojos, each listed course (with its last update) and every docs page. Google ignores priority, change frequency and order; it reads lastmod when it's accurate"],
  ["ok", "One address per page", "Canonical links; http:// redirects (308) to https://; www.dojo.foo has no DNS record, so nothing competes"],
  ["ok", "Site name", "WebSite JSON-LD on the home page (name, alternateName, url) and og:site_name"],
  ["fixed", "Favicon in results", "Google takes ICO, PNG and others but not SVG – the site had only favicon.svg. Now also favicon.ico, a 96px PNG and the Apple touch icon"],
  ["todo", "Search Console", "No google-site-verification record in DNS: verify the domain (a DNS TXT record), submit the sitemap, and request indexing for the home page and /dojos"],
  ["note", "Social image format", "og.webp, kept: X documents WebP; Facebook, LinkedIn, Slack, Discord and iMessage don't say either way"],
  ["note", "Sitelinks", "Google picks them – no markup. Clear titles, a header that links the main pages, and pages worth listing (Membership, Interviews, Sell aren't pages yet)"],
  ["note", "People also ask", "Not set by markup. Answering the questions in the page's own text (an FAQ on the landing) is what can feed it, and AI answers"],
  ["note", "llms.txt", "Served, with llms-full.txt. Google says it neither helps nor hurts Search; other assistants may read it"],
];

function Section({ title, lead, children }: { title: string; lead: ReactNode; children: ReactNode }) {
  return <section className="ui-seo-section"><h2>{title}</h2><p className="ui-seo-lead">{lead}</p>{children}</section>;
}

/** Everything about how Dojo.foo is found: a page for the Search story */
export function SearchPreview() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [whatIf, setWhatIf] = useState(true);
  return (
    <div className="ui-as ui-web">
      <SiteStyles />
      <style href="ui-seo" precedence="default">{css}</style>
      <main className="ui-seo">
        <h1>Dojo.foo in search</h1>
        <p className="ui-seo-lead">How search engines, AI answers and link previews see the site, from the words the website's head is built from (UIX <code>web/seo</code>). Checked {CHECKED}.</p>

        <Section title="In Google" lead="The result we'd like for “Dojo.foo”, laid out as MasterClass's. Google chooses the sitelinks itself; the planned pages show what they'd add.">
          <div className="ui-seo-switches">
            <div className="ui-seo-tabs" role="tablist" aria-label="Google's theme">
              {(["dark", "light"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={theme === value} onClick={() => setTheme(value)}>{value === "dark" ? "Dark" : "Light"}</button>)}
            </div>
            <label><input type="checkbox" checked={whatIf} onChange={(event) => setWhatIf(event.target.checked)} /> With the planned pages</label>
          </div>
          <GoogleResult theme={theme} whatIf={whatIf} />
        </Section>

        <Section title="Getting indexed" lead={<>Google lists <code>/docs</code> already. What's in place, and what's left.</>}>
          <ul className="ui-seo-checks">
            {checks.map(([state, what, detail]) => <li key={what} data-state={state}><em>{state === "ok" ? "In place" : state === "fixed" ? "Fixed" : state === "todo" ? "To do" : "Note"}</em><b>{what}</b><span>{detail}</span></li>)}
          </ul>
        </Section>

        <Section title="Pages" lead="Each page's title and description, as Google would show them, and its own card at its address + /og.webp.">
          <table className="ui-seo-pages">
            <thead><tr><th>Page</th><th>Title</th><th>Description</th><th>Card</th></tr></thead>
            <tbody>{[{ path: "/", label: SITE.name, title: SITE.title, description: SITE.description, status: "live" as const }, ...searchPages].map((page) => <PageRow key={page.path} page={page} />)}</tbody>
          </table>
        </Section>

        <Section title="Link previews" lead="The home page's Open Graph and X tags, as a post and a chat unfurl them.">
          <SocialCards />
        </Section>

        <Section title="Structured data" lead="The JSON-LD in each kind of page's head. Google shows no Course or FAQ rich results any more; the markup still tells other readers – AI answers among them – what a page is.">
          <StructuredData />
        </Section>

        <Section title="Questions people ask" lead="Answers from the docs, for an FAQ on the site: the text, not markup, is what search and AI answers can quote. Drafts need a decision first.">
          <dl className="ui-seo-faq">
            {questions.map((item) => (
              <div key={item.question} data-status={item.status}>
                <dt>{item.question}{item.status === "draft" && <em>draft</em>}</dt>
                <dd>{item.answer}{item.source && <small> – {item.source}</small>}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section title="AI answers" lead={<>robots.txt allows every crawler (<code>User-agent: * Allow: /</code>), so AI search and training may read the site. Each can be shut out by name. <code>/llms.txt</code> and <code>/llms-full.txt</code> give assistants the site in Markdown.</>}>
          <table className="ui-seo-crawlers">
            <thead><tr><th>User agent</th><th>Whose</th><th>For</th></tr></thead>
            <tbody>{crawlers.map(([agent, owner, purpose]) => <tr key={agent}><td><code>{agent}</code></td><td>{owner}</td><td>{purpose}</td></tr>)}</tbody>
          </table>
        </Section>
      </main>
    </div>
  );
}

const css = `
.ui-seo { max-width: 1040px; margin: 0 auto; padding: 48px 24px 96px; color: var(--ink); }
.ui-seo h1 { margin: 0; font-size: 32px; font-weight: 650; letter-spacing: -0.02em; }
.ui-seo h2 { margin: 0; font-size: 20px; font-weight: 620; letter-spacing: -0.01em; }
.ui-seo-lead { max-width: 44rem; margin: 8px 0 0; color: var(--muted); font-size: 14.5px; line-height: 1.55; text-wrap: pretty; }
.ui-seo code { padding: 1px 5px; border-radius: 5px; background: var(--chip, var(--surface-3)); font-family: var(--font-mono); font-size: 0.88em; }
.ui-seo-section { margin-top: 56px; }
.ui-seo-section > :nth-child(3) { margin-top: 20px; }
.ui-seo-switches { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-bottom: 14px; color: var(--muted); font-size: 13px; }
.ui-seo-switches label { display: inline-flex; align-items: center; gap: 6px; }
.ui-seo-tabs { display: inline-flex; gap: 2px; padding: 2px; border-radius: 10px; background: var(--surface-3); box-shadow: var(--shadow-1); }
.ui-seo-tabs button { padding: 5px 12px; border-radius: 8px; color: var(--muted); font-size: 13px; font-weight: 550; }
.ui-seo-tabs button[aria-selected="true"] { background: var(--page); color: var(--ink); box-shadow: var(--shadow-1); }

/* Google's result: its own colours and type, dark and light */
.ui-seo-serp { --g-bg: #202124; --g-ink: #e8eaed; --g-muted: #bdc1c6; --g-link: #8ab4f8; --g-line: #3c4043; --g-chip: #303134;
  max-width: 652px; padding: 24px 28px; border-radius: 16px; background: var(--g-bg); color: var(--g-ink); font-family: Arial, sans-serif; }
.ui-seo-serp[data-theme="light"] { --g-bg: #fff; --g-ink: #202124; --g-muted: #4d5156; --g-link: #1a0dab; --g-line: #dadce0; --g-chip: #f1f3f4; box-shadow: var(--shadow-1); }
.ui-seo-serp__site { display: flex; align-items: center; gap: 12px; }
.ui-seo-serp__site > span:last-child { display: grid; font-size: 14px; line-height: 1.3; }
.ui-seo-serp__site b { font-weight: 400; }
.ui-seo-serp__site small { color: var(--g-muted); font-size: 12px; }
.ui-seo-serp__favicon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--g-chip); }
.ui-seo-serp__favicon img { width: 18px; height: 18px; }
.ui-seo-serp__title { display: block; margin-top: 6px; color: var(--g-link); font-size: 20px; line-height: 1.3; text-decoration: none; }
.ui-seo-serp__title:hover { text-decoration: underline; }
.ui-seo-serp__snippet { margin: 4px 0 0; color: var(--g-muted); font-size: 14px; line-height: 1.58; }
.ui-seo-serp__snippet b { color: var(--g-muted); font-weight: 700; }
.ui-seo-serp__links { margin: 14px 0 0; padding: 0; list-style: none; border-top: 1px solid var(--g-line); }
.ui-seo-serp__links li { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--g-line); }
.ui-seo-serp__links li > span { display: grid; flex: 1; min-width: 0; gap: 2px; }
.ui-seo-serp__links b { font-size: 18px; font-weight: 400; }
.ui-seo-serp__links small { overflow: hidden; color: var(--g-muted); font-size: 14px; text-overflow: ellipsis; white-space: nowrap; }
.ui-seo-serp__links li[data-status="planned"], .ui-seo-serp__links li[data-status="blocked"] { opacity: 0.6; }
.ui-seo-serp__links em { padding: 2px 8px; border-radius: 999px; background: var(--g-chip); color: var(--g-muted); font-size: 11px; font-style: normal; text-transform: uppercase; letter-spacing: 0.04em; }
.ui-seo-serp__more { margin: 14px 0 0; font-size: 14px; }
.ui-seo-serp__ask { margin: 36px 0 8px; font-size: 20px; font-weight: 400; }
.ui-seo-serp__questions { margin: 0; padding: 0; list-style: none; }
.ui-seo-serp__questions li { border-bottom: 1px solid var(--g-line); }
.ui-seo-serp__questions button { display: flex; width: 100%; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 0; color: var(--g-ink); font: inherit; font-size: 16px; text-align: left; }
.ui-seo-serp__questions button span { display: grid; flex: none; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--g-chip); transition: transform var(--motion-moderate) var(--ease-standard); }
.ui-seo-serp__questions li[data-open] button span { transform: rotate(180deg); }
.ui-seo-serp__questions p { margin: 0 0 14px; color: var(--g-muted); font-size: 14px; line-height: 1.58; }

.ui-seo-checks { display: grid; gap: 1px; margin: 0; padding: 0; overflow: hidden; border-radius: var(--box-radius, 14px); background: var(--line); list-style: none; box-shadow: var(--shadow-1); }
.ui-seo-checks li { display: grid; grid-template-columns: 76px 180px minmax(0, 1fr); gap: 12px; align-items: baseline; padding: 12px 16px; background: var(--page); font-size: 13.5px; line-height: 1.5; }
.ui-seo-checks em { justify-self: start; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-style: normal; font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; }
.ui-seo-checks [data-state="ok"] em { background: color-mix(in oklab, #22c55e 18%, transparent); color: #22c55e; }
.ui-seo-checks [data-state="fixed"] em { background: color-mix(in oklab, #3b82f6 18%, transparent); color: #60a5fa; }
.ui-seo-checks [data-state="todo"] em { background: var(--accent-soft); color: var(--accent); }
.ui-seo-checks [data-state="note"] em { background: var(--surface-3); color: var(--muted); }
.ui-seo-checks span { color: var(--muted); }
@media (max-width: 720px) { .ui-seo-checks li { grid-template-columns: 1fr; gap: 4px; } }

.ui-seo-pages, .ui-seo-crawlers { width: 100%; border-collapse: collapse; font-size: 13px; }
.ui-seo-pages :is(th, td), .ui-seo-crawlers :is(th, td) { padding: 10px 10px 10px 0; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.ui-seo-pages th, .ui-seo-crawlers th { color: var(--muted); font-size: var(--fs-caption, 12px); font-weight: 600; }
.ui-seo-pages td small { display: block; margin-top: 4px; color: var(--muted); }
.ui-seo-pages img { display: block; width: 180px; aspect-ratio: 1200 / 630; border-radius: 6px; background: var(--surface-3); object-fit: cover; }
.ui-seo-pages tr[data-status="planned"] td, .ui-seo-pages tr[data-status="blocked"] td { color: var(--muted); }
.ui-seo-count { margin-left: 4px; color: var(--muted); font-family: var(--font-mono); font-size: 11px; white-space: nowrap; }
.ui-seo-count[data-over] { color: var(--accent); }
.ui-seo-none { color: var(--muted); }

.ui-seo-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px; align-items: start; }
.ui-seo-cards figure { margin: 0; }
.ui-seo-cards figure > small { display: block; margin-top: 8px; color: var(--muted); font-size: 12px; }
.ui-seo-x { position: relative; }
.ui-seo-x img { display: block; width: 100%; aspect-ratio: 1200 / 630; border-radius: 16px; object-fit: cover; }
.ui-seo-x figcaption { position: absolute; bottom: 36px; left: 12px; display: grid; max-width: calc(100% - 24px); padding: 2px 6px; border-radius: 4px; background: rgb(0 0 0 / 0.77); color: #fff; font-size: 13px; }
.ui-seo-x figcaption span { display: none; }
.ui-seo-chat { display: grid; grid-template-columns: 4px minmax(0, 1fr); gap: 12px; }
.ui-seo-chat > small { grid-column: 1 / -1; }
.ui-seo-chat__bar { border-radius: 4px; background: var(--line); }
.ui-seo-chat div { display: grid; gap: 2px; font-size: 14px; }
.ui-seo-chat b { font-size: 13px; }
.ui-seo-chat a { color: #1d9bd1; font-weight: 700; text-decoration: none; }
.ui-seo-chat p { margin: 0; color: var(--muted); line-height: 1.45; }
.ui-seo-chat img { width: 100%; max-width: 360px; margin-top: 8px; border-radius: 8px; aspect-ratio: 1200 / 630; object-fit: cover; }

.ui-seo-ld > p { margin: 12px 0 8px; color: var(--muted); font-size: 13px; }
.ui-seo-ld pre { max-height: 420px; margin: 0; overflow: auto; padding: 16px; border-radius: var(--box-radius, 14px); background: var(--box-surface, var(--surface-3)); box-shadow: var(--box-shadow, var(--shadow-1)); font-family: var(--font-mono); font-size: 12px; line-height: 1.5; }

.ui-seo-faq { display: grid; gap: 1px; margin: 0; overflow: hidden; border-radius: var(--box-radius, 14px); background: var(--line); box-shadow: var(--shadow-1); }
.ui-seo-faq > div { padding: 14px 16px; background: var(--page); }
.ui-seo-faq dt { display: flex; align-items: center; gap: 8px; font-size: 14.5px; font-weight: 600; }
.ui-seo-faq dt em { padding: 1px 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font-size: 11px; font-style: normal; text-transform: uppercase; }
.ui-seo-faq dd { margin: 6px 0 0; color: var(--muted); font-size: 13.5px; line-height: 1.55; }
.ui-seo-faq dd small { font-family: var(--font-mono); font-size: 11.5px; }
`;
