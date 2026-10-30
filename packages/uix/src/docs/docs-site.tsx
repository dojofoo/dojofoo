import { followLink } from "../lib/link-event";
import { useEditorScheme, usePageMode } from "../lib/ui-preferences";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { Dropdown, Icon, MenuList, Popover, type MenuItem } from "../components/app-shell";
import { Markdown } from "../components/markdown";
import { codeCss } from "../components/code-block";
import { ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, ChatAiIcon, Copy01Icon, File01Icon, LeftToRightListBulletIcon, PencilEdit02Icon, SparklesIcon, Tick02Icon } from "../lib/icons";
import { SitePage, useSite } from "../web/site";
import { headingsOf, slug, type DocPage, type DocsContent } from "./content";

/*
 * The docs as the site lays them out (Fumadocs' notebook layout, apps/web/src/components/layout/notebook), in UIX's
 * look: the site's header, the sections as tabs under it, the section's page tree on the left (its groups as small
 * headings, its pages on a rail), the page in the middle – its tools (copy it as Markdown, open it in an assistant,
 * edit it), title, lead, its Markdown, the previous and next page – and what's on it on the right. On both rails a
 * marker glides to the open page and to the part being read.
 */

const SITE = "https://dojo.foo";
const REPO = "https://github.com/dojofoo/dojofoo";

export function DocsSite({ path = "/docs", content, renderApiPage, renderPage, toc: suppliedToc }: {
  /** The page open at first, by its site path, e.g. "/docs/quickstart" or "/docs/quickstart#usage" */
  path?: string;
  content: DocsContent;
  renderApiPage?: (page: string) => ReactNode;
  /** Compiled heading IDs/titles, supplied by the host MDX pipeline. */
  toc?: Array<{ depth: number; text: ReactNode; id: string }>;
  /** Production supplies compiled MDX; stories can use the Markdown projection. */
  renderPage?: (page: DocPage) => ReactNode;
}) {
  const { allPages, sections, findPage } = content;
  const docsSections = sections.filter(section => section.showInTabs !== false);
  const links = useSite();
  const editor = useEditorScheme();
  const boxed = editor.type === usePageMode();
  const title = useRef<HTMLHeadingElement>(null);
  const [route, hash] = path.split("#");
  const { page, section } = findPage(route);
  if (page.apiPage && !renderPage && !renderApiPage) throw new Error("API documentation requires a page renderer.");
  const previousRoute = useRef(route);
  useEffect(() => {
    if (previousRoute.current === route) return;
    previousRoute.current = route;
    if (hash) return;
    const frame = requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [route, hash]);
  // A heading in the address: scroll to it once the page is drawn
  useEffect(() => {
    if (!hash) return;
    const timer = window.setTimeout(() => document.getElementById(hash)?.scrollIntoView({ block: "start" }), 120);
    return () => window.clearTimeout(timer);
  }, [route, hash]);
  const open = (next: string) => links.openDoc(next.startsWith("#") ? `${route}${next}` : next);
  const follow = (next: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (next.startsWith("/") || next.startsWith("#")) followLink(event, () => open(next));
  };
  const order = allPages.filter((entry) => entry.section.id === section.id);
  const at = order.findIndex((entry) => entry.page.path === page.path);
  const previous = order[at - 1]?.page;
  const next = order[at + 1]?.page;
  const toc = useMemo(() => suppliedToc ?? headingsOf(page.body), [suppliedToc, page.body]);
  const treeEntries = <>
          {section.groups.map((group, index) => (
            <div key={index} className="ui-docs-tree__group">
              {group.title && <span className="ui-docs-tree__heading">{group.title}</span>}
              <ul className="ui-docs-rail">
                {group.entries.map((entry) => (
                  <li key={entry.path}>
                    <a href={entry.path} aria-current={entry.path === page.path ? "page" : undefined}
                      onClick={follow(entry.path)}>
                      {entry.page?.route ? <span className="ui-docs-route" aria-label={`${entry.page.route.method} ${entry.page.route.path}, ${entry.title}`}>
                        <span className="ui-docs-route__method" data-method={entry.page.route.method}>{entry.page.route.method}</span>
                        {/* A long path wraps at its slashes */}
                        <code>{entry.page.route.path.split(/(?=\/)/).map((part, index) => <Fragment key={index}>{index > 0 && <wbr />}{part}</Fragment>)}</code>
                      </span> : entry === section.groups[0].entries[0] ? "Overview" : entry.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

  </>;
  // The sections as tabs, with the page's tools – under the site's header, in one bar with it
  const tabs = (
    <nav className="ui-docs-tabs" aria-label="Documentation">
      <div className="ui-docs-tabs__row scroll-fade-x">
        {docsSections.map((item) => (
          <a key={item.id} href={item.groups[0].entries[0].path} aria-current={item.id === section.id ? "page" : undefined}
            onClick={follow(item.groups[0].entries[0].path)}>{item.title}</a>
        ))}
      </div>
      {/* The page's tools at the bar's right end, outside the row that scrolls (its menu would be clipped in it) */}
      {/* Not on an API page: it's generated from the API's routes, and its examples are on it */}
      {!page.apiPage && <PageTools page={page} />}
    </nav>
  );

  // On a phone the tabs and the tree move into the site's menu, as in epicat: the sections in a dropdown (the user
  // menu's), then the open one's pages; picking a section leaves the menu open, for its pages
  const menu = (
    <div className="ui-docs-menu">
      <Dropdown className="ui-as-user-menu ui-docs-menu__sections"
        items={docsSections.map((item) => ({ label: item.title, checked: item.id === section.id, onSelect: () => open(item.groups[0].entries[0].path) }))}
        trigger={({ open: shown, toggle }) => (
          <button type="button" className="ui-as-user" aria-label={`Section: ${section.title}`} aria-expanded={shown} onClick={toggle}>
            <span className="ui-as-user__name">{section.title}</span>
            <Icon icon={ArrowDown01Icon} size={13} />
          </button>
        )} />
      <Tree key={section.id} active={page.path}>{treeEntries}</Tree>
    </div>
  );

  return (
    <SitePage current="help" window={false} menu={menu} subnav={<>{tabs}{!page.apiPage && toc.length > 1 && <TocBar key={page.path} toc={toc} onOpen={open} />}</>}>
      <style href="ui-docs" precedence="default">{css}</style>
      <div className="ui-docs-layout" data-api={page.apiPage ? "" : undefined}>
        <Tree key={section.id} active={page.path}>{treeEntries}</Tree>

        <article className="ui-docs">
          <h1 ref={title} tabIndex={-1} className="ui-docs__title">{page.title}</h1>
          {page.description && <p className="ui-docs__lead">{page.description}</p>}
          {renderPage ? <Fragment key={page.path}>{renderPage(page)}</Fragment>
            : page.apiPage ? <Fragment key={page.path}>{renderApiPage?.(page.apiPage)}</Fragment> : <Prose body={page.body} boxed={boxed} onLink={open} />}
          <nav className="ui-docs__pager" aria-label="More pages">
            {previous ? <a href={previous.path} onClick={follow(previous.path)}><span><Icon icon={ArrowLeft01Icon} size={13} />Previous</span>{previous.title}</a> : <span />}
            {next && <a href={next.path} className="ui-docs__next" onClick={follow(next.path)}><span>Next<Icon icon={ArrowRight01Icon} size={13} /></span>{next.title}</a>}
          </nav>
          {!page.apiPage && <EditLink page={page} />}
        </article>

        {!page.apiPage && <aside key={page.path} className="ui-docs-side" aria-label="This page">
          <OnThisPage key={page.path} toc={toc} onOpen={open} />
          <EditLink page={page} />
        </aside>}
      </div>
    </SitePage>
  );
}

/** What's on the page when its column is hidden (Fumadocs' TOC popover): a bar in the sticky header naming the part
    being read, a ring filling as the page goes by; tapped, it opens into the outline */
function TocBar({ toc, onOpen }: { toc: Toc; onOpen: (href: string) => void }) {
  const [active, , started] = useReading(toc);
  const [open, setOpen] = useState(false);
  const at = Math.max(0, toc.findIndex((item) => item.id === active));
  const progress = started ? (at + 1) / toc.length : 0;
  const bar = useRef<HTMLDivElement>(null);
  // A tap outside closes it, as does Escape
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!bar.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", escape); };
  }, [open]);
  return (
    <div ref={bar} className="ui-docs-tocbar" data-open={open || undefined}>
      <button type="button" className="ui-docs-tocbar__toggle" aria-expanded={open} aria-controls="ui-docs-tocbar-outline" onClick={() => setOpen((value) => !value)}>
        <svg className="ui-docs-tocbar__ring" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          {progress > 0 && <circle cx="12" cy="12" r="9" pathLength="1" strokeDasharray={`${progress} 1`} transform="rotate(-90 12 12)" />}
        </svg>
        {/* "On this page" and the part being read in one place, one sliding up out of it as the other comes in */}
        <span className="ui-docs-tocbar__label" data-reading={started && !open || undefined}>
          <span>On this page</span>
          <span aria-hidden={!started || open || undefined}>{toc[at]?.text}</span>
        </span>
        <Icon icon={ArrowDown01Icon} size={15} />
      </button>
      {/* Folds open to its height (rows 0fr to 1fr) and shut again, its links out of reach while shut */}
      <div id="ui-docs-tocbar-outline" className="ui-docs-tocbar__outline" inert={!open} onClick={(event) => { if ((event.target as Element).closest("a")) setOpen(false); }}>
        <div className="scroll-fade"><OnThisPage toc={toc} onOpen={onOpen} /></div>
      </div>
    </div>
  );
}

/** The page's source on GitHub, to edit: under what's on the page, or at the page's end when that column is hidden */
function EditLink({ page }: { page: DocPage }) {
  return <a className="ui-docs__edit" href={`${REPO}/edit/main/${page.source}`} target="_blank" rel="noreferrer"><Icon icon={PencilEdit02Icon} size={12} />Edit on GitHub</a>;
}

/** A marker that glides along a rail to the item that's marked (aria-current) in it */
function useGlide(box: RefObject<HTMLElement | null>, key: unknown) {
  const [mark, setMark] = useState<{ top: number; height: number; left: number; ready: boolean } | null>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const measure = () => {
      const item = el?.querySelector<HTMLElement>("[aria-current]");
      if (!el || !item) return setMark(null);
      const outer = el.getBoundingClientRect();
      const rect = item.getBoundingClientRect();
      const rail = item.closest(".ui-docs-rail")?.getBoundingClientRect();
      // Placed without a glide the first time, then it glides
      setMark((previous) => ({ top: rect.top - outer.top + el.scrollTop, height: rect.height, left: (rail?.left ?? rect.left) - outer.left, ready: previous !== null }));
    };
    measure();
    if (!el) return;
    // And again when its items move: a font that loads late wraps a long one onto a second line
    const observer = new ResizeObserver(measure);
    el.querySelectorAll(".ui-docs-rail").forEach((rail) => observer.observe(rail));
    return () => observer.disconnect();
  }, [box, key]);
  return mark && <span className="ui-docs-glide" data-ready={mark.ready || undefined} aria-hidden="true" style={{ transform: `translate(${mark.left}px, ${mark.top}px)`, height: mark.height }} />;
}

function Tree({ active, children }: { active: string; children: ReactNode }) {
  const box = useRef<HTMLElement>(null);
  const glide = useGlide(box, active);
  return <aside ref={box} className="ui-docs-tree scroll-fade" aria-label="Pages">{children}{glide}</aside>;
}

/** The page's tools, as the big docs offer them: copy it as Markdown (for an agent), or open it – as Markdown, in an
    assistant, or to edit */
function PageTools({ page }: { page: DocPage }) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const markdown = `# ${page.title}\n\n${page.description ? `${page.description}\n\n` : ""}${page.body.trim()}\n`;
  const markdownUrl = page.onSite ? `${SITE}/llms.mdx/docs${page.path}/index.mdx` : `${REPO}/blob/main/${page.source}`;
  const ask = page.onSite ? `Read ${markdownUrl}, I want to ask questions about it.` : `${markdown}\n\nI want to ask questions about this page of the dojofoo docs.`;
  const copy = () => {
    void navigator.clipboard?.writeText(markdown).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };
  const items: MenuItem[] = [
    { label: "View as Markdown", description: page.onSite ? "The page's source, for reading or tools" : "Its source on GitHub", icon: File01Icon, onSelect: () => window.open(markdownUrl, "_blank", "noopener") },
    { label: "Open in ChatGPT", description: "Ask questions about this page", icon: ChatAiIcon, onSelect: () => window.open(`https://chatgpt.com/?hints=search&q=${encodeURIComponent(ask)}`, "_blank", "noopener") },
    { label: "Open in Claude", description: "Ask questions about this page", icon: SparklesIcon, onSelect: () => window.open(`https://claude.ai/new?q=${encodeURIComponent(ask)}`, "_blank", "noopener") },
    { label: "Edit on GitHub", description: page.source, icon: PencilEdit02Icon, onSelect: () => window.open(`${REPO}/edit/main/${page.source}`, "_blank", "noopener") },
  ];
  return (
    <div className="ui-docs-tools">
      <button type="button" className="ui-docs-tools__btn" onClick={copy} aria-live="polite">
        <Icon icon={copied ? Tick02Icon : Copy01Icon} size={14} />{copied ? "Copied" : "Copy Markdown"}
      </button>
      <span className="ui-as-anchor">
        <button type="button" className="ui-docs-tools__btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          Open<Icon icon={ArrowDown01Icon} size={13} />
        </button>
        <Popover open={open} onClose={() => setOpen(false)} align="end"><div className="ui-as-menu ui-docs-tools__menu"><MenuList items={items} onPick={() => setOpen(false)} /></div></Popover>
      </span>
    </div>
  );
}

/** The page's Markdown: headings get ids (the table of contents links to them), code blocks a copy button, and its site
    links stay in the docs */
function Prose({ body, boxed, onLink }: { body: string; /** Its code on the box's surface: the editor scheme is for the page's mode */ boxed: boolean; onLink: (href: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const dress = () => {
      el.querySelectorAll("h2, h3").forEach((heading) => { heading.id ||= slug(heading.textContent ?? ""); });
      el.querySelectorAll("pre:not([data-copy])").forEach((pre) => {
        pre.setAttribute("data-copy", "");
        pre.classList.add("ui-code");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "ui-code__copy";
        button.setAttribute("aria-label", "Copy code");
        pre.append(button);
      });
    };
    dress();
    const observer = new MutationObserver(dress);
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  const click = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    const copy = target.closest<HTMLElement>(".ui-code__copy");
    if (copy) {
      const code = copy.parentElement?.querySelector("code")?.textContent ?? "";
      void navigator.clipboard?.writeText(code.trimEnd()).then(() => {
        copy.setAttribute("data-copied", "");
        window.setTimeout(() => copy.removeAttribute("data-copied"), 1400);
      });
      return;
    }
    const href = target.closest("a")?.getAttribute("href");
    if (!href || /^[a-z]+:/i.test(href)) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    onLink(href);
  };
  // Its code blocks are CodeBlock's (components/code-block), out of Fumadocs' own code block styles (not-fumadocs-codeblock)
  return <div ref={box} className="ui-docs__prose not-fumadocs-codeblock" data-boxed={boxed || undefined} onClick={click}>
    <style href="ui-code" precedence="default">{codeCss}</style>
    <Markdown source={body} />
  </div>;
}

type Toc = Array<{ depth: number; text: ReactNode; id: string }>;

/** The part being read: the last heading above a third of the window */
function useReading(toc: Toc) {
  const [active, setActive] = useState(toc[0]?.id);
  // Whether the first heading has been reached: before it, the page's lead is being read
  const [started, setStarted] = useState(false);
  useEffect(() => {
    const update = () => {
      // The last heading above a third of the window is the part being read; at the very end, the last one
      let at = toc[0]?.id;
      let reached = false;
      for (const item of toc) {
        const heading = document.getElementById(item.id);
        if (heading && heading.getBoundingClientRect().top < window.innerHeight / 3) { at = item.id; reached = true; }
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) { at = toc.at(-1)?.id ?? at; reached = true; }
      setActive(at);
      setStarted(reached);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [toc]);
  return [active, setActive, started] as const;
}

/** What's on the page, the part being read marked on its rail */
function OnThisPage({ toc, onOpen }: { toc: Toc; onOpen: (href: string) => void }) {
  const [active, setActive] = useReading(toc);
  const box = useRef<HTMLElement>(null);
  const glide = useGlide(box, active);
  if (toc.length < 2) return null;
  return (
    <nav ref={box} className="ui-docs-toc" aria-label="On this page">
      <span className="ui-docs-toc__title"><Icon icon={LeftToRightListBulletIcon} size={14} />On this page</span>
      <ul className="ui-docs-rail">
        {toc.map((item) => (
          <li key={item.id}>
            <a href={`#${item.id}`} data-depth={item.depth} aria-current={item.id === active ? "location" : undefined} onClick={event => followLink(event, () => {
              setActive(item.id);
              onOpen(`#${item.id}`);
            })}>{item.text}</a>
          </li>
        ))}
      </ul>
      {glide}
    </nav>
  );
}

const css = /* css */ `
/* The header and the tabs are one bar at the top (SitePage's subnav): what stays in view starts under it */
.ui-web:has(.ui-docs-tabs) { --ui-docs-bar: 108px; }
/* With its column hidden, what's on the page is a bar under the tabs; on a phone the tabs go to the menu */
@media (max-width: 1100px) { .ui-web:has(.ui-docs-tocbar) { --ui-docs-bar: 152px; } }
@media (max-width: 760px) { .ui-web:has(.ui-docs-tabs) { --ui-docs-bar: 60px; } .ui-web:has(.ui-docs-tocbar) { --ui-docs-bar: 104px; } }
.ui-docs-tocbar { position: relative; display: none; max-width: 1280px; margin: 0 auto; padding: 0 8px; }
@media (max-width: 1303px) { .ui-docs-tocbar { padding: 0 20px; } }
@media (max-width: 1100px) { .ui-docs-tocbar { display: block; } }
.ui-docs-tocbar::after { position: absolute; right: 0; bottom: 0; left: 0; height: 1px; background: var(--line); content: ""; }
.ui-docs-tocbar__toggle { display: flex; align-items: center; gap: 10px; width: 100%; height: 44px; color: var(--muted); font-size: var(--fs-subtitle); text-align: left; }
.ui-docs-tocbar__toggle:hover, .ui-docs-tocbar[data-open] .ui-docs-tocbar__toggle { color: var(--ink); }
.ui-docs-tocbar__toggle > svg:last-child { flex: none; transition: rotate var(--motion-fast) var(--ease-standard); }
.ui-docs-tocbar[data-open] .ui-docs-tocbar__toggle > svg:last-child { rotate: 180deg; }
.ui-docs-tocbar__label { display: grid; flex: 1; min-width: 0; overflow: hidden; }
.ui-docs-tocbar__label > span { grid-area: 1 / 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; transition: opacity var(--motion-moderate) var(--ease-standard), translate var(--motion-moderate) var(--ease-standard); }
.ui-docs-tocbar__label > span + span, .ui-docs-tocbar__label[data-reading] > span:first-child { opacity: 0; translate: 0 100%; pointer-events: none; }
.ui-docs-tocbar__label[data-reading] > span:first-child { translate: 0 -100%; }
.ui-docs-tocbar__label[data-reading] > span + span { opacity: 1; translate: 0 0; }
.ui-docs-tocbar[data-open] .ui-docs-tocbar__label > span:first-child { color: var(--ink); }
.ui-docs-tocbar__ring { flex: none; width: 18px; height: 18px; fill: none; stroke-width: 2.5; transition: color var(--motion-fast) var(--ease-standard); }
.ui-docs-tocbar__ring circle:only-child, .ui-docs-tocbar__ring circle:first-child { stroke: var(--line); }
.ui-docs-tocbar__ring circle + circle { stroke: var(--accent); stroke-linecap: round; transition: stroke-dasharray var(--motion-moderate) var(--ease-standard); }
/* The outline drops over the page from under the bar, on the page's color (the bar's own is see-through) */
.ui-docs-tocbar__outline { position: absolute; top: 100%; right: 0; left: 0; display: grid; grid-template-rows: 0fr; opacity: 0; background: var(--page);
  /* Fluid's moderate tier: it folds shut a tier quicker than it opens */
  transition: grid-template-rows var(--motion-moderate-exit) var(--ease-exit), opacity var(--motion-moderate-exit) var(--ease-exit), box-shadow var(--motion-moderate-exit) var(--ease-exit); }
@media (max-width: 1303px) { .ui-docs-tocbar__outline { padding: 0 20px; } }
.ui-docs-tocbar[data-open] .ui-docs-tocbar__outline { box-shadow: 0 1px 0 var(--line), var(--shadow-5); }
.ui-docs-tocbar[data-open] .ui-docs-tocbar__outline { grid-template-rows: 1fr; opacity: 1; transition-duration: var(--motion-moderate); transition-timing-function: var(--ease-moderate); }
.ui-docs-tocbar__outline > div { min-height: 0; max-height: min(50dvh, 28rem); overflow-y: auto; overscroll-behavior: contain; }
.ui-docs-tocbar__outline .ui-docs-toc { padding: 4px 0 16px; }
@media (prefers-reduced-motion: reduce) { .ui-docs-tocbar__outline, .ui-docs-tocbar__label > span { transition: none; } }
.ui-docs-tocbar__outline .ui-docs-toc__title { display: none; }
/* Rows a thumb can hit, as epicat's */
.ui-docs-tocbar__outline .ui-docs-toc a { padding-block: 11px; font-size: 15px; }
/* The phone's menu: the sections in the user menu's dropdown, the open one's pages under it, each a row a thumb can hit */
.ui-docs-menu { display: grid; gap: 4px; padding-top: 18px; background: var(--ui-web-rule) left top / var(--ui-web-rule-size) repeat-x; }
.ui-docs-menu .ui-docs-tree { position: relative; top: auto; display: block; max-height: none; overflow: visible; padding: 18px 0 0; }
.ui-docs-menu .ui-docs-tree a { padding-block: 9px; font-size: 15px; }
/* The tabs: the sections, under the header, the open one underlined in the brand's color, over a solid rule (the page
   scrolls under it, so a dotted one would flicker) */
.ui-docs-tabs { position: relative; display: flex; max-width: 1280px; margin: 0 auto; align-items: center; gap: 22px; padding: 0 8px; }
.ui-docs-tabs::before { position: absolute; right: 8px; bottom: 0; left: 8px; height: 1px; background: var(--line); content: ""; }
/* On the header's edge: its logo, the first tab and the tree share a line */
.ui-docs-tabs__row { display: flex; flex: 1; align-items: center; gap: 22px; min-width: 0; overflow-x: auto; scrollbar-width: none; }
@media (max-width: 760px) { .ui-docs-tools, .ui-docs-tabs { display: none; } }
@media (max-width: 1303px) { .ui-docs-tabs { padding: 0 20px; } .ui-docs-tabs::before { right: 20px; left: 20px; } }
.ui-docs-tabs a { position: relative; flex: none; padding: 14px 0 13px; white-space: nowrap; color: var(--muted); font-size: var(--fs-subtitle); font-weight: 500; text-decoration: none; }
.ui-docs-tabs a:hover { color: var(--ink); }
.ui-docs-tabs a[aria-current="page"] { color: var(--accent); }
.ui-docs-tabs a[aria-current="page"]::after { position: absolute; right: 0; bottom: 0; left: 0; height: 2px; background: var(--accent); content: ""; }

/* Three columns: the tree, the page, what's on it */
.ui-docs-layout { display: grid; grid-template-columns: 14rem minmax(0, 1fr) 14rem; gap: 44px; padding: 0 8px; }
.ui-docs-layout[data-api] { grid-template-columns: 14rem minmax(0, 1fr); gap: 28px; }
@media (max-width: 1303px) { .ui-docs-layout { padding: 0 20px; } }
@media (max-width: 1100px) { .ui-docs-layout { grid-template-columns: 14rem minmax(0, 1fr); } }

/* A rail and the marker gliding along it to the item that's open */
.ui-docs-rail { margin: 0; padding: 0; list-style: none; border-left: 1px solid var(--line); }
.ui-docs-glide { position: absolute; top: 0; left: -0.5px; width: 2px; border-radius: 2px; background: var(--accent); pointer-events: none; }
.ui-docs-glide[data-ready] { transition: transform 320ms cubic-bezier(0.22, 1, 0.36, 1), height 320ms cubic-bezier(0.22, 1, 0.36, 1); }
@media (prefers-reduced-motion: reduce) { .ui-docs-glide[data-ready] { transition: none; } }

/* The tree: the section's pages, its groups as small headings, their pages on a rail */
.ui-docs-tree { position: sticky; top: var(--ui-docs-bar); align-self: start; max-height: calc(100dvh - var(--ui-docs-bar)); overflow-y: auto; padding: 32px 0 40px; }
.ui-docs-tree__group + .ui-docs-tree__group { margin-top: 22px; }
.ui-docs-tree__heading { display: block; margin-bottom: 8px; color: var(--muted); font-size: var(--fs-caption); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.ui-docs-tree a { display: block; padding: 6px 12px 6px 16px; color: var(--muted); font-size: var(--fs-subtitle); text-decoration: none; transition: color var(--motion-fast) var(--ease-standard); }
.ui-docs-tree a:hover { color: var(--ink); }
.ui-docs-tree a[aria-current="page"] { color: var(--ink); font-weight: 550; }
/* An API page: its method, small and in its color, then its path */
.ui-docs-route { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
.ui-docs-route code { min-width: 0; font-family: var(--font-mono); font-size: 12.5px; }
.ui-docs-route__method { flex: none; width: 2.6em; font-family: var(--font-mono); font-size: 10.5px; font-weight: 600; letter-spacing: 0.02em; color: var(--ui-docs-method, var(--muted)); }
/* Fumadocs' method colors (its MethodLabel, on the API page): Tailwind's 600s, its 400s in dark */
.ui-docs-route__method[data-method="GET"] { --ui-docs-method: #16a34a; }
.ui-docs-route__method[data-method="POST"] { --ui-docs-method: #2563eb; }
.ui-docs-route__method[data-method="PUT"] { --ui-docs-method: #ca8a04; }
.ui-docs-route__method[data-method="PATCH"] { --ui-docs-method: #ea580c; }
.ui-docs-route__method[data-method="DELETE"] { --ui-docs-method: #dc2626; }
:is(.dark, [data-theme="dark"]) .ui-docs-route__method[data-method="GET"] { --ui-docs-method: #4ade80; }
:is(.dark, [data-theme="dark"]) .ui-docs-route__method[data-method="POST"] { --ui-docs-method: #60a5fa; }
:is(.dark, [data-theme="dark"]) .ui-docs-route__method[data-method="PUT"] { --ui-docs-method: #facc15; }
:is(.dark, [data-theme="dark"]) .ui-docs-route__method[data-method="PATCH"] { --ui-docs-method: #fb923c; }
:is(.dark, [data-theme="dark"]) .ui-docs-route__method[data-method="DELETE"] { --ui-docs-method: #f87171; }

/* The page */
.ui-docs { min-width: 0; max-width: 46rem; padding: 40px 0 72px; }
.ui-docs__title { outline: none; margin: 0; font-size: 32px; line-height: 1.15; font-weight: 650; letter-spacing: -0.02em; }
.ui-docs__lead { max-width: 36rem; margin: 12px 0 0; color: var(--muted); font-size: 15px; line-height: 1.55; text-wrap: pretty; }

/* Its tools: copy it as Markdown, open it elsewhere – at the right end of the tabs */
.ui-docs-tools { display: flex; gap: 6px; margin-left: auto; }
.ui-docs-tools__btn { display: inline-flex; flex: none; align-items: center; gap: 6px; height: 28px; white-space: nowrap; padding: 0 10px; border-radius: calc(8px * var(--squircle-factor, 1)); background: var(--surface-3); box-shadow: var(--shadow-1); color: var(--muted); font-size: var(--fs-body); font-weight: 500; transition: color var(--motion-fast) var(--ease-standard); }
.ui-docs-tools__btn:hover, .ui-docs-tools__btn[aria-expanded="true"] { color: var(--ink); }
.ui-docs-tools__menu { min-width: 260px; }

/* The page's Markdown, set for reading: the app's text, a little larger, code in the editor's font and theme */
.ui-docs__prose { max-width: 40rem; margin-top: 32px; }
.ui-docs__prose .ui-result-markdown { margin: 0; color: var(--ink); font-size: 14.5px; line-height: 1.7; overflow-wrap: break-word; }
.ui-docs__prose :is(h2, h3) { scroll-margin-top: calc(var(--ui-docs-bar) + 24px); color: var(--ink); letter-spacing: -0.01em; }
.ui-docs__prose h2 { margin: 40px 0 10px; font-size: 20px; line-height: 1.3; font-weight: 620; }
.ui-docs__prose h3 { margin: 28px 0 8px; font-size: 16px; font-weight: 620; }
.ui-docs__prose p { margin: 12px 0; }
.ui-docs__prose :is(ul, ol) { margin: 12px 0; padding-left: 22px; }
.ui-docs__prose ul { list-style: disc; }
.ui-docs__prose ol { list-style: decimal; }
.ui-docs__prose li { margin: 4px 0; }
.ui-docs__prose li::marker { color: var(--muted); }
.ui-docs__prose a { color: var(--accent); text-decoration: underline; text-decoration-color: color-mix(in oklab, var(--accent) 35%, transparent); text-underline-offset: 3px; }
.ui-docs__prose a:hover { text-decoration-color: currentColor; }
/* Compiled MDX headings are anchors; keep the same heading ink as the Markdown presentation. */
.ui-docs__prose :is(h2, h3) a { color: inherit; text-decoration: none; }
.ui-docs__prose strong { font-weight: 620; }
.ui-docs__prose :not(pre) > code { padding: 1px 5px; border-radius: calc(5px * var(--squircle-factor, 1)); background: var(--chip); font-family: var(--font-mono); font-size: 0.88em; white-space: nowrap; }
.ui-docs__prose blockquote { margin: 16px 0; padding: 12px 16px; border-radius: calc(12px * var(--squircle-factor, 1)); background: var(--accent-soft); color: var(--ink); }
.ui-docs__prose blockquote p { margin: 0; }
.ui-docs__prose table { width: 100%; margin: 16px 0; border-collapse: collapse; font-size: 13.5px; }
.ui-docs__prose :is(th, td) { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.ui-docs__prose th { color: var(--muted); font-size: var(--fs-caption); font-weight: 600; }
.ui-docs__prose td:first-child code { white-space: nowrap; }


/* The previous and next page, two cards at the foot, and the way to edit the page */
.ui-docs__pager { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 56px; }
.ui-docs__pager a { display: grid; gap: 4px; padding: 14px 16px; border-radius: var(--box-radius); background: var(--box-surface); box-shadow: var(--box-shadow); color: var(--ink); text-align: left; text-decoration: none; font-size: var(--fs-subtitle); font-weight: 550; transition: box-shadow var(--motion-fast) var(--ease-standard); }
.ui-docs__pager a:hover { box-shadow: var(--shadow-3); }
.ui-docs__pager a span { display: inline-flex; align-items: center; gap: 4px; color: var(--muted); font-size: var(--fs-caption); font-weight: 500; }
.ui-docs__pager .ui-docs__next { justify-items: end; text-align: right; }
/* Small, well under what's on the page; at the page's end only when that column is hidden */
.ui-docs__edit { display: inline-flex; align-items: center; justify-self: start; gap: 5px; height: 24px; margin-top: 20px; padding: 0 8px; border-radius: calc(6px * var(--squircle-factor, 1)); background: var(--surface-3); box-shadow: var(--shadow-1); color: var(--muted); font-size: var(--fs-caption); font-weight: 500; text-decoration: none; }
.ui-docs__edit:hover { color: var(--ink); }
.ui-docs-side .ui-docs__edit { margin-top: 24px; }
@media (min-width: 1101px) { .ui-docs > .ui-docs__edit { display: none; } }

/* The right column, sticky: the tools, then on this page – on its own rail, the part being read marked */
.ui-docs-side { position: sticky; top: var(--ui-docs-bar); align-self: start; display: grid; gap: 28px; padding: 40px 0 24px; }
/* Narrower: "On this page" goes to the bar under the tabs; on a phone the tree goes to the menu */
@media (max-width: 1100px) { .ui-docs-side { display: none; } }
@media (max-width: 760px) { .ui-docs-layout, .ui-docs-layout[data-api] { grid-template-columns: minmax(0, 1fr); } .ui-docs-layout > .ui-docs-tree { display: none; } }
.ui-docs-toc { position: relative; }
.ui-docs-toc__title { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 10px; color: var(--muted); font-size: var(--fs-caption); font-weight: 550; }
.ui-docs-toc a { display: block; padding: 5px 0 5px 12px; color: var(--muted); font-size: var(--fs-body); text-decoration: none; transition: color var(--motion-fast) var(--ease-standard); }
.ui-docs-toc a[data-depth="3"] { padding-left: 24px; }
.ui-docs-toc a:hover { color: var(--ink); }
.ui-docs-toc a[aria-current="location"] { color: var(--accent); }
`;
