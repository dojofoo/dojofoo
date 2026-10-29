import { createContext, useContext, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Icon, ShellStyles } from "../components/app-shell";
import { Avatar } from "../components/arc/avatar/avatar";
import { BrandLogo } from "../components/brand-logo";
import { ButtonLink } from "../components/button";
import { Copy01Icon, CopyrightIcon, Menu01Icon, Search01Icon, Tick02Icon } from "../lib/icons";
import { Drawer, DrawerContent, DrawerTrigger } from "../components/arc/drawer/drawer";
import { cn } from "../lib/utils";
import makerPhoto from "../assets/tomhaxxx.jpg?url";
import type { WebCourse } from "./catalog";
import type { SearchScope } from "../components/site-search-palette";

/*
 * The website's frame, in the app's look (the learner pages' AppShell): the page on surface 1, the content in a rounded
 * window on surface 2 under a slim header, the footer back on the page. It takes the shell's tokens (.ui-as) – its
 * type, inks, hairlines and buttons – so the site and the app read as one product.
 *
 * Where links go comes from SiteContext (the Website component provides it): a section, a docs page, a course.
 *
 *   <SitePage current="courses">…</SitePage>
 */

export type SiteSection = "home" | "courses" | "docs" | "help";

export type SiteLinks = {
  navigate: (section: SiteSection) => void;
  /** Real destinations for server rendering, new tabs and modified clicks. */
  sectionHref: (section: SiteSection) => string;
  /** A docs page by its site path, e.g. "/docs/quickstart#usage" */
  openDoc: (href: string) => void;
  openCourse: (course: WebCourse) => void;
  courseHref: (course: WebCourse) => string;
  openSearch: (scope: SearchScope) => void;
  footerControls?: ReactNode;
  footerLinks?: ReadonlyArray<{ title: string; links: ReadonlyArray<readonly [label: string, destination: string]> }>;
};

export const SiteContext = createContext<SiteLinks | null>(null);
export function useSite() {
  const links = useContext(SiteContext);
  if (!links) throw new Error("Website layouts require a SiteContext adapter.");
  return links;
}

// Help is the docs: usage, authoring, developers and support
const sections: Array<{ id: SiteSection; label: string }> = [
  { id: "courses", label: "Courses" },
  { id: "help", label: "Help" },
];

export function SitePage({ current, children, window = true, full = false, backdrop, subnav, menu }: {
  current?: SiteSection;
  children: ReactNode;
  /** Off: the content sits on the page itself (the landing's hero), not in the window */
  window?: boolean;
  /** The content spans the browser window (the landing: its app preview runs edge to edge) */
  full?: boolean;
  /** Behind the foot of the page, under the footer (the landing's contour map) */
  backdrop?: ReactNode;
  /** A second row under the header (the docs' tabs): the two stay at the top as one bar, the page sliding under it */
  subnav?: ReactNode;
  /** More for the phone's menu, under the site's sections (the docs: their sections and pages) */
  menu?: ReactNode;
  /** @deprecated Links come from SiteContext */
  onNavigate?: (section: SiteSection) => void;
}) {
  return (
    <div className={cn("ui-as ui-web", backdrop && "ui-web--ground")}>
      <SiteStyles />
      {subnav ? <div className="ui-web-bar"><SiteHeader current={current} menu={menu} />{subnav}</div> : <SiteHeader current={current} menu={menu} />}
      <main className={cn("ui-web__main", window && "ui-web__window", full && "ui-web__main--full")}>{children}</main>
      {backdrop}
      <SiteFooter current={current} />
    </div>
  );
}

export function SiteStyles() {
  return <><ShellStyles /><style href="ui-web" precedence="default">{css}</style></>;
}

export function SiteHeader({ current, as: Component = "header", mobileAction, menu }: { current?: SiteSection; as?: "header" | "div"; mobileAction?: ReactNode; menu?: ReactNode }) {
  const links = useSite();
  // In the docs the search looks in the docs; anywhere else in the courses (the dialog switches either way)
  const scope: SearchScope = current === "help" || current === "docs" ? "docs" : "courses";
  const go = (section: SiteSection) => (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    links.navigate(section);
  };
  const getStarted = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    event.preventDefault();
    links.openDoc("/docs/quickstart");
  };
  return (
    <Component className="ui-web-head" data-site-navigation="">
      <a href={links.sectionHref("home")} className="ui-web-head__brand" aria-label="Dojo.foo home" onClick={go("home")}><BrandLogo className="aspect-[2567/1211] h-[30px] w-auto" /></a>
      {/* The search in the middle, the sections beside the way in */}
      <button type="button" className="ui-web-head__search" aria-haspopup="dialog" aria-label={scope === "docs" ? "Search docs" : "Search courses"} onClick={() => links.openSearch(scope)}>
        <Icon icon={Search01Icon} size={15} />
        <span>{scope === "docs" ? "Search docs" : "Search courses"}</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="ui-web-head__end">
        <nav className="ui-web-head__nav" aria-label="Site">
          {sections.map((section) => (
            <a key={section.id} href={links.sectionHref(section.id)} className="ui-web-head__link" aria-current={current === section.id ? "page" : undefined} onClick={go(section.id)}>{section.label}</a>
          ))}
        </nav>
        {mobileAction}
        <ButtonLink size="sm" className="ui-web-head__start" href="/docs/quickstart" onClick={getStarted}>Get started</ButtonLink>
        {/* On a phone the sections and the way in fold into a menu beside the search (as Fumadocs' docs do) */}
        <SiteMenu>
          <ButtonLink href="/docs/quickstart" className="ui-web-menu__start" onClick={getStarted}>Get started</ButtonLink>
          <nav className="ui-web-menu__nav" aria-label="Site">
            {sections.map((section) => (
              <a key={section.id} href={links.sectionHref(section.id)} aria-current={current === section.id ? "page" : undefined} onClick={go(section.id)}>{section.label}</a>
            ))}
          </nav>
          {menu}
        </SiteMenu>
      </div>
    </Component>
  );
}

/** The phone's menu: Arc's drawer from the right (drag its head or tap beside it to close), closed too by a link in it */
function SiteMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  // Wider than a phone it has nothing to hold (the header shows it all): it goes
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 761px)");
    const away = () => { if (wide.matches) setOpen(false); };
    wide.addEventListener("change", away);
    return () => wide.removeEventListener("change", away);
  }, []);
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger className="ui-web-head__menu" aria-label="Menu">
        <Icon icon={Menu01Icon} size={18} />
      </DrawerTrigger>
      <DrawerContent title="Menu" hideTitle closeLabel="Close menu" className="ui-as ui-web-menu" aria-describedby={undefined}>
        <div className="ui-web-menu__body" onClick={(event) => { if ((event.target as Element).closest("a")) setOpen(false); }}>{children}</div>
      </DrawerContent>
    </Drawer>
  );
}

const footer = [
  { title: "Learn", links: [["Usage", "/docs"], ["Quickstart", "/docs/quickstart"], ["Installation", "/docs/installation"]] },
  { title: "Explore", links: [["Courses", "courses"], ["Authoring", "/authoring"], ["Developers", "/developers"]] },
  { title: "Support", links: [["Help & Support", "/help"], ["Issues", "https://github.com/dojofoo/dojofoo/issues"], ["Roadmap", "https://github.com/dojofoo/dojofoo/blob/main/ROADMAP.md"]] },
] as const;

export function SiteFooter({ current }: { current?: SiteSection }) {
  const links = useSite();
  // The maker's line for the section: owning up to the docs, daring the course browser
  const line = current === "help" || current === "docs" ? "No idea how that works, ask AI"
    : current === "courses" ? "If you're such a pro, make your own course!"
    : "I made dis";
  return (
    <footer className="ui-web-foot">
      <div className="ui-web-foot__about">
        <BrandLogo className="aspect-[2567/1211] h-6 w-auto" />
        <p>Deliberate practice, guided by the coding agent you already use.</p>
      </div>
      {(links.footerLinks ?? footer).map((column) => (
        <nav key={column.title} className="ui-web-foot__col" aria-label={column.title}>
          <span className="ui-web-foot__title">{column.title}</span>
          {column.links.map(([label, to]) => to.startsWith("http")
            ? <a key={label} href={to} target="_blank" rel="noreferrer">{label}</a>
            : <a key={label} href={to.startsWith("/") ? to : links.sectionHref(to as SiteSection)} onClick={(event) => { if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return; event.preventDefault(); if (to.startsWith("/")) links.openDoc(to); else links.navigate(to as SiteSection); }}>{label}</a>)}
        </nav>
      ))}
      <div className="ui-web-foot__base">
        <span className="ui-web-foot__copy"><Icon icon={CopyrightIcon} size={15} /><span className="sr-only">Copyright</span>Dojo.foo{links.footerControls && <span className="ml-2">{links.footerControls}</span>}</span>
        {/* The maker's line as a small quote (the testimonials' mark), his avatar after it, online */}
        <a className="ui-web-foot__maker" href="https://x.com/tomhaxxx" target="_blank" rel="noreferrer" aria-label={`${line} – Tom Siwik on X`}>
          {/* The mark inside the quote, so it opens its first line however the line wraps */}
          <q><svg aria-hidden="true" viewBox="0 0 32 24" className="ui-web-foot__mark">
            <path d="M0 24V14.4C0 6.6 4.2 1.8 12.4 0l1.4 3.4C9.4 4.8 7.3 7.6 7 11.2h6.2V24H0Zm18.2 0V14.4C18.2 6.6 22.4 1.8 30.6 0L32 3.4c-4.4 1.4-6.5 4.2-6.8 7.8h6.2V24H18.2Z" />
          </svg>{line}</q>
          <Avatar name="Tom Siwik" src={makerPhoto} size="md" status="online" />
        </a>
      </div>
    </footer>
  );
}

/** A command to run, in the editor's monospace, with a button that copies it */
export function CommandCopy({ command, label, prompt = false, className }: { command: string; label?: string; /** Words for an agent rather than a shell line: no `$`, and it wraps */ prompt?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    });
  };
  return (
    <div className={cn("ui-web-cmd", prompt && "ui-web-cmd--prompt", className)}>
      {label && <span className="ui-web-cmd__label">{label}</span>}
      {/* The prompt, out of the selection: selecting the line takes only the command */}
      {!prompt && <span className="ui-web-cmd__prompt" aria-hidden="true">$</span>}
      <code>{command}</code>
      <button type="button" className="ui-web-cmd__copy" aria-label={copied ? "Copied" : prompt ? "Copy prompt" : `Copy ${command}`} onClick={copy}>
        <Icon icon={copied ? Tick02Icon : Copy01Icon} size={14} />
      </button>
    </div>
  );
}

/** A page's head, as the learner pages set theirs: kicker, title, lead */
export function PageHead({ kicker, title, lead, children }: { kicker?: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="ui-web-pagehead">
      {kicker && <p className="ui-ob-kicker">{kicker}</p>}
      <h1 className="ui-web-pagehead__title">{title}</h1>
      {lead && <p className="ui-web-pagehead__lead">{lead}</p>}
      {children}
    </header>
  );
}

const css = /* css */ `
/* The page: surface 1, the window on it as the app's main panel (surface 2, its radius and shadow) */
.ui-web { position: relative; min-height: 100dvh; background: var(--page); color: var(--ink);
  /* The site's horizontal rules: 1px dots, generously spaced – as a background, \`var(--ui-web-rule) left top / var(--ui-web-rule-size) repeat-x\` */
  --ui-web-rule: linear-gradient(to right, color-mix(in oklab, var(--ink) 30%, transparent) 0 1px, transparent 1px);
  --ui-web-rule-size: 10px 1px; }
/* The canvas, where the page's own scrollbar sits: the page's color, so the track doesn't show as a strip */
:root:has(.ui-web) { background: var(--surface-1); }
/* Over a backdrop: the footer above it, with room below for the map to show */
.ui-web--ground .ui-web-foot { position: relative; z-index: 1; padding-bottom: 120px; }
.ui-web__main { display: block; max-width: 1280px; margin: 0 auto; }
.ui-web__main--full { max-width: none; }
.ui-web__window { margin: 0 auto; border-radius: var(--radius-panel); background: var(--panel); box-shadow: var(--shadow-3); container: ui-web / inline-size; }
@media (min-width: 1304px) { .ui-web__window { max-width: 1280px; } }
@media (max-width: 1303px) { .ui-web__window { margin: 0 12px; } }

/* With a subnav, the header and it are one bar at the top: the page's color, see-through and blurred, across the whole
   window, the page sliding under it (as on the site, Fumadocs' notebook header) */
.ui-web:has(> .ui-web-bar) { overflow-x: clip; }
.ui-web-bar { position: sticky; top: 0; z-index: 30; }
.ui-web-bar::before { position: absolute; inset: 0 calc(50% - 50vw); z-index: -1; background: color-mix(in oklab, var(--page) 80%, transparent); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); content: ""; }

/* Header: the brand, the sections, search and the way in – on the page, above the window */
/* Header: the brand, the search centered, the sections beside the way in */
.ui-web-head { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 24px; max-width: 1280px; height: 60px; margin: 0 auto; padding: 0 8px; }
@media (max-width: 1303px) { .ui-web-head { padding: 0 20px; } }
.ui-web-head__brand { display: flex; justify-self: start; align-items: center; color: var(--ink-strong); }
.ui-web-head__nav { display: flex; gap: 2px; }
.ui-web-head__link { padding: 6px 10px; border-radius: calc(8px * var(--squircle-factor, 1)); color: var(--muted); font-size: var(--fs-subtitle); font-weight: 500; text-decoration: none; transition: color var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard); }
.ui-web-head__link:hover { background: var(--hover); color: var(--ink); }
.ui-web-head__link[aria-current="page"] { color: var(--ink); }
.ui-web-head__end { display: flex; justify-self: end; align-items: center; gap: 8px; }
/* The search: a box, as the landing page's command */
.ui-web-head__search { display: inline-flex; align-items: center; gap: 8px; width: 320px; height: 40px; padding: 0 12px 0 14px; border-radius: var(--box-radius); background: var(--box-surface); box-shadow: var(--box-shadow); color: var(--muted); font-size: var(--fs-body); }
.ui-web-head__search span { flex: 1; text-align: left; }
.ui-web-head__search kbd { font: inherit; font-size: var(--fs-caption); }
@media (max-width: 900px) { .ui-web-head__search { width: 200px; } }
@media (max-width: 760px) {
  .ui-web-head { grid-template-columns: auto 1fr auto; }
  .ui-web-head__nav { display: none; }
  .ui-web-head__search { justify-self: end; justify-content: center; width: 40px; padding: 0; }
  .ui-web-head__search :is(span, kbd) { display: none; }
  .ui-web-head .ui-web-head__start { display: none; }
}
/* The menu's button beside the search: on a phone both are plain icons, their hit areas touching, the last one's icon
   on the page's edge (as Fumadocs' header) */
.ui-web-head__menu { display: none; place-items: center; width: 40px; height: 40px; border-radius: calc(10px * var(--squircle-factor, 1)); color: var(--muted); transition: color var(--motion-fast) var(--ease-standard), background-color var(--motion-fast) var(--ease-standard); }
.ui-web-head__menu:hover, .ui-web-head__search:hover { color: var(--ink); }
@media (max-width: 760px) {
  .ui-web-head { column-gap: 0; }
  .ui-web-head__end { gap: 0; margin-right: -10px; }
  .ui-web-head__menu { display: grid; }
  .ui-web-head__search { background: none; box-shadow: none; border-radius: calc(10px * var(--squircle-factor, 1)); }
  .ui-web-head__menu:active, .ui-web-head__search:active { background: var(--hover); }
}
/* The menu: Arc's drawer (components/arc/drawer) on the page's tokens (it renders on the body, so it takes the shell's
   own, .ui-as, and the site's rule), as wide as Fumadocs' (85%, at most 380px) */
.ui-web-menu { --ui-web-rule: linear-gradient(to right, color-mix(in oklab, var(--ink) 30%, transparent) 0 1px, transparent 1px); --ui-web-rule-size: 10px 1px; 
  --drawer-size: min(380px, 85vw); --border: var(--line); --surface-raised: var(--page); --foreground: var(--ink); --shadow-floating: var(--shadow-6);
  --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 20px; --space-6: 24px; --space-8: 40px; --text-sm: var(--fs-body); --text-lg: 17px; --leading-body: 1.5;
  --radius-control: calc(10px * var(--squircle-factor, 1)); --surface-muted: var(--hover); --text-secondary: var(--muted); }
.ui-web-menu > :first-child { padding: 10px 10px 0 20px; border-bottom: 0; }
.ui-web-menu > :first-child button { border: 0; background: none; }
.ui-web-menu > :last-child { padding: 0; }
.ui-web-menu__body { display: flex; flex-direction: column; gap: 6px; padding: 6px 20px 32px; }
.ui-web-menu__body > * { flex: none; }
.ui-web-menu__start { justify-content: center; }
.ui-web-menu__nav { display: grid; padding: 10px 0 14px; }
.ui-web-menu__nav a { padding: 10px 2px; color: var(--ink); font-size: 17px; font-weight: 550; text-decoration: none; }
.ui-web-menu__nav a[aria-current="page"] { color: var(--accent); }

/* Footer: back on the page, under the window */
.ui-web-foot { display: grid; grid-template-columns: 1.4fr repeat(3, 1fr); gap: 32px; max-width: 1280px; margin: 0 auto; padding: 56px 8px 28px; }
@media (max-width: 1303px) { .ui-web-foot { padding: 48px 20px 28px; } }
@media (max-width: 760px) { .ui-web-foot { grid-template-columns: 1fr 1fr; } }
.ui-web-foot__about { display: grid; align-content: start; gap: 14px; color: var(--ink-strong); }
.ui-web-foot__about p { max-width: 16rem; margin: 0; color: var(--muted); font-size: var(--fs-body); line-height: 1.55; }
.ui-web-foot__col { display: grid; align-content: start; gap: 9px; }
.ui-web-foot__title { margin-bottom: 4px; color: var(--muted); font-size: var(--fs-caption); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.ui-web-foot__col a { color: var(--ink); font-size: var(--fs-body); text-decoration: none; }
.ui-web-foot__col a:hover { color: var(--accent); }
.ui-web-foot__base { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 20px; background: var(--ui-web-rule) left top / var(--ui-web-rule-size) repeat-x; color: var(--muted); font-size: 14px; }
.ui-web-foot__base a { color: inherit; text-decoration: none; }
.ui-web-foot__copy { display: inline-flex; align-items: center; gap: 6px; }
/* The maker: a quote at the testimonials' weight, its mark small and quiet, the avatar (online) to its right */
.ui-web-foot__maker { display: inline-flex; align-items: center; gap: 10px; }
/* The avatar (its tokens in styles/arc.css) and its status dot stay circles under the corners' squircle */
.ui-web-foot__maker [role="img"], .ui-web-foot__maker [role="img"] * { corner-shape: round; }
.ui-web-foot__mark { display: inline-block; width: 14px; height: 11px; margin-right: 10px; vertical-align: 0.45em; fill: var(--muted); opacity: 0.35; }
.ui-web-foot__maker q { color: var(--ink); font-size: 15px; font-weight: 550; letter-spacing: -0.01em; quotes: none; text-align: right; text-wrap: balance; }
.ui-web-foot__maker:hover q { color: var(--accent); }
.ui-web-foot__base a:hover { color: var(--ink); }

/* A command: monospace in a box (fluid.css), its copy button at the end */
.ui-web-cmd { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 40px; padding: 0 6px 0 14px; text-align: left; border-radius: var(--box-radius); background: var(--box-surface); box-shadow: var(--box-shadow); }
.ui-web-cmd__label { color: var(--muted); font-size: var(--fs-caption); font-weight: 550; user-select: none; }
.ui-web-cmd__prompt { color: var(--muted); font-family: var(--font-mono); font-size: 13px; user-select: none; }
.ui-web-cmd code { flex: 1; min-width: 0; padding-block: 10px; font-family: var(--font-mono); font-size: 13px; overflow-wrap: anywhere; }
.ui-web-cmd__copy { display: grid; flex: none; place-items: center; user-select: none; width: 28px; height: 28px; border-radius: calc(4px * var(--squircle-factor, 1)); color: var(--muted); }
.ui-web-cmd__copy:hover { background: var(--hover); color: var(--ink); }
.ui-web-cmd--prompt { align-items: start; height: auto; padding: 10px 6px 10px 14px; }
.ui-web-cmd--prompt code { padding-top: 4px; font-family: var(--font); font-size: 13.5px; line-height: 1.5; white-space: normal; text-wrap: pretty; }

/* The app in a window: drawn at 1280×800 and scaled to it (AppPreview), with a window's corners and shadow */
.ui-web-app { margin: 0; }
.ui-web-app__frame { position: relative; overflow: hidden; border-radius: calc(16px * var(--squircle-factor, 1)); background: var(--page); box-shadow: var(--shadow-5), 0 0 0 1px var(--line); }
.ui-web-app__scale { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
/* The app sizes itself to the browser window (100dvh): here it fills the preview instead */
.ui-web-app__scale > * { height: 100% !important; }

/* A page's head, the learner pages' kicker and lead under a larger title */
.ui-web-pagehead { max-width: 40rem; }
.ui-web-pagehead__title { margin: 6px 0 0; font-size: 32px; line-height: 1.15; font-weight: 600; letter-spacing: -0.02em; text-wrap: balance; }
.ui-web-pagehead__lead { margin: 12px 0 0; color: var(--muted); font-size: 15px; line-height: 1.55; text-wrap: pretty; }
`;
