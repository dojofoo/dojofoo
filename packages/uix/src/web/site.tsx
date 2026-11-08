import { NavigationLink } from "../components/navigation-link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Icon } from "../components/icon";
import { Avatar } from "../components/arc/avatar/avatar";
import { BrandLogo } from "../components/brand-logo";
import { ButtonLink } from "../components/button";
import { Cancel01Icon, Copy01Icon, CopyrightIcon, Menu01Icon, Search01Icon, Tick02Icon } from "../lib/icons";
import { SidebarDrawer, SidebarProvider, SidebarTrigger, useSidebar } from "../components/epicat/sidebar";
import { cn } from "../lib/utils";
import makerPhoto from "../assets/tomhaxxx-small.webp?url";
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
    <div data-site-shell="" data-site-section={current} className={cn("relative min-h-dvh bg-(--page) text-(--ink) [font-family:var(--font)] text-[length:var(--fs-body)] [font-variation-settings:'opsz'_14] antialiased [&_svg]:block [&_svg]:shrink-0 [&_:focus-visible]:outline-2 [&_:focus-visible]:outline-(--accent) [&_:focus-visible]:outline-offset-2", subnav && "overflow-x-clip")}>
      {subnav ? <div className="sticky top-0 z-30 before:absolute before:inset-y-0 before:inset-x-[calc(50%_-_50vw)] before:-z-1 before:bg-(--page)/80 before:backdrop-blur-[8px] before:content-['']"><SiteHeader current={current} menu={menu} />{subnav}</div> : <SiteHeader current={current} menu={menu} />}
      <main data-site-main="" className={cn("mx-auto block", full ? "max-w-none" : "max-w-[1280px]", window && "rounded-(--radius-panel) bg-(--panel) shadow-(--shadow-3) [container:ui-web/inline-size] max-[1304px]:mx-3 min-[1304px]:max-w-[1280px]")}>{children}</main>
      {backdrop}
      <SiteFooter current={current} ground={Boolean(backdrop)} />
    </div>
  );
}

export function SiteHeader({ current, as: Component = "header", mobileAction, menu }: { current?: SiteSection; as?: "header" | "div"; mobileAction?: ReactNode; menu?: ReactNode }) {
  const links = useSite();
  // In the docs the search looks in the docs; anywhere else in the courses (the dialog switches either way)
  const scope: SearchScope = current === "help" || current === "docs" ? "docs" : "courses";
  const go = (section: SiteSection) => () => links.navigate(section);
  const getStarted = () => links.openDoc("/docs/quickstart");
  return (
    <Component className="mx-auto grid h-[60px] max-w-[1280px] grid-cols-[1fr_auto_1fr] items-center gap-6 px-2 max-[1304px]:px-5 max-[761px]:grid-cols-[auto_1fr_auto] max-[761px]:gap-x-0" data-site-navigation="">
      <NavigationLink href={links.sectionHref("home")} className="flex items-center justify-self-start text-(--ink-strong)" aria-label="Dojo.foo home" onNavigate={go("home")}><BrandLogo className="aspect-[2567/1211] h-[30px] w-auto" /></NavigationLink>
      {/* The search in the middle, the sections beside the way in */}
      <button type="button" className="inline-flex h-10 w-80 items-center gap-2 rounded-(--box-radius) bg-(--box-surface) pr-3 pl-3.5 text-[length:var(--fs-body)] text-(--muted) shadow-(--box-shadow) hover:text-(--ink) [&>span]:flex-1 [&>span]:text-left [&>kbd]:font-[inherit] [&>kbd]:text-[length:var(--fs-caption)] max-[901px]:w-[200px] max-[761px]:w-10 max-[761px]:justify-self-end max-[761px]:justify-center max-[761px]:rounded-[calc(10px*var(--squircle-factor,1))] max-[761px]:bg-transparent max-[761px]:p-0 max-[761px]:shadow-none max-[761px]:active:bg-(--hover) max-[761px]:[&>span]:hidden max-[761px]:[&>kbd]:hidden" aria-haspopup="dialog" aria-label={scope === "docs" ? "Search docs" : "Search courses"} onClick={() => links.openSearch(scope)}>
        <Icon icon={Search01Icon} size={15} />
        <span>{scope === "docs" ? "Search docs" : "Search courses"}</span>
        <kbd>⌘K</kbd>
      </button>
      <div className="flex items-center justify-self-end gap-2 max-[761px]:-mr-2.5 max-[761px]:gap-0">
        <nav className="flex gap-0.5 max-[761px]:hidden" aria-label="Site">
          {sections.map((section) => (
            <NavigationLink key={section.id} href={links.sectionHref(section.id)} className="rounded-[calc(8px*var(--squircle-factor,1))] px-2.5 py-1.5 text-[length:var(--fs-subtitle)] font-medium text-(--muted) no-underline transition-colors duration-(--motion-fast) ease-(--ease-standard) hover:bg-(--hover) hover:text-(--ink) aria-[current=page]:text-(--ink)" aria-current={current === section.id ? "page" : undefined} onNavigate={go(section.id)}>{section.label}</NavigationLink>
          ))}
        </nav>
        {mobileAction}
        <ButtonLink size="sm" className="max-[761px]:hidden!" href="/docs/quickstart" onNavigate={getStarted}>Get started</ButtonLink>
        {/* On a phone the sections and the way in fold into a menu beside the search (as Fumadocs' docs do) */}
        <SiteMenu>
          <ButtonLink href="/docs/quickstart" className="justify-center" onNavigate={getStarted}>Get started</ButtonLink>
          <nav className="grid pt-2.5 pb-3.5 [&_a]:px-0.5 [&_a]:py-2.5 [&_a]:text-[17px] [&_a]:font-[550] [&_a]:text-(--ink) [&_a]:no-underline [&_a[aria-current=page]]:text-(--accent)" aria-label="Site">
            {sections.map((section) => (
              <NavigationLink key={section.id} href={links.sectionHref(section.id)} aria-current={current === section.id ? "page" : undefined} onNavigate={go(section.id)}>{section.label}</NavigationLink>
            ))}
          </nav>
          {menu}
        </SiteMenu>
      </div>
    </Component>
  );
}

/** The phone's menu: epicat's sidebar drawer (components/epicat), closed by a link in it, beside it, by Escape, and by
    going wide; its close where the burger was */
function SiteMenu({ children }: { children: ReactNode }) {
  return <SidebarProvider query="(width < 761px)"><SiteMenuDrawer>{children}</SiteMenuDrawer></SidebarProvider>;
}

function SiteMenuDrawer({ children }: { children: ReactNode }) {
  const { open, setOpen, mode } = useSidebar();
  // Wider than a phone it has nothing to hold (the header shows it all): it goes
  useEffect(() => { if (mode === "full") setOpen(false); }, [mode, setOpen]);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, setOpen]);
  return (
    <>
      <SidebarTrigger className="hidden! size-10 place-items-center rounded-[calc(10px*var(--squircle-factor,1))] text-(--muted) transition-colors duration-(--motion-fast) ease-(--ease-standard) hover:text-(--ink) active:bg-(--hover) max-[761px]:grid!" aria-label="Menu" aria-expanded={open} aria-controls="nd-sidebar-mobile">
        <Icon icon={Menu01Icon} size={18} />
      </SidebarTrigger>
      <SidebarDrawer data-site-menu="" className="border-(--line) bg-(--page)! shadow-(--shadow-6)" aria-label="Menu" onClick={(event) => { if ((event.target as Element).closest("a")) setOpen(false); }}>
        <SidebarTrigger className="hidden! size-10 place-items-center rounded-[calc(10px*var(--squircle-factor,1))] text-(--muted) transition-colors duration-(--motion-fast) ease-(--ease-standard) hover:text-(--ink) active:bg-(--hover) max-[761px]:grid! absolute top-2.5 right-2.5 grid!" aria-label="Close menu">
          <Icon icon={Cancel01Icon} size={18} />
        </SidebarTrigger>
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain px-5 pt-[60px] pb-8 [&>*]:flex-none">{children}</div>
      </SidebarDrawer>
    </>
  );
}

const footer = [
  { title: "Learn", links: [["Usage", "/docs"], ["Quickstart", "/docs/quickstart"], ["Installation", "/docs/installation"]] },
  { title: "Explore", links: [["Courses", "courses"], ["Authoring", "/authoring"], ["Developers", "/developers"]] },
  { title: "Support", links: [["Help & Support", "/help"], ["Issues", "https://github.com/dojofoo/dojofoo/issues"], ["Roadmap", "https://github.com/dojofoo/dojofoo/blob/main/ROADMAP.md"]] },
] as const;

export function SiteFooter({ current, ground = false }: { current?: SiteSection; ground?: boolean }) {
  const links = useSite();
  // The maker's line for the section: owning up to the docs, daring the course browser
  const line = current === "help" || current === "docs" ? "No idea how that works, ask AI"
    : current === "courses" ? "If you're such a pro, make your own course!"
    : "I made dis";
  return (
    <footer data-site-footer="" className={cn("mx-auto grid max-w-[1280px] grid-cols-[1.4fr_repeat(3,1fr)] gap-8 px-2 pt-14 pb-7 max-[1304px]:px-5 max-[1304px]:pt-12 max-[761px]:grid-cols-2", ground && "relative z-1 pb-[120px]!")}>
      <div className="grid content-start gap-3.5 text-(--ink-strong) [&_p]:m-0 [&_p]:max-w-64 [&_p]:text-[length:var(--fs-body)] [&_p]:leading-[1.55] [&_p]:text-(--muted)">
        <BrandLogo className="aspect-[2567/1211] h-6 w-auto" />
        <p>Deliberate practice, guided by the coding agent you already use.</p>
      </div>
      {(links.footerLinks ?? footer).map((column) => (
        <nav key={column.title} className="grid content-start gap-[9px] [&_a]:text-[length:var(--fs-body)] [&_a]:text-(--ink) [&_a]:no-underline [&_a:hover]:text-(--accent)" aria-label={column.title}>
          <span className="mb-1 text-[length:var(--fs-caption)] font-semibold tracking-[0.05em] text-(--muted) uppercase">{column.title}</span>
          {column.links.map(([label, to]) => to.startsWith("http")
            ? <NavigationLink key={label} href={to} target="_blank" rel="noreferrer">{label}</NavigationLink>
            : <NavigationLink key={label} href={to.startsWith("/") ? to : links.sectionHref(to as SiteSection)} onNavigate={() => { if (to.startsWith("/")) links.openDoc(to); else links.navigate(to as SiteSection); }}>{label}</NavigationLink>)}
        </nav>
      ))}
      <div className="col-span-full flex items-center justify-between gap-4 pt-5 text-sm text-(--muted) [background:var(--ui-web-rule)_left_top/var(--ui-web-rule-size)_repeat-x] [&_a]:text-inherit [&_a]:no-underline [&_a:hover]:text-(--ink)">
        <span className="inline-flex items-center gap-1.5"><Icon icon={CopyrightIcon} size={15} /><span className="sr-only">Copyright</span>Dojo.foo{links.footerControls && <span className="ml-2">{links.footerControls}</span>}</span>
        {/* The maker's line as a small quote (the testimonials' mark), his avatar after it, online */}
        <NavigationLink className="inline-flex items-center gap-2.5 [&_[role=img]]:[corner-shape:round] [&_[role=img]_*]:[corner-shape:round] [&_q]:text-right [&_q]:text-[15px] [&_q]:font-[550] [&_q]:tracking-[-0.01em] [&_q]:text-balance [&_q]:text-(--ink) [&_q]:[quotes:none] hover:[&_q]:text-(--accent)" href="https://x.com/tomhaxxx" target="_blank" rel="noreferrer" aria-label={`${line} – Tom Siwik on X`}>
          {/* The mark inside the quote, so it opens its first line however the line wraps */}
          <q><svg aria-hidden="true" viewBox="0 0 32 24" className="inline-block h-[11px] w-3.5 mr-2.5 align-[0.45em] fill-(--muted) opacity-35">
            <path d="M0 24V14.4C0 6.6 4.2 1.8 12.4 0l1.4 3.4C9.4 4.8 7.3 7.6 7 11.2h6.2V24H0Zm18.2 0V14.4C18.2 6.6 22.4 1.8 30.6 0L32 3.4c-4.4 1.4-6.5 4.2-6.8 7.8h6.2V24H18.2Z" />
          </svg>{line}</q>
          <Avatar name="Tom Siwik" src={makerPhoto} size="md" status="online" />
        </NavigationLink>
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
    <div data-command="" className={cn("flex min-h-10 min-w-0 items-center gap-2 rounded-(--box-radius) bg-(--box-surface) pr-1.5 pl-3.5 text-left shadow-(--box-shadow)", prompt && "h-auto items-start py-2.5", className)}>
      {label && <span className="text-[length:var(--fs-caption)] font-[550] text-(--muted) select-none">{label}</span>}
      {/* The prompt, out of the selection: selecting the line takes only the command */}
      {!prompt && <span className="font-mono text-[13px] text-(--muted) select-none" aria-hidden="true">$</span>}
      <code className={cn("min-w-0 flex-1 py-2.5 font-mono text-[13px] wrap-anywhere", prompt && "pt-1 [font-family:var(--font)] text-[13.5px] leading-normal whitespace-normal")}>{command}</code>
      <button type="button" className="grid size-7 flex-none place-items-center rounded-[calc(4px*var(--squircle-factor,1))] text-(--muted) select-none hover:bg-(--hover) hover:text-(--ink)" aria-label={copied ? "Copied" : prompt ? "Copy prompt" : `Copy ${command}`} onClick={copy}>
        <Icon icon={copied ? Tick02Icon : Copy01Icon} size={14} />
      </button>
    </div>
  );
}

/** A page's head, as the learner pages set theirs: kicker, title, lead */
export function PageHead({ kicker, title, lead, children }: { kicker?: string; title: ReactNode; lead?: ReactNode; children?: ReactNode }) {
  return (
    <header className="max-w-[40rem]">
      {kicker && <p className="text-[12.5px] leading-4 font-medium text-(--muted)">{kicker}</p>}
      <h1 className="mt-1.5 mb-0 text-[32px] leading-[1.15] font-semibold tracking-[-0.02em] text-balance">{title}</h1>
      {lead && <p className="mt-3 mb-0 text-[15px] leading-[1.55] text-pretty text-(--muted)">{lead}</p>}
      {children}
    </header>
  );
}
