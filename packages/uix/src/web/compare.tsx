"use client";

import { ArrowUpRight, Backpack, ChevronDown, Clapperboard, GraduationCap, Handshake, Quote as QuoteIcon } from "lucide-react";
import { Accordion, Tooltip } from "radix-ui";
import { createContext, useContext, useState, type ReactNode } from "react";
import { BrandLogo } from "../components/brand-logo";
import { ButtonLink } from "../components/button";
import { SegmentedControl } from "../components/segmented-control";
import { Streamlines, type Cylinder } from "../components/streamlines";
import { MasterClassLogo, MasterClassWordmark } from "../components/svgs/masterclass";
import { useMedia } from "../hooks/use-media";
import { SitePage } from "./site";
import { questions } from "./seo";

/*
 * Dojo.foo next to another way to learn (MasterClass now; Udemy, Coursera and others later), as a story: what the other
 * does well, where Dojo.foo differs and who each is for (after Tailark's Libre customer story), then the two side by
 * side (after Tailark's Comparator 6) and the questions people ask (after Tailark's FAQs 1). Its words are a page of
 * Markdown (apps/web/comparisons/<rival>.mdx) laid out by the components here: the story in a <Story>, a <Quote> in
 * it, the two side by side in a <Compare> of <Category>s and <Row>s. What it says of the other is from a source it
 * cites; what it can't confirm, it leaves out. apps/web keeps the page out of search for now.
 */

type Value = string | boolean;
type Side = "dojo" | "rival";

/** Another way to learn: what the page's head and aside say of it, each from one of `sources` */
export type Rival = {
  name: string;
  website: string;
  headline: string;
  lead: string;
  sources: Array<{ label: string; url: string }>;
};

/** Its logo, on the card at the top, and its wordmark, as tall as Dojo.foo's logo beside it */
export type RivalMarks = { logo: ReactNode; wordmark: ReactNode };

/** The rivals' marks, by the name of their page */
export const rivalMarks: Record<string, RivalMarks> = {
  masterclass: {
    logo: <MasterClassLogo className="ui-cmp-match__rival" role="img" aria-label="MasterClass" />,
    wordmark: <MasterClassWordmark className="ui-cmp-wordmark" role="img" aria-label="MasterClass" />,
  },
};

type Page = { rival: Rival; marks?: RivalMarks; toc: Array<{ id: string; text: ReactNode }> };
const PageContext = createContext<Page | null>(null);

function usePage() {
  const page = useContext(PageContext);
  if (!page) throw new Error("A comparison's components belong in its ComparePage");
  return page;
}

/** The streamlines' cylinders, one round each mark: centred where the card sets them (30% and 70% across, 16:9) */
const MARKS: Cylinder[] = [[-0.2 * 16 / 9, 0, 0.2], [0.2 * 16 / 9, 0, 0.2]];

/** The page: its head, then its Markdown (`children`), then the questions; `toc` is the story's headings */
export function ComparePage({ children, ...page }: Page & { children: ReactNode }) {
  const { rival } = page;
  return (
    <SitePage window={false}>
      <style href="ui-compare" precedence="default">{css}</style>
      <div className="ui-cmp">
        <article className="ui-cmp-article">
          <header className="ui-cmp-head">
            <p className="ui-cmp-head__kicker">Dojo.foo vs {rival.name}</p>
            <h1>{rival.headline}</h1>
            <p>{rival.lead}</p>
          </header>
          <PageContext.Provider value={page}>{children}</PageContext.Provider>
          <section aria-labelledby="questions" className="ui-cmp-faq">
            <div className="ui-cmp-faq__intro">
              <h2 id="questions">Questions</h2>
              <p>About Dojo.foo, answered from its docs.</p>
            </div>
            <Accordion.Root type="single" collapsible className="ui-cmp-acc">
              {questions.filter((item) => item.status === "confirmed").map((item) => (
                <Accordion.Item key={item.question} value={item.question} className="ui-cmp-acc__item">
                  <Accordion.Header className="ui-cmp-acc__header">
                    <Accordion.Trigger className="ui-cmp-acc__trigger">
                      {item.question}
                      <ChevronDown aria-hidden="true" />
                    </Accordion.Trigger>
                  </Accordion.Header>
                  <Accordion.Content className="ui-cmp-acc__content">
                    <p>{item.answer}</p>
                  </Accordion.Content>
                </Accordion.Item>
              ))}
            </Accordion.Root>
          </section>
        </article>
      </div>
    </SitePage>
  );
}

/* ---------- The story ---------- */

/** The story, under the two marks, and its aside: the other's website and the sources, then what's on the page, beside the head and the story */
function Story({ children }: { children: ReactNode }) {
  const { rival, marks, toc } = usePage();
  return (
    <div className="ui-cmp-body">
      <div className="ui-cmp-main">
        <div className="ui-cmp-match" role="img" aria-label={`Dojo.foo and ${rival.name}`}>
          <Streamlines cylinders={MARKS} lines={44} thickness={3} intensity={0.8} dots speed={0.6} className="ui-cmp-match__flow" />
          <span className="ui-cmp-match__mark" data-side="dojo"><BrandLogo className="aspect-[2567/1211] h-[8cqi] w-auto" /></span>
          <span className="ui-cmp-match__vs" aria-hidden="true">vs</span>
          <span className="ui-cmp-match__mark" data-side="rival">{marks?.logo ?? <span className="ui-cmp-match__name">{rival.name}</span>}</span>
        </div>
        <div className="ui-cmp-prose">{children}</div>
      </div>
      <aside className="ui-cmp-aside">
        <dl className="ui-cmp-facts">
          <div><dt>Website</dt><dd><a href={rival.website} target="_blank" rel="noopener noreferrer">{new URL(rival.website).hostname.replace(/^www\./, "")}<ArrowUpRight aria-hidden="true" /></a></dd></div>
          <div><dt>Sources</dt>{rival.sources.map((source) => <dd key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.label}<ArrowUpRight aria-hidden="true" /></a></dd>)}</div>
        </dl>
        <nav aria-label="On this page" className="ui-cmp-toc">
          <h2>On this page</h2>
          <ul>
            {toc.map((heading) => <li key={heading.id}><a href={`#${heading.id}`}>{heading.text}</a></li>)}
            <li><a href="#side-by-side">Side by side</a></li>
            <li><a href="#questions">Questions</a></li>
          </ul>
        </nav>
      </aside>
    </div>
  );
}

/** A reviewer's words, from where they left off, and who said them (`cite`) */
function Quote({ cite, children }: { cite: string; children: ReactNode }) {
  return (
    <figure className="ui-cmp-quote">
      <QuoteIcon aria-hidden="true" />
      <blockquote>{children}</blockquote>
      <figcaption>{cite}</figcaption>
    </figure>
  );
}

/* ---------- Side by side ---------- */

const icons = { "graduation-cap": GraduationCap, handshake: Handshake, backpack: Backpack, clapperboard: Clapperboard };
const SidesContext = createContext<Side[]>(["dojo", "rival"]);

/** The two side by side: a card each, then the `<Category>`s */
function Compare({ children }: { children: ReactNode }) {
  const { rival, marks } = usePage();
  const [active, setActive] = useState<Side>("dojo");
  const wide = useMedia("(min-width: 768px)");
  const names: Record<Side, string> = { dojo: "Dojo.foo", rival: rival.name };
  const heads: Record<Side, ReactNode> = {
    dojo: <>
      <BrandLogo className="aspect-[2567/1211] h-6 w-auto" alt="Dojo.foo" />
      <ButtonLink size="sm" href="/docs/quickstart">Start for free</ButtonLink>
    </>,
    rival: <>
      <span className="ui-cmp-cmp__mark">{marks?.wordmark ?? rival.name}</span>
      <ButtonLink size="sm" variant="secondary" href={rival.website} target="_blank" rel="noopener noreferrer">Visit {rival.name}</ButtonLink>
    </>,
  };
  const sides: Side[] = wide ? ["dojo", "rival"] : [active];
  return (
    <section aria-labelledby="side-by-side" className="ui-cmp-cmp">
      <h2 id="side-by-side">Side by side</h2>
      {!wide && (
        <div className="ui-cmp-cmp__bar">
          <SegmentedControl size="compact" options={[names.dojo, names.rival]} value={names[active]} onChange={(next) => setActive(next === names.dojo ? "dojo" : "rival")} label="Compare" />
        </div>
      )}
      <div className="ui-cmp-cmp__heads">
        {sides.map((side) => <div key={side} className="ui-cmp-cmp__head" data-side={side}>{heads[side]}</div>)}
      </div>
      <Tooltip.Provider delayDuration={300}>
        <SidesContext.Provider value={sides}>{children}</SidesContext.Provider>
      </Tooltip.Provider>
    </section>
  );
}

/** A group of rows, under its name and icon */
function Category({ name, icon, children }: { name: string; icon?: keyof typeof icons; children: ReactNode }) {
  const Icon = icon && icons[icon];
  return (
    <div className="ui-cmp-cmp__cat">
      <h3>{Icon && <Icon aria-hidden="true" />}{name}</h3>
      {children}
    </div>
  );
}

/** One thing, as each side has it: a few words, `true` for a tick alone, `false` for none; `children`, if the words need
    more, as a tooltip on its name */
function Row({ name, dojo, rival, children }: { name: string; dojo: Value; rival: Value; children?: ReactNode }) {
  const sides = useContext(SidesContext);
  const values: Record<Side, Value> = { dojo, rival };
  return (
    <div className="ui-cmp-cmp__row">
      {sides.map((side) => <Cell key={side} name={name} description={children} value={values[side]} />)}
    </div>
  );
}

function Cell({ name, description, value }: { name: string; description?: ReactNode; value: Value }) {
  const label = <>{name}{value === false && <span className="sr-only">: no</span>}</>;
  return (
    <div className="ui-cmp-cell" data-none={value === false || undefined}>
      <span aria-hidden="true" className="ui-cmp-cell__mark">{value === false ? <span className="ui-cmp-cell__dot" /> : <Check />}</span>
      <span>
        {typeof value === "string" && <><span className="ui-cmp-cell__value">{value}</span> </>}
        {description ? (
          <Tooltip.Root>
            <Tooltip.Trigger className="ui-cmp-cell__name" data-more="">{label}</Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content sideOffset={4} className="ui-cmp-tip">{description}</Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ) : <span className="ui-cmp-cell__name">{label}</span>}
      </span>
    </div>
  );
}

/** Comparator 6's tick */
function Check() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 512 512">
      <path fill="currentColor" d="M17.47 250.9C88.82 328.1 158 397.6 224.5 485.5c72.3-143.8 146.3-288.1 268.4-444.37L460 26.06C356.9 135.4 276.8 238.9 207.2 361.9c-48.4-43.6-126.62-105.3-174.38-137z" />
    </svg>
  );
}

/** What a comparison's Markdown may use */
export const compareComponents = { Story, Quote, Compare, Category, Row };

const css = /* css */ `
.ui-cmp { max-width: 64rem; margin: 0 auto; padding: 56px 24px 96px; color: var(--ink); container: ui-cmp / inline-size; }
.ui-cmp h2 { margin: 0; font-size: 22px; font-weight: 620; line-height: 1.25; letter-spacing: -0.015em; scroll-margin-top: 88px; }

.ui-cmp-head { max-width: 42rem; margin: 0 0 48px; }
.ui-cmp-head__kicker { margin: 0 0 16px; color: var(--muted); font-size: 14px; font-weight: 550; }
.ui-cmp-head h1 { margin: 0; font-size: clamp(32px, 4.5vw, 44px); font-weight: 650; line-height: 1.1; letter-spacing: -0.03em; text-wrap: balance; }
.ui-cmp-head h1 + p { margin: 20px 0 0; color: var(--muted); font-size: 18px; line-height: 1.6; text-wrap: pretty; }

/* The head and the story in one column, the aside beside both from the top; the rest of the page below, across both */
.ui-cmp-article { display: grid; grid-template-columns: minmax(0, 42rem) 14rem; justify-content: space-between; column-gap: 48px; }
.ui-cmp-article > :where(*) { grid-column: 1 / -1; }
.ui-cmp-body { display: contents; }
.ui-cmp-head, .ui-cmp-main { grid-column: 1; min-width: 0; }
/* The details first, then the TOC, which stays in view to the end of the story */
.ui-cmp-aside { grid-column: 2; grid-row: 1 / span 2; }
.ui-cmp-aside > * + * { margin-top: 24px; padding-top: 24px; background: var(--ui-web-rule) left top / var(--ui-web-rule-size) repeat-x; }
.ui-cmp-toc { position: sticky; top: 88px; }
.ui-cmp-toc h2 { margin-bottom: 14px; font-size: 13px; font-weight: 600; letter-spacing: 0; }
.ui-cmp-toc ul { display: grid; gap: 10px; margin: 0; padding: 0; list-style: none; font-size: 14px; }
.ui-cmp-toc a, .ui-cmp-facts dd { color: var(--muted); text-decoration: none; }
.ui-cmp-toc a:hover { color: var(--ink); }
.ui-cmp-facts { display: grid; gap: 18px; margin: 0; font-size: 14px; line-height: 1.5; }
.ui-cmp-facts dt { margin-bottom: 4px; font-size: 13px; font-weight: 600; }
.ui-cmp-facts dd { margin: 0; }
.ui-cmp-facts dd + dd { margin-top: 6px; }
.ui-cmp-facts a { display: inline-flex; align-items: center; gap: 3px; color: var(--ink); text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; }
.ui-cmp-facts a svg { width: 14px; height: 14px; }
@container ui-cmp (max-width: 900px) {
  .ui-cmp-article { grid-template-columns: minmax(0, 1fr); }
  .ui-cmp-aside { grid-column: 1; grid-row: auto; margin: 48px 0 0; padding-top: 32px; background: var(--ui-web-rule) left top / var(--ui-web-rule-size) repeat-x; }
  .ui-cmp-toc { display: none; }
  .ui-cmp-aside > * + * { margin: 0; padding: 0; background: none; }
  .ui-cmp-facts { grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }
}

/* The two marks, 16:9, on gray: white streamlines part round each (its cylinders sit where the marks do) */
.ui-cmp-match { --ground: color-mix(in oklab, var(--ink) 16%, var(--page)); position: relative; isolation: isolate; aspect-ratio: 16 / 9; overflow: hidden; border-radius: calc(16px * var(--squircle-factor, 1)); background: var(--ground); container-type: inline-size; }
.ui-cmp-match__flow { position: absolute; inset: 0; z-index: -1; }
/* The flow fades in once its first frame is drawn, and out slowly towards the card's edges */
.ui-cmp-match__flow { opacity: 0; transition: opacity 1.2s ease; }
.ui-cmp-match__flow[data-ready] { opacity: 1; }
@media (prefers-reduced-motion: reduce) { .ui-cmp-match__flow { transition: none; } }
.ui-cmp-match__flow { mask-image: linear-gradient(to right, transparent, #000 22%, #000 78%, transparent), linear-gradient(to bottom, transparent, #000 26%, #000 74%, transparent); mask-composite: intersect; }
.ui-cmp-match__mark { position: absolute; top: 50%; display: flex; translate: -50% -50%; }
.ui-cmp-match__mark[data-side="dojo"] { left: 30%; }
.ui-cmp-match__mark[data-side="rival"] { left: 70%; }
.ui-cmp-match__rival { width: auto; height: 12cqi; aspect-ratio: 352.6 / 266.53; }
.ui-cmp-match__vs { position: absolute; top: 50%; left: 50%; translate: -50% -50%; color: var(--ink); font-size: max(18px, 3.6cqi); font-weight: 750; letter-spacing: -0.02em; }
.ui-cmp-match__name { font-size: 6cqi; font-weight: 700; letter-spacing: -0.03em; }
.ui-cmp-wordmark { display: block; width: auto; height: 100%; aspect-ratio: 352.6 / 48.6; }
.ui-cmp-cmp__mark { display: flex; align-items: center; height: 24px; }
.ui-cmp-cmp__mark .ui-cmp-match__name { font-size: 6cqi; font-weight: 700; letter-spacing: -0.03em; }
.ui-cmp-wordmark { height: 15px; }

.ui-cmp-prose { font-size: 16px; line-height: 1.75; text-wrap: pretty; }
.ui-cmp-prose h2 { margin-top: 48px; }
.ui-cmp-prose p { margin: 16px 0 0; color: color-mix(in oklab, var(--ink) 82%, transparent); }
.ui-cmp-quote { margin: 28px 0 0; padding: 28px 0 0; background: var(--ui-web-rule) left top / var(--ui-web-rule-size) repeat-x; }
.ui-cmp-quote svg { width: 22px; height: 22px; margin-bottom: 14px; color: #e32652; fill: currentColor; stroke: none; }
.ui-cmp-quote blockquote { margin: 0; font-size: 20px; line-height: 1.5; font-weight: 500; letter-spacing: -0.01em; }
.ui-cmp-quote blockquote::before { content: "…"; }
.ui-cmp-quote figcaption { margin-top: 12px; color: var(--muted); font-size: 14px; }

/* Side by side (Comparator 6): a card per side, sticky, then the categories' rows */
.ui-cmp-cmp { margin-top: 96px; }
.ui-cmp-cmp > h2 { margin-bottom: 24px; }
.ui-cmp-cmp__bar { position: sticky; top: 64px; z-index: 2; display: flex; padding: 10px 0; background: var(--page); }
.ui-cmp-cmp__heads { position: sticky; top: 64px; z-index: 1; display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; padding: 16px 0 40px; background: linear-gradient(var(--page) 70%, transparent); }
.ui-cmp-cmp__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: calc(12px * var(--squircle-factor, 1)); background: var(--card); box-shadow: var(--shadow-2, 0 1px 2px rgb(0 0 0 / 0.05)); }
.ui-cmp-cmp__cat + .ui-cmp-cmp__cat { margin-top: 40px; }
.ui-cmp-cmp__cat h3 { display: flex; align-items: center; gap: 8px; height: 56px; margin: 0; padding: 0 16px; font-size: 17px; font-weight: 560; }
.ui-cmp-cmp__cat h3 svg { width: 18px; height: 18px; }
.ui-cmp-cmp__row { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; background: var(--ui-web-rule) left top / var(--ui-web-rule-size) repeat-x; }
.ui-cmp-cmp__cat .ui-cmp-cmp__row:last-child { background: var(--ui-web-rule) left top / var(--ui-web-rule-size) repeat-x, var(--ui-web-rule) left bottom / var(--ui-web-rule-size) repeat-x; }
@container ui-cmp (max-width: 767px) {
  .ui-cmp-cmp__heads, .ui-cmp-cmp__row { grid-template-columns: 1fr; }
  .ui-cmp-cmp__heads { top: 116px; padding-top: 6px; }
  .ui-cmp-cmp__cat h3 { padding: 0; }
}
.ui-cmp-cell { display: flex; align-items: center; gap: 8px; min-height: 56px; padding: 8px 16px; font-size: 15px; line-height: 1.5; }
.ui-cmp-cell__mark { display: grid; place-items: center; flex: none; width: 18px; height: 18px; color: var(--ink); }
.ui-cmp-cell__dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); opacity: 0.5; }
.ui-cmp-cell[data-none] { color: color-mix(in oklab, var(--ink) 50%, transparent); }
.ui-cmp-cell__value { font-weight: 500; }
.ui-cmp-cell__name { padding: 0; border: 0; background: none; color: var(--muted); font: inherit; text-align: left; }
/* A name with more to say underlines, dotted, for its tooltip */
.ui-cmp-cell__name[data-more] { text-decoration: underline dotted; text-underline-offset: 3px; cursor: help; }
.ui-cmp-cell[data-none] .ui-cmp-cell__name { opacity: 0.6; }
.ui-cmp-tip { z-index: 50; max-width: 16rem; padding: 8px 10px; border: 1px solid var(--line); border-radius: calc(8px * var(--squircle-factor, 1)); background: var(--card); color: var(--ink); box-shadow: var(--shadow-4, 0 4px 16px rgb(0 0 0 / 0.1)); font-size: 13px; line-height: 1.5; }

/* Questions (FAQs 1): the intro beside an accordion, the open one on a card */
.ui-cmp-faq { display: grid; gap: 32px; margin-top: 96px; }
@container ui-cmp (min-width: 768px) { .ui-cmp-faq { grid-template-columns: 2fr 3fr; gap: 48px; } }
.ui-cmp-faq__intro p { margin: 12px 0 0; color: var(--muted); font-size: 16px; line-height: 1.6; text-wrap: balance; }
.ui-cmp-acc { display: grid; gap: 4px; }
.ui-cmp-acc__item { border-radius: calc(14px * var(--squircle-factor, 1)); transition: background-color 200ms ease, box-shadow 200ms ease; }
.ui-cmp-acc__item[data-state="open"] { background: var(--card); box-shadow: var(--shadow-3); }
.ui-cmp-acc__header { display: flex; margin: 0; }
.ui-cmp-acc__trigger { display: flex; flex: 1; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 16px 24px; border: 0; background: none; color: var(--ink); font: inherit; font-size: 16px; font-weight: 500; text-align: left; cursor: pointer; }
.ui-cmp-acc__trigger svg { width: 16px; height: 16px; flex: none; margin-top: 4px; color: var(--muted); transition: transform 200ms ease; }
.ui-cmp-acc__trigger:hover svg { transform: translateY(2px); }
.ui-cmp-acc__trigger[data-state="open"] svg { transform: rotate(180deg); }
.ui-cmp-acc__content { overflow: hidden; }
.ui-cmp-acc__content[data-state="open"] { animation: ui-cmp-acc-down 220ms cubic-bezier(.16, 1, .3, 1); }
.ui-cmp-acc__content[data-state="closed"] { animation: ui-cmp-acc-up 180ms ease; }
.ui-cmp-acc__content p { margin: 0; padding: 0 24px 18px; color: var(--muted); font-size: 16px; line-height: 1.6; }
@keyframes ui-cmp-acc-down { from { height: 0; } to { height: var(--radix-accordion-content-height); } }
@keyframes ui-cmp-acc-up { from { height: var(--radix-accordion-content-height); } to { height: 0; } }
@media (prefers-reduced-motion: reduce) { .ui-cmp-acc__content { animation: none !important; } }
@media (max-width: 720px) { .ui-cmp { padding: 32px 20px 64px; } }
`;
