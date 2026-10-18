import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode, type CSSProperties } from "react";
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Tooltip } from "radix-ui";
import { spring } from "~/lib/springs";
import type { IconGlyph } from "~/lib/icons";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  ArrowUpDownIcon,
  Cancel01Icon,
  DashboardSquare02Icon,
  File02Icon,
  FilterIcon,
  Folder01Icon,
  FolderOpenIcon,
  GridViewIcon,
  LeftToRightListBulletIcon,
  PencilEdit02Icon,
  Search01Icon,
  SidebarLeftIcon,
  Tick02Icon,
  PlusSignIcon,
  UserIcon,
  SettingsFillIcon,
  HelpCircleIcon,
  Logout01Icon,
  Megaphone01Icon,
  DoneIcon,
  LockedIcon,
} from "~/lib/icons";
import { FilterMenu, type FilterGroup, type FilterValue } from "~/components/filter-menu";
import { SetupGuide, type SetupGroup } from "~/components/setup-guide";

/*
 * App Shell – the frame every affectUI screen sits in, in a single file.
 * A sidebar on a gray page (workspace, menu, projects, what's new, onboarding progress, user) and the main
 * area as a rounded white panel. The sidebar collapses completely; its icon then waits in the top left corner.
 * Also exports the small parts the screens share: icon, tabs, search, toolbar tools, section heads,
 * empty state and file cards. Icons: Hugeicons free set (stroke, rounded).
 */

/** Hugeicons, stroke + rounded with a slightly heavier stroke */
/** A glyph from ~/lib/icons, drawn in the icon set that's switched on; without a stroke, the set's own */
export const Icon = ({ icon: Glyph, size = 16, stroke, color = "currentColor" }: { icon: IconGlyph; size?: number; stroke?: number; color?: string }) => (
  <Glyph size={size} stroke={stroke} color={color} />
);

export type ShellNavItem = { label: string; icon: IconGlyph; /** Small number at the end, e.g. unread items */ count?: number };
/** A labelled list under the menu – replaces Projects when given */
export type ShellGroup = { label: string; items: ShellNavItem[]; /** Text shown while the list is empty */ empty?: string };
/** A row in the sidebar; with children it is a group that folds open */
export type ShellEntry = {
  id: string;
  label: string;
  icon?: IconGlyph;
  /** Short text in the icon's place, e.g. a lesson's number */
  marker?: string;
  count?: number;
  /** Progress, shown at the row's end: done (a check in the brand's color), active (in progress, a ring) or locked
      (a locked folder – the row can't be opened) */
  state?: "done" | "active" | "locked";
  /** Says why, in the row's tooltip and to screen readers – e.g. what unlocks it */
  note?: string;
  children?: ShellEntry[];
};
/** A block of rows, with an optional heading. Rows in one `layout` share a highlight that glides between them, so two
    sections with layouts of their own each keep one lit – a chapter and its lesson, say */
export type ShellSection = { id: string; heading?: string; items: ShellEntry[]; layout?: string; empty?: string; /** Above the heading, e.g. the course card above its chapters */ before?: ReactNode };

export const defaultNav: ShellNavItem[] = [
  { label: "New chat", icon: PencilEdit02Icon },
  { label: "Folders", icon: Folder01Icon },
  { label: "Integrations", icon: DashboardSquare02Icon },
];

export const defaultProjects = ["Q3 Campaign", "Brand assets", "Hiring", "Research"];

/** Onboarding behind "Getting started" – shown in the library's Setup Guide */
export const defaultSetup: SetupGroup[] = [
  {
    id: "workspace",
    title: "Set up your workspace",
    tasks: [
      { id: "name", label: "Name your workspace", done: true },
      { id: "invite", label: "Invite your teammates" },
      { id: "connect", label: "Connect your first app" },
    ],
  },
  {
    id: "work",
    title: "Start working",
    tasks: [
      { id: "folder", label: "Create a folder" },
      { id: "chat", label: "Start your first chat" },
      { id: "upload", label: "Upload a file" },
    ],
  },
  {
    id: "profile",
    title: "Make it yours",
    tasks: [
      { id: "avatar", label: "Add a profile picture" },
      { id: "notify", label: "Choose your notifications" },
    ],
  },
];

/** Up to this width (of the app itself, not the window) the sidebar becomes a drawer */
const NARROW = 900;

const cheer = (pct: number) => (pct >= 100 ? "All done!" : pct >= 60 ? "Almost there!" : pct > 0 ? "Great start!" : "Let's go!");

export type AppShellProps = {
  children: ReactNode;
  /** Label of the menu item or project that is open */
  active?: string | string[];
  /** Called with the label of a menu item or project when it is clicked */
  onNavigate?: (label: string) => void;
  workspace?: string;
  user?: { name: string; avatar?: string };
  nav?: ShellNavItem[];
  projects?: string[];
  /** Lists under the menu instead of Projects, e.g. Tools or Pipelines */
  groups?: ShellGroup[];
  /** Tasks behind "Getting started" */
  setup?: SetupGroup[];
  /** Getting started stays open – no summary, no closing – and follows the tasks as they're done (e.g. during the app's
      own setup) */
  setupPinned?: boolean;
  /** The account menu at the sidebar's foot – none yet before onboarding */
  showUser?: boolean;
  /** Names the menu that's showing (e.g. "dashboard", a course's id); when it changes, the old rows swipe out to the right
      and the new ones in from the left */
  navigationKey?: string;
  /** Project-specific navigation below the main menu. */
  sidebar?: ReactNode;
  showFooter?: boolean;
  showOnboarding?: boolean;
  brand?: ReactNode;
  sidebarWidth?: string;
  /** The sidebar's search button, e.g. to open a command menu */
  onSearch?: () => void;
  /** The sidebar's rows by section – replaces nav, groups and projects. Rows report their id to onNavigate */
  navigation?: ShellSection[];
  /** The "New in …" cards above Getting started */
  showNews?: boolean;
  /** A column right of the main panel, on the page surface instead of inside the panel */
  aside?: ReactNode;
  /** Track sizes of the main panel and the aside, e.g. "1.618fr 1fr" */
  asideColumns?: string;
  /** The main panel widens over the aside, e.g. while a settings panel is open in it */
  asideCovered?: boolean;
  /** Narrow only: the aside is in view – it slides in from the right and pushes the main panel left */
  asideOpen?: boolean;
  /** Narrow only: asks to put the aside away, e.g. after a tap on the panel it pushed aside */
  onAsideOpenChange?: (open: boolean) => void;
  /** Narrow only: a drawer from the right, the sidebar's mirror – e.g. settings that sit in the panel when it's wide.
      Screens read `useShellNarrow()` to show the wide version in its place */
  drawer?: ReactNode;
  drawerOpen?: boolean;
  onDrawerOpenChange?: (open: boolean) => void;
  className?: string;
};

/** In the rail every row is an icon, so it names itself in a tooltip; open, the label does that */
function RailTip({ enabled, label, note, children }: { enabled: boolean; label: string; note?: string; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  // Opening the sidebar while a tip shows must not leave it armed for the next collapse
  if (!enabled && open) setOpen(false);
  return (
    <Tooltip.Root open={enabled && open} onOpenChange={(next) => setOpen(next && enabled)}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="ui-as-tip" side="right" sideOffset={14} collisionPadding={8}>
          {label}
          {note && <span className="ui-as-tip__note">{note}</span>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

type ShellRowProps = {
  entry: ShellEntry;
  nested?: boolean;
  current: boolean;
  lit: boolean;
  layoutId: string;
  rail: boolean;
  reduce: boolean;
  expanded?: boolean;
  turned?: boolean;
  controls?: string;
  onClick: () => void;
};

/** One sidebar row: icon, label, count (a dot in the rail), a chevron for groups, and the highlight when it is lit */
const stateText = { done: "done", active: "in progress", locked: "locked" } as const;

function ShellRow({ entry, nested, current, lit, layoutId, rail, reduce, expanded, turned, controls, onClick }: ShellRowProps) {
  const locked = entry.state === "locked";
  return (
    <RailTip enabled={rail || !!entry.note} label={rail ? entry.label : entry.note ?? entry.label} note={rail ? (entry.note ?? (entry.count ? String(entry.count) : undefined)) : undefined}>
      <button
        type="button"
        className="ui-as-side__item"
        data-nested={nested || undefined}
        data-lit={lit || undefined}
        data-state={entry.state}
        aria-current={current ? "page" : undefined}
        aria-expanded={expanded}
        aria-controls={controls}
        aria-disabled={locked || undefined}
        onClick={locked ? undefined : onClick}
      >
        {lit && <motion.span layoutId={layoutId} className="ui-as-side__lit" transition={reduce ? { duration: 0 } : spring.moderate} />}
        {entry.marker ? <span className="ui-as-side__marker" aria-hidden="true">{entry.marker}</span> : entry.icon ? <Icon icon={entry.icon} size={16} /> : null}
        <span className="ui-as-side__text">{entry.label}</span>
        {entry.count !== undefined && (
          <>
            <span className="ui-as-side__count">{entry.count}</span>
            <span className="ui-as-side__dot" aria-hidden="true" />
          </>
        )}
        {turned !== undefined && (
          <span className="ui-as-side__chevron" data-turned={turned || undefined} aria-hidden="true">
            <Icon icon={ArrowRight01Icon} size={14} />
          </span>
        )}
        {entry.state && (
          <span className="ui-as-side__state" data-state={entry.state}>
            {entry.state === "done" ? <Icon icon={DoneIcon} size={14} /> : entry.state === "locked" ? <Icon icon={LockedIcon} size={14} /> : <i />}
            <span className="sr-only">({stateText[entry.state]}{entry.note ? ` – ${entry.note}` : ""})</span>
          </span>
        )}
      </button>
    </RailTip>
  );
}

const ShellNarrow = createContext(false);
/** Whether the shell is in its narrow layout (tablet, phone) – for content that moves between the panel and a drawer */
export const useShellNarrow = () => useContext(ShellNarrow);

export function AppShell({
  children,
  active,
  onNavigate,
  workspace = "Acme",
  user = { name: "Alex Morgan" },
  nav = defaultNav,
  projects = defaultProjects,
  groups,
  setup = defaultSetup,
  setupPinned = false,
  sidebar,
  showFooter = true,
  showOnboarding = true,
  showUser = true,
  navigationKey = "menu",
  brand,
  sidebarWidth = "220px",
  onSearch,
  navigation,
  showNews = true,
  aside,
  asideColumns = "minmax(0, 1fr) minmax(20rem, 26rem)",
  asideCovered = false,
  asideOpen = false,
  onAsideOpenChange,
  drawer: endDrawer,
  drawerOpen: endDrawerOpen = false,
  onDrawerOpenChange,
  className,
}: AppShellProps) {
  const [news, setNews] = useState(2);
  const [collapsed, setCollapsed] = useState(false);
  // Narrow (tablet, phone): the sidebar waits off screen and slides in as a drawer over the main area
  const root = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const endOpen = Boolean(endDrawer) && endDrawerOpen;
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    // Same width as the @container ui-as (max-width: 900px) rules below – measured in layout pixels, so a scaled preview stays wide
    const measure = () => setNarrow(el.offsetWidth <= NARROW);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    if (!narrow) setDrawer(false);
  }, [narrow]);
  // Wide, collapsing leaves the icon rail; narrow, the sidebar is a drawer that is either open or away
  const rail = collapsed && !narrow;
  const sideHidden = narrow ? !drawer : false;
  const reduce = !!useReducedMotion();
  const baseId = useId();
  const actives = Array.isArray(active) ? active : active ? [active] : [];
  // Old screens pass nav, groups and projects; they render as sections like any other
  const sections: ShellSection[] = navigation ?? [
    { id: "main", items: nav.map((item) => ({ id: item.label, label: item.label, icon: item.icon, count: item.count })) },
    ...(sidebar ? [] : groups
      ? groups.map((group) => ({ id: group.label, heading: group.label, empty: group.empty, items: group.items.map((item) => ({ id: item.label, label: item.label, icon: item.icon, count: item.count })) }))
      : [{ id: "projects", heading: "Projects", items: projects.map((name) => ({ id: name, label: name, icon: FolderOpenIcon })) }]),
  ];
  // Groups holding the current row start open
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => Object.fromEntries(
    sections.flatMap((section) => section.items).filter((entry) => entry.children?.some((child) => actives.includes(child.id))).map((entry) => [entry.id, true]),
  ));
  const toggleGroup = (id: string) => {
    // The rail has no room to open a group, so the sidebar widens to show it
    if (rail) {
      setCollapsed(false);
      setOpenGroups((current) => ({ ...current, [id]: true }));
      return;
    }
    setOpenGroups((current) => ({ ...current, [id]: !current[id] }));
  };
  // [ folds the sidebar to the rail and back – outside text fields, like the rail's own button
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "[" || event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.closest(".monaco-editor"))) return;
      event.preventDefault();
      if (narrow) setDrawer((open) => !open);
      else setCollapsed((value) => !value);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [narrow]);
  const go = (label: string) => {
    setDrawer(false);
    onNavigate?.(label);
  };
  // closed → open → closing → closed: while closing the guide stays, fades and the card shrinks, then the summary returns
  const [guide, setGuide] = useState<"closed" | "open" | "closing">("closed");
  const guideOpen = guide === "open";
  const setGuideOpen = (open: boolean) => {
    if (open) return setGuide("open");
    setGuide((g) => (g === "open" ? "closing" : g));
  };
  useEffect(() => {
    if (guide !== "closing") return;
    const t = window.setTimeout(() => setGuide("closed"), 420);
    return () => window.clearTimeout(t);
  }, [guide]);
  const guideInner = useRef<HTMLDivElement>(null);
  const [guideHeight, setGuideHeight] = useState(0);
  const [closedHeight, setClosedHeight] = useState(0);
  // Read the content's height right when the state changes (not a frame later), so no step ever uses an old height;
  // the closed card's height is kept for the slot and for shrinking back
  useLayoutEffect(() => {
    const el = guideInner.current;
    if (!el) return;
    setGuideHeight(el.offsetHeight);
    if (guide === "closed") setClosedHeight(el.offsetHeight);
  }, [guide]);

  // The card's height follows its content, so opening, closing and folding groups all glide
  useLayoutEffect(() => {
    const el = guideInner.current;
    if (!el) return;
    const measure = () => setGuideHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!guideOpen || setupPinned) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setGuideOpen(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [guideOpen, setupPinned]);
  // Escape closes the drawer – unless the setup guide is open, then it closes the guide first
  useEffect(() => {
    if (!drawer || guide !== "closed") return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [drawer, guide]);
  const [done, setDone] = useState(() => setup.flatMap((g) => g.tasks.filter((t) => t.done).map((t) => t.id)));
  // Tasks the app marks done later (onboarding finished, a course installed) join the ones ticked here
  const setupDone = setup.flatMap((g) => g.tasks.filter((t) => t.done).map((t) => t.id)).join(",");
  useEffect(() => {
    if (setupDone) setDone((current) => [...new Set([...current, ...setupDone.split(",")])]);
  }, [setupDone]);
  const total = setup.reduce((n, g) => n + g.tasks.length, 0);
  const pct = total ? Math.round((done.length / total) * 100) : 0;
  const initials = user.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  // Getting started's summary, folded
  const guideSummary = <>
    <span className="ui-as-steps__title">
      Getting started
      <Icon icon={ArrowRight01Icon} size={13} />
    </span>
    <span className="ui-as-steps__sub">
      {pct}% done · <span className="ui-as-steps__cheer">{cheer(pct)}</span>
    </span>
    <span className="ui-as-steps__bar">
      <i style={{ width: `${Math.max(pct, 4)}%` }} />
    </span>
  </>;

  return (
    <Tooltip.Provider delayDuration={250} skipDelayDuration={300}>
    <div
      ref={root}
      className={["ui-as", "ui-as-app", className].filter(Boolean).join(" ")}
      style={{ "--ui-as-sidebar-width": sidebarWidth, "--ui-as-aside-columns": asideColumns } as CSSProperties}
      data-aside={aside ? "" : undefined}
      // Narrow, the aside is a sheet beside the panel rather than a column, so nothing covers it
      data-aside-covered={aside && asideCovered && !narrow ? "" : undefined}
      data-aside-open={aside && narrow && asideOpen ? "" : undefined}
      data-narrow={narrow || undefined}
      data-collapsed={rail || undefined}
      data-drawer={(narrow && drawer) || undefined}
      data-end-drawer={(narrow && endOpen) || undefined}
    >
      <style href="ui-app-shell" precedence="default">
        {css}
      </style>
      {/* With the sidebar hidden, the same icon sits in the top left corner of the main area to bring it back */}
      <button
        className="ui-as-icon-btn ui-as-side-open"
        type="button"
        aria-label="Open sidebar"
        tabIndex={sideHidden ? 0 : -1}
        onClick={() => (narrow ? setDrawer(true) : setCollapsed(false))}
      >
        <Icon icon={SidebarLeftIcon} size={16} />
      </button>
      {/* Narrow only: dims the main area behind the open drawer; a tap closes it */}
      <div className="ui-as-scrim" aria-hidden="true" onClick={() => { setDrawer(false); onDrawerOpenChange?.(false); }} />
      <aside className="ui-as-side" inert={sideHidden}>
        <header className="ui-as-side__head">
          <span className="ui-as-side__brand" data-logo={brand ? "" : undefined}>{brand ?? <Dropdown
            title="Workspaces"
            items={[
              { label: workspace, description: "Pro · 8 members", checked: true },
              { label: "Personal", description: "Free", checked: false },
              { label: "Create workspace", icon: PlusSignIcon },
            ]}
            trigger={({ open, toggle }) => (
              <button className="ui-as-side__workspace" type="button" aria-expanded={open} onClick={toggle}>
                <span className="ui-as-side__logo">{workspace[0]}</span>
                {workspace}
                <Icon icon={ArrowDown01Icon} size={13} />
              </button>
            )}
          />}</span>
          <span className="ui-as-side__tools">
            <button className="ui-as-icon-btn ui-as-side__search" type="button" aria-label="Search" aria-keyshortcuts="Alt+K" tabIndex={rail ? -1 : 0} onClick={onSearch}>
              <Icon icon={Search01Icon} size={16} />
            </button>
            <button
              className="ui-as-icon-btn ui-as-side__toggle"
              type="button"
              aria-label={narrow ? "Close sidebar" : rail ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={narrow ? undefined : !rail}
              aria-keyshortcuts="["
              onClick={() => (narrow ? setDrawer(false) : setCollapsed((value) => !value))}
            >
              <Icon icon={SidebarLeftIcon} size={16} />
            </button>
          </span>
        </header>

        <LayoutGroup id={baseId}>
        <nav className="ui-as-side__nav scroll-fade" aria-label="Main menu">
          {/* Screens that name their menu also swipe it in when they open – entering a course is a screen of its own */}
          <AnimatePresence mode="wait" initial={navigationKey !== "menu"}>
          <motion.div key={navigationKey} className="ui-as-side__menu"
            initial={reduce ? false : { x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={reduce ? undefined : { x: 24, opacity: 0 }}
            transition={reduce ? { duration: 0 } : spring.moderate}>
          {sections.map((section, index) => {
            const headingId = `${baseId}-${section.id}`;
            const layoutId = `${baseId}-${section.layout ?? "nav"}-lit`;
            const shared = { layoutId, rail, reduce };
            return (
              <div key={section.id} className="ui-as-side__group" role={section.heading ? "group" : undefined} aria-labelledby={section.heading ? headingId : undefined}>
                {section.before && <div className="ui-as-side__before">{section.before}</div>}
                {section.heading && (
                  <span className="ui-as-side__label">
                    <span id={headingId} className="ui-as-side__label-text">{section.heading}</span>
                  </span>
                )}
                {section.items.length === 0 && section.empty && <span className="ui-as-side__empty">{section.empty}</span>}
                {section.items.map((entry) => {
                  if (!entry.children) {
                    const on = actives.includes(entry.id);
                    return <ShellRow key={entry.id} entry={entry} current={on} lit={on} onClick={() => go(entry.id)} {...shared} />;
                  }
                  const listId = `${baseId}-${entry.id}-list`;
                  const shown = !!openGroups[entry.id] && !rail;
                  const holdsActive = entry.children.some((child) => actives.includes(child.id));
                  return (
                    <div key={entry.id} className="ui-as-side__branch">
                      <ShellRow entry={entry} current={false} lit={holdsActive && !shown} expanded={shown} turned={!!openGroups[entry.id]} controls={listId} onClick={() => toggleGroup(entry.id)} {...shared} />
                      <div id={listId} className="ui-as-side__children" data-open={shown || undefined} inert={!shown}>
                        <div>
                          {entry.children.map((child) => {
                            const on = actives.includes(child.id);
                            return <ShellRow key={child.id} entry={child} nested current={on} lit={shown && on} onClick={() => go(child.id)} {...shared} />;
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {/* A screen's own sidebar content follows the main menu; the rail has no room for it */}
                {index === 0 && sidebar && !navigation && <div className="ui-as-side__custom">{sidebar}</div>}
              </div>
            );
          })}
          </motion.div>
          </AnimatePresence>
        </nav>
        </LayoutGroup>

        {showFooter && <div className="ui-as-side__foot">
          {showOnboarding && showNews && news > 0 && (
            <div className="ui-as-news" data-count={news}>
              <div className="ui-as-news__card ui-as-news__card--back" aria-hidden="true">
                <span className="ui-as-news__kicker">New in {workspace}</span>
                <Icon icon={Cancel01Icon} size={13} />
              </div>
              <div className="ui-as-news__card">
                <div className="ui-as-news__top">
                  <span className="ui-as-news__kicker">New in {workspace}</span>
                  <button type="button" className="ui-as-news__close" aria-label="Dismiss" onClick={() => setNews((n) => n - 1)}>
                    <Icon icon={Cancel01Icon} size={13} />
                  </button>
                </div>
                <b className="ui-as-news__title">{news > 1 ? "Shared folders" : "Scheduled chats"}</b>
                <button type="button" className="ui-as-news__more">
                  Full changelog
                  <Icon icon={ArrowRight01Icon} size={13} />
                </button>
              </div>
            </div>
          )}

          {/* The card itself grows upward into the full setup guide – one block that morphs, no second panel */}
          {/* The slot keeps the closed card's height in the sidebar; the open card grows over the cards above it */}
          {/* Pinned, the full guide sits in the sidebar's flow, open, following the tasks as they're done */}
          {showOnboarding && setupPinned && (
            <div className="ui-as-guide ui-as-guide--pinned" data-open>
              <div className="ui-as-guide__inner">
                <SetupGuide pinned title="Getting started" groups={setup.map((g) => ({ ...g, tasks: g.tasks.map((t) => ({ ...t, done: done.includes(t.id) })) }))} onChange={setDone} />
              </div>
            </div>
          )}
          {showOnboarding && !setupPinned && <div className="ui-as-guide-slot" style={closedHeight ? { height: closedHeight } : undefined}>
          <div
            className="ui-as-guide"
            data-open={guide !== "closed" || undefined}
            data-state={guide}
            style={{ height: (guide === "open" ? guideHeight : closedHeight) || undefined }}
          >
            <div ref={guideInner} className="ui-as-guide__inner">
              {guide !== "closed" ? (
                <div className="ui-as-guide__content" key="guide">
                  <SetupGuide
                    title="Getting started"
                    groups={setup.map((g) => ({ ...g, tasks: g.tasks.map((t) => ({ ...t, done: done.includes(t.id) })) }))}
                    onChange={setDone}
                    onClose={() => setGuideOpen(false)}
                  />
                </div>
              ) : (
                <button type="button" className="ui-as-steps ui-as-guide__content" key="summary" aria-expanded={false} onClick={() => setGuideOpen(true)}>
                  {guideSummary}
                </button>
              )}
            </div>
          </div>
          </div>}

          {showUser && <Dropdown
            side="top"
            className="ui-as-user-menu"
            items={[
              { label: "Profile", icon: UserIcon },
              { label: "Settings", icon: SettingsFillIcon },
              // What changed lately – reported to onNavigate as "changelog"
              { label: "Changelog", icon: Megaphone01Icon, onSelect: () => go("changelog") },
              { label: "Help & feedback", icon: HelpCircleIcon },
              { label: "Log out", icon: Logout01Icon, danger: true },
            ]}
            trigger={({ open, toggle }) => (
              <RailTip enabled={rail} label={user.name}>
                <button type="button" className="ui-as-user" aria-label={user.name} aria-expanded={open} onClick={toggle}>
                  {user.avatar ? <img src={user.avatar} alt="" width={20} height={20} /> : <span className="ui-as-user__initials">{initials}</span>}
                  <span className="ui-as-user__name">{user.name}</span>
                  <Icon icon={ArrowDown01Icon} size={13} />
                </button>
              </RailTip>
            )}
          />}
        </div>}
      </aside>
      <main className="ui-as-main" inert={Boolean(aside) && narrow && asideOpen}><ShellNarrow.Provider value={narrow}>{children}</ShellNarrow.Provider></main>
      {narrow && endDrawer && <div className="ui-as-end" inert={!endOpen}>{endDrawer}</div>}
      {/* Narrow only: over the panel the aside pushed aside, clear – a tap brings it back */}
      {aside && <div className="ui-as-aside-scrim" aria-hidden="true" onClick={() => onAsideOpenChange?.(false)} />}
      {/* A plain column: the content brings its own labeled region, so the page keeps one complementary landmark */}
      {aside && <div className="ui-as-aside" inert={narrow && !asideOpen}>{aside}</div>}
      {/* Over everything, clicks passing through: light from the stage, e.g. a video's ambient glow. The video keeps
          a hole in it and stays on top; the sidebar, window, settings and conversation lie under it */}
      <div className="ui-as-light" data-glow-layer="" aria-hidden="true" />
    </div>
    </Tooltip.Provider>
  );
}

/* ---------- Shared parts ---------- */


/** Value that works controlled (value + onChange) or on its own (defaultValue) */
function useControlled<T>(value: T | undefined, fallback: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const [inner, setInner] = useState(fallback);
  return [value ?? inner, (v: T) => (setInner(v), onChange?.(v))];
}

/** Segmented tabs: a soft gray pill slides to the active tab */
export function Tabs({
  items,
  value,
  defaultValue,
  onChange,
}: {
  items: string[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
}) {
  const [current, setCurrent] = useControlled(value, defaultValue ?? items[0], onChange);
  const list = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; w: number } | null>(null);

  // The pill follows the active tab; measured from the layout, so it is right at any size
  useLayoutEffect(() => {
    const tab = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (tab) setPill({ x: tab.offsetLeft, w: tab.offsetWidth });
  }, [current, items.join("|")]);

  return (
    <div ref={list} className="ui-as-tabs" role="tablist">
      {pill && <span className="ui-as-tabs__pill" style={{ transform: `translateX(${pill.x}px)`, width: pill.w }} aria-hidden="true" />}
      {items.map((item) => (
        <button key={item} type="button" role="tab" aria-selected={current === item} className="ui-as-tabs__tab" onClick={() => setCurrent(item)}>
          {item}
        </button>
      ))}
    </div>
  );
}

export function IconButton({ icon, label, onClick, pressed }: { icon: IconGlyph; label: string; onClick?: () => void; pressed?: boolean }) {
  return (
    <button type="button" className="ui-as-tool" aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      <Icon icon={icon} size={15} />
    </button>
  );
}

export type SortDir = "asc" | "desc";

/** Flips between A–Z and Z–A; the icon turns with it */
export function SortButton({ value, onChange }: { value?: SortDir; onChange?: (dir: SortDir) => void }) {
  const [dir, setDir] = useControlled<SortDir>(value, "asc", onChange);
  return (
    <button
      type="button"
      className="ui-as-tool ui-as-sort"
      data-dir={dir}
      aria-label={dir === "asc" ? "Sorted A to Z – sort Z to A" : "Sorted Z to A – sort A to Z"}
      title={dir === "asc" ? "A–Z" : "Z–A"}
      onClick={() => setDir(dir === "asc" ? "desc" : "asc")}
    >
      <Icon icon={ArrowUpDownIcon} size={15} />
    </button>
  );
}

export type ViewMode = "grid" | "list";

export function ViewToggle({ value, onChange }: { value?: ViewMode; onChange?: (view: ViewMode) => void }) {
  const [view, setView] = useControlled<ViewMode>(value, "grid", onChange);
  return (
    <div className="ui-as-view" role="radiogroup" aria-label="View" data-view={view}>
      <span className="ui-as-view__pill" aria-hidden="true" />
      {(
        [
          ["grid", GridViewIcon, "Grid"],
          ["list", LeftToRightListBulletIcon, "List"],
        ] as const
      ).map(([id, icon, label]) => (
        <button key={id} type="button" role="radio" aria-checked={view === id} aria-label={label} className="ui-as-view__btn" onClick={() => setView(id)}>
          <Icon icon={icon} size={15} />
        </button>
      ))}
    </div>
  );
}

export function SearchField({
  placeholder,
  width = 175,
  value,
  onChange,
}: {
  placeholder: string;
  width?: number;
  value?: string;
  onChange?: (value: string) => void;
}) {
  const [text, setText] = useControlled(value, "", onChange);
  return (
    <label className="ui-as-search" style={{ width }}>
      <Icon icon={Search01Icon} size={15} />
      <input type="search" placeholder={placeholder} aria-label={placeholder} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Escape" && setText("")} />
      {text && (
        <button type="button" className="ui-as-search__clear" aria-label="Clear search" onClick={() => setText("")}>
          <Icon icon={Cancel01Icon} size={12} />
        </button>
      )}
    </label>
  );
}

/** The nearest ancestor that cuts off what sticks out (a scroll area), or the screen itself */
function clipBox(el: HTMLElement) {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll|hidden|clip)/.test(style.overflow + style.overflowY + style.overflowX) || node.classList.contains("ui-as")) return node.getBoundingClientRect();
  }
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

/**
 * Small floating panel attached to its trigger. Opens on the preferred side and flips to the other side
 * (or edge) when it would stick out of the screen or its scroll area – it is always fully reachable.
 * Closes on a click outside or Escape; fades and scales in from the side it is attached to.
 */
export function Popover({
  open,
  onClose,
  children,
  align = "start",
  side = "bottom",
  className,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "start" | "end";
  side?: "bottom" | "top" | "right";
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState({ side, align });

  // Measure before paint: flip up when there is no room below, flip sideways at the right or left edge
  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    let next = { side, align };
    el.dataset.side = side;
    el.dataset.align = align;
    const box = clipBox(el);
    const r = el.getBoundingClientRect();
    if (side === "bottom" && r.bottom > box.bottom - 6) next = { ...next, side: "top" };
    if (side === "top" && r.top < box.top + 6) next = { ...next, side: "bottom" };
    if (align === "start" && r.right > box.right - 6) next = { ...next, align: "end" };
    if (align === "end" && r.left < box.left + 6) next = { ...next, align: "start" };
    // Still sticking out on a narrow screen (neither edge fits): slide it sideways until it is inside
    el.dataset.side = next.side;
    el.dataset.align = next.align;
    el.style.translate = "";
    const r2 = el.getBoundingClientRect();
    const scale = r2.width / el.offsetWidth || 1;
    let dx = 0;
    if (r2.right > box.right - 6) dx = box.right - 6 - r2.right;
    if (r2.left + dx < box.left + 6) dx = box.left + 6 - r2.left;
    if (dx) el.style.translate = `${dx / scale}px 0`;
    setPlace(next);
  }, [open, side, align]);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const anchor = ref.current?.parentElement;
      if (anchor && !anchor.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={["ui-as-popover", className].filter(Boolean).join(" ")} data-align={place.align} data-side={place.side} role="dialog">
      {children}
    </div>
  );
}

export type MenuItem = {
  label: string;
  /** Second line in a lighter color */
  description?: string;
  icon?: IconGlyph;
  /** Shows a check – for choices like a model or a period */
  checked?: boolean;
  /** Red text, e.g. Delete */
  danger?: boolean;
  onSelect?: () => void;
};

/** List of actions or choices inside a popover */
export function MenuList({ items, onPick }: { items: MenuItem[]; onPick: () => void }) {
  return (
    <div role="menu" className="ui-as-menu__list">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role={item.checked === undefined ? "menuitem" : "menuitemradio"}
          aria-checked={item.checked}
          className="ui-as-menu__item"
          data-danger={item.danger || undefined}
          data-rich={item.description ? true : undefined}
          onClick={() => {
            item.onSelect?.();
            onPick();
          }}
        >
          {item.icon && <Icon icon={item.icon} size={15} />}
          <span className="ui-as-menu__label">
            {item.label}
            {item.description && <small>{item.description}</small>}
          </span>
          {item.checked && <Icon icon={Tick02Icon} size={14} />}
        </button>
      ))}
    </div>
  );
}

/** Any trigger with a menu: the trigger gets the open state and a toggle */
export function Dropdown({
  trigger,
  items,
  align = "start",
  side = "bottom",
  title,
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  side?: "bottom" | "top";
  /** Small heading above the items */
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className={["ui-as-anchor", className].filter(Boolean).join(" ")}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      <Popover open={open} onClose={() => setOpen(false)} align={align} side={side} className="ui-as-menu">
        {title && <span className="ui-as-menu__title">{title}</span>}
        <MenuList items={items} onPick={() => setOpen(false)} />
      </Popover>
    </span>
  );
}

/** Opens the library's Filter Menu in a popover; the button shows how many filters are on */
export function FilterButton({
  label,
  groups,
  value,
  onChange,
  align = "end",
}: {
  label: string;
  groups: FilterGroup[];
  value: FilterValue;
  onChange: (value: FilterValue) => void;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const count = Object.values(value).reduce((n, ids) => n + ids.length, 0);
  return (
    <span className="ui-as-anchor">
      <button type="button" className="ui-as-tool ui-as-tool--label" aria-expanded={open} data-active={count > 0 || undefined} onClick={() => setOpen((o) => !o)}>
        <Icon icon={FilterIcon} size={15} />
        {label}
        {count > 0 ? <span className="ui-as-tool__count">{count}</span> : <Icon icon={ArrowDown01Icon} size={13} />}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align={align} className="ui-as-popover--filter">
        <FilterMenu groups={groups} value={value} onChange={onChange} defaultOpen={groups.map((g) => g.id)} hints={false} title={label} />
      </Popover>
    </span>
  );
}

/** Plain menu of choices in a popover, e.g. a period picker */
export function MenuButton<T extends string>({
  value,
  options,
  onChange,
  icon,
  align = "end",
  className,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  icon?: IconGlyph;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <span className="ui-as-anchor">
      <button type="button" className={["ui-as-tool ui-as-tool--label", className].filter(Boolean).join(" ")} aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        {icon && <Icon icon={icon} size={15} />}
        {current?.label}
        <Icon icon={ArrowDown01Icon} size={13} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} align={align} className="ui-as-menu">
        <MenuList items={options.map((o) => ({ label: o.label, checked: o.value === value, onSelect: () => onChange(o.value) }))} onPick={() => setOpen(false)} />
      </Popover>
    </span>
  );
}

/** Short confirmation at the bottom of the main area – "Saved to Reports" */
export function useToast() {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);
  const show = (text: string) => setToast({ id: Date.now(), text });
  const node = toast ? (
    <div key={toast.id} className="ui-as-toast" role="status">
      <Icon icon={Tick02Icon} size={14} />
      {toast.text}
    </div>
  ) : null;
  return [node, show] as const;
}

export function SectionHead({ title, left, right }: { title: string; left?: ReactNode; right?: ReactNode }) {
  return (
    <div className="ui-as-section-head" data-inline={!left || undefined}>
      <h2 className="ui-as-section-head__title">{title}</h2>
      {(left || right) && (
        <div className="ui-as-toolbar">
          <div className="ui-as-toolbar__left">{left}</div>
          <div className="ui-as-toolbar__right">{right}</div>
        </div>
      )}
    </div>
  );
}

export function EmptyState({ title, text, action, tall }: { title: string; text: string; action?: ReactNode; tall?: boolean }) {
  return (
    <div className="ui-as-empty" data-tall={tall || undefined}>
      <span className="ui-as-empty__icon">
        <Icon icon={File02Icon} size={18} />
      </span>
      <b className="ui-as-empty__title">{title}</b>
      <p className="ui-as-empty__text">{text}</p>
      {action}
    </div>
  );
}

/* ---------- File cards ---------- */

export type FileType = "DOC" | "PDF" | "XLS";
export type FileItem = { name: string; type: FileType; edited?: string };

/** Badge color and label per file type */
const colors: Record<FileType, "blue" | "rose" | "emerald"> = { DOC: "blue", PDF: "rose", XLS: "emerald" };
export const fileKind: Record<FileType, string> = { DOC: "Document", PDF: "PDF", XLS: "Spreadsheet" };

/** A file as a card: preview on a gray stage, name and one line of details below */
export function FileCard({ file, meta }: { file: FileItem; meta: ReactNode }) {
  return (
    <button type="button" className="ui-as-template">
      <span className="ui-as-template__preview">
        <DocPreview type={file.type} color={colors[file.type]} />
      </span>
      <b className="ui-as-template__name">{file.name}</b>
      <span className="ui-as-meta">{meta}</span>
    </button>
  );
}

/**
 * File illustration in the style of the Glass Folder: a tinted sheet behind, a paper page with the file's content,
 * and a small frosted glass tag with the type at its corner. On hover the sheets fan out a little.
 */
function DocPreview({ type, color }: { type: FileType; color: "blue" | "rose" | "emerald" }) {
  return (
    <span className="ui-as-doc" data-color={color} aria-hidden="true">
      <span className="ui-as-doc__art">
        <span className="ui-as-doc__back" />
        <span className="ui-as-doc__page" data-type={type}>
          {type === "XLS" ? (
            <span className="ui-as-sheet">
              {Array.from({ length: 18 }, (_, i) => (
                <i key={i} />
              ))}
            </span>
          ) : (
            <>
              {type === "PDF" ? <span className="ui-as-doc__image" /> : <i className="ui-as-doc__title" />}
              {(type === "PDF" ? [100, 82, 92] : [100, 86, 94, 70, 88]).map((w, i) => (
                <i key={i} className="ui-as-doc__line" style={{ width: `${w}%` }} />
              ))}
            </>
          )}
        </span>
        <span className="ui-as-doc__type">{type}</span>
      </span>
    </span>
  );
}

/* ---------- Styles ---------- */

const css = /* css */ `
/* Design tokens – the affectUI names, drawn from the Fluid Functionalism surfaces, text colors and states
   (styles/fluid.css): page = surface 1, panel = surface 2, cards = surface 3; two text colors; hairlines from the accent */
.ui-as {
  --tray: var(--surface-1);
  --card: var(--surface-3);
  /* Like the affectUI library: gray page, the main area is a rounded panel on it */
  --page: var(--surface-1);
  --panel: var(--surface-2);
  --radius-panel: 12px;
  --frame-gap: 8px;
  --ui-as-rail-width: 64px;
  --line: var(--fluid-hairline);
  --line-soft: var(--fluid-hairline);
  --ink: var(--fluid-foreground);
  /* The ink pushed toward the mode's extreme – brighter in dark, darker in light: the open sidebar row and the logo */
  --ink-strong: color-mix(in oklab, var(--fluid-foreground), rgb(var(--overlay)) 40%);
  --text: var(--fluid-foreground);
  --muted: var(--fluid-muted);
  --faint: var(--fluid-muted);
  --placeholder: var(--fluid-muted);
  --chip: var(--fluid-hover);
  --chip-hover: var(--fluid-active);
  --hover: var(--fluid-hover);
  /* The theme's brand: highlights, progress, switches (styles/themes) */
  --accent: var(--brand);
  /* Buttons, disabled controls and switches: a theme may set them (--ui-*, see styles/themes/derive.css); the hand-made
     themes keep these values */
  --button: var(--ui-button, #262626);
  --button-hover: var(--ui-button-hover, #333333);
  --accent-soft: color-mix(in oklab, var(--brand) 12%, transparent);
  --shadow: var(--shadow-2);
  --line-strong: var(--fluid-border);
  --subtle: var(--surface-2);
  --on-ink: var(--ui-on-ink, #ffffff);
  --ink-hover: #3a3a3a;
  --select: var(--fluid-active);
  --toggle-off: var(--ui-disabled, #e2e2e2);
  --switch-on: var(--brand);
  --logo-bg: #ffffff;
  --ease: var(--ease-moderate);
  --font: var(--ui-font, "Inter Variable", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
}

/* Library components inside a screen follow the shell's scale: 13–13.5px text, 30px buttons, compact rows */
.ui-as .ui-pl { font-size: var(--fs-body); line-height: 19px; }
.ui-as .ui-pl__title { font-size: var(--fs-subtitle); line-height: 20px; }
.ui-as .ui-df__text { font-size: var(--fs-body); line-height: 1.6; }
.ui-as .ui-df__body { padding: 14px 16px 16px; }
.ui-as .ui-ap__title { font-size: var(--fs-body); }
.ui-as .ui-ap__btn { height: 30px; }
.ui-as .ui-tc { font-size: var(--fs-body); }
.ui-as .ui-tc__head { min-height: 40px; padding-top: 6px; padding-bottom: 6px; }
/* Actions look the same in every card: 30px, radius 10, quiet = white with a hairline, primary = ink; never stretched */
.ui-as .ui-ap__foot .ui-ap__actions { flex: 0 0 auto; margin-left: auto; }
.ui-as .ui-ap__actions .ui-ap__btn { flex: none; padding: 0 12px; border-radius: 10px; }
.ui-as .ui-ap__actions .ui-ap__btn--quiet { background: var(--card); box-shadow: var(--shadow-2); }
.ui-as .ui-ap__actions .ui-ap__btn--quiet:hover { background: var(--subtle); }
.ui-as .ui-df__head .ui-df__btn, .ui-as .ui-df__head .ui-df__icon { border-radius: 10px; }
.ui-as .ui-ap__actions .ui-ap__btn--primary, .ui-as .ui-df__head .ui-df__btn--primary { background: var(--button); }
.ui-as .ui-um__action { border-radius: 10px; }
/* …and the screens' lighter grays: trays and their hovers a step lighter than the components' own defaults */
.ui-as .ui-ap { --ui-ap-tray: var(--tray); --ui-ap-hover: #ebebeb; }
.ui-as .ui-pl { --ui-pl-tray: var(--tray); --ui-pl-quiet-hover: #ebebeb; --ui-pl-marker: var(--chip); }
.ui-as .ui-df { --ui-df-tray: var(--tray); }
.ui-as .ui-um { --ui-um-tray: var(--tray); }
.ui-as .ui-cb { --ui-cb-tray: var(--tray); }
:where(.dark, [data-theme="dark"]) .ui-as .ui-ap { --ui-ap-tray: #111113; --ui-ap-hover: #222225; }
:where(.dark, [data-theme="dark"]) .ui-as .ui-pl { --ui-pl-tray: #111113; --ui-pl-quiet-hover: #222225; --ui-pl-marker: #26262a; }
:where(.dark, [data-theme="dark"]) .ui-as :is(.ui-df, .ui-um, .ui-cb) { --ui-df-tray: #111113; --ui-um-tray: #111113; --ui-cb-tray: #111113; }

/* Dark mode: follows a .dark class or data-theme="dark" on any ancestor, e.g. <html>.
   Every screen draws from these tokens, and the library parts inside switch on their own. */
:where(.dark, [data-theme="dark"]) .ui-as {
  --button: var(--ui-button, #f4f4f5);
  --button-hover: var(--ui-button-hover, #ffffff);
  --on-ink: var(--ui-on-ink, #111113);
  --ink-hover: #d4d4d8;
  --toggle-off: var(--ui-disabled, #3a3a3f);
  --switch-on: var(--brand);
  --logo-bg: #2a2a2e;
  color-scheme: dark;
}

.ui-as, .ui-as *, .ui-as *::before, .ui-as *::after { box-sizing: border-box; }
.ui-as {
  font-family: var(--font);
  /* Inter at its text optical size; semibold rules pair 550 with opsz 18, so labels keep their width */
  font-variation-settings: "opsz" 14;
  font-size: var(--fs-body);
  color: var(--text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
@layer base {
:where(.ui-as) button {
  appearance: none;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
}
:where(.ui-as) svg { display: block; flex: none; }
.ui-as :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ui-as textarea:focus-visible, .ui-as input:focus-visible { outline: none; }

/* Primary buttons: one flat dark gray, with the soft light edge on top and faint one below from the Figma button 590:4159 */
.ui-as-app .ui-button[data-variant="primary"] {
  border-color: transparent;
  background: var(--button);
  color: var(--on-ink);
  box-shadow:
    inset 0 1px 0.5px rgba(255, 255, 255, 0.16),
    inset 0 -1px 0.5px rgba(19, 20, 27, 0.1),
    0 1px 2px rgba(19, 20, 27, 0.1);
}
.ui-as-app .ui-button[data-variant="primary"]:hover:not(:disabled) { background: var(--button-hover); }

/* App frame shared by all screens: sidebar on the gray page, main area as a rounded white panel */

.ui-as-app {
  /* The layout answers to the app's own width (container queries), not the window – see the end of this file */
  container: ui-as / inline-size;
  position: relative;
  display: grid;
  grid-template-columns: var(--ui-as-sidebar-width) minmax(0, 1fr);
  height: 100%;
  min-height: 560px;
  background: var(--ui-page-fill, var(--page));
  isolation: isolate;
  transition: grid-template-columns var(--motion-slow) var(--ease-slow);
}
/* Collapsed: the sidebar is gone completely, the main area keeps the same gap on all sides */
/* The light layer lies over every column (and under the narrow drawer and its scrim) */
.ui-as-light { position: absolute; z-index: 30; inset: 0; overflow: hidden; pointer-events: none; }

/* Collapsed, the sidebar keeps a 64px icon rail */
.ui-as-app[data-collapsed] { grid-template-columns: var(--ui-as-rail-width) minmax(0, 1fr); }
/* An aside sits beside the panel on the page surface – no frame, the page shows through */
.ui-as-app[data-aside] { grid-template-columns: var(--ui-as-sidebar-width) var(--ui-as-aside-columns); }
.ui-as-app[data-aside][data-collapsed] { grid-template-columns: var(--ui-as-rail-width) var(--ui-as-aside-columns); }
.ui-as-app[data-aside] > .ui-as-main { grid-row: 1; grid-column: 2; margin-right: 0; }
.ui-as-app[data-aside] > .ui-as-aside { grid-row: 1; grid-column: 3; }
/* Covered: the panel spans the aside's column too and keeps its usual gap; the aside waits underneath */
.ui-as-app[data-aside-covered] > .ui-as-main { z-index: 1; grid-column: 2 / 4; margin-right: var(--frame-gap); }
.ui-as-app[data-aside-covered] > .ui-as-aside { visibility: hidden; }
.ui-as-aside {
  container: ui-as-aside / inline-size;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

/* ---------- Sidebar ---------- */

.ui-as-side {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  /* 12px each side: in the 64px rail every row's 16px icon sits on the column's center line */
  padding: 0 12px 12px;
  transition: opacity var(--motion-moderate) var(--ease-moderate), translate var(--motion-slow) var(--ease-slow), visibility 0s;
}

/* While one of its menus is open (the account's, say – in the rail it is wider than the sidebar) the sidebar lets it
   out and lies over the window, the stage's glow included */
.ui-as-app:not([data-narrow]) > .ui-as-side:has(.ui-as-popover) { z-index: 40; overflow: visible; }

/* The icon to bring the drawer back on narrow screens, in the top left corner of the main area */
.ui-as-side-open {
  position: fixed;
  z-index: 20;
  top: calc(var(--frame-gap) + 12px);
  left: calc(var(--frame-gap) + 9px);
  visibility: hidden;
  opacity: 0;
  transition: opacity var(--motion-moderate-exit) var(--ease-exit), visibility 0s var(--motion-moderate-exit);
}

/* The head lines up with the window's toolbar beside it: same top gap, same 52px row, icons on the same center line.
   The fold button rides the sidebar's right edge and lands centered in the rail, so nothing jumps */
.ui-as-side__head {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 52px;
  margin-top: var(--frame-gap);
}
.ui-as-side__brand { display: flex; flex: 1; min-width: 0; align-items: center; transition: opacity var(--motion-slow) var(--ease-slow) 100ms; }
/* A logo lines up with the rows' icons below it: the rows' own 12px inner padding */
.ui-as-side__brand[data-logo] { padding-left: 12px; }
/* The logo in the theme's strongest ink (it fills with currentColor) – near white in dark, the darkest text in light */
.ui-as-side__brand .dojo-brand-logo { color: var(--ink-strong); }
.ui-as-side__search { overflow: hidden; transition: width var(--motion-slow) var(--ease-slow), opacity var(--motion-slow) var(--ease-slow) 100ms, background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast); }
.ui-as-side__toggle { transition: margin var(--motion-slow) var(--ease-slow), background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast); }
.ui-as-app[data-collapsed] .ui-as-side__brand { opacity: 0; pointer-events: none; transition: opacity var(--motion-moderate-exit) var(--ease-exit); }
.ui-as-app[data-collapsed] .ui-as-side__search { width: 0; opacity: 0; pointer-events: none; transition: width var(--motion-slow) var(--ease-slow), opacity var(--motion-moderate-exit) var(--ease-exit); }
.ui-as-app[data-collapsed] .ui-as-side__toggle { margin-right: 6px; }
/* The rail's 40px row has no room for the gaps: they close so the button lands on the center line */
.ui-as-side__head, .ui-as-side__tools { transition: gap var(--motion-slow) var(--ease-slow); }
.ui-as-app[data-collapsed] :is(.ui-as-side__head, .ui-as-side__tools) { gap: 0; }
.ui-as-side__workspace {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: var(--fs-subtitle);
  font-weight: 550; font-variation-settings: "opsz" 18;
  color: var(--ink);
}
.ui-as-side__workspace svg { color: var(--faint); }
.ui-as-side__workspace:hover { background: var(--hover); }
.ui-as-user-menu { display: flex; }
.ui-as-user-menu > .ui-as-user { flex: 1; }
.ui-as-user-menu .ui-as-menu { width: 100%; }
/* Workspace logo on a white tile with a small, tight shadow below */
.ui-as-side__logo {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-right: 1px;
  border-radius: 5px;
  background: var(--logo-bg);
  box-shadow: var(--shadow-2);
}
.ui-as-side__logo svg { width: 11px; height: auto; }
.ui-as-side__tools { display: flex; flex: none; gap: 2px; }

.ui-as-icon-btn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  color: var(--muted);
  transition: background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast);
}
.ui-as-icon-btn:hover { background: var(--hover); color: var(--ink); }

.ui-as-side__nav {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  margin: 8px -12px 0;
  padding: 0 12px 12px;
  overflow-x: hidden;
  overflow-y: auto;
}
.ui-as-side__group { display: flex; flex-direction: column; gap: 1px; }
.ui-as-side__group + .ui-as-side__group { margin-top: 4px; }
.ui-as-side__custom { margin-top: 8px; transition: opacity var(--motion-slow) var(--ease-slow) 100ms; }
.ui-as-app[data-collapsed] .ui-as-side__custom { opacity: 0; pointer-events: none; transition: opacity var(--motion-moderate-exit) var(--ease-exit); }
.ui-as-side__empty { padding: 4px 12px; font-size: var(--fs-body); color: var(--faint); white-space: nowrap; }

/* A row: 32px, the icon 12px in; the highlight is one element that glides from row to row (moderate spring) */
.ui-as-side__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 32px;
  padding: 0 12px;
  border-radius: 8px;
  font-size: var(--fs-body);
  color: var(--text);
  text-align: left;
  white-space: nowrap;
  transition: background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast);
}
.ui-as-side__item > * { position: relative; z-index: 1; }
/* The open row: a quiet tint (half the active state – a row lit like a card would compete with the composer and the
   window), so its text carries it: the ink pushed toward the mode's extreme (brighter in dark, darker in light) and
   semibold, while every other row sits muted – halfway to the muted text – and comes up to ink under the pointer */
/* A theme may set its own (--side-selected, e.g. T3 Chat's lighter step) */
.ui-as-side__item > .ui-as-side__lit { position: absolute; z-index: 0; inset: 0; border-radius: 8px; background: var(--side-selected, color-mix(in oklab, var(--select) 55%, transparent)); }
.ui-as-side__item:not([data-lit]) { color: color-mix(in oklab, var(--text) 50%, var(--muted)); }
.ui-as-side__item svg { flex: none; color: var(--muted); }
/* A number in the icon's place: same box, small tabular figures */
.ui-as-side__marker { flex: none; width: 16px; font-size: 10.5px; font-weight: 550; font-variation-settings: "opsz" 14; line-height: 16px; text-align: center; color: var(--muted); font-variant-numeric: tabular-nums; }
.ui-as-side__item[data-lit] .ui-as-side__marker { color: var(--ink-strong); }
/* Under the pointer: the hover tint, or the theme's own row hover (--side-hover, e.g. T3 Chat's lighter surface) */
.ui-as-side__item:hover { background: var(--side-hover, var(--hover)); color: var(--ink); }
.ui-as-side__item[data-lit] { color: var(--ink-strong); }
.ui-as-side__item[data-lit] svg { color: var(--ink-strong); }
.ui-as-side__item[aria-current="page"] .ui-as-side__text { font-weight: 550; font-variation-settings: "opsz" 18; }
.ui-as-side__item:focus-visible { outline: 1px solid var(--focus-ring); outline-offset: -1px; }
.ui-as-side__item[data-nested] { height: 30px; padding-left: 38px; }
a.ui-as-side__item { text-decoration: none; cursor: pointer; }
.ui-as-side__text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.ui-as-side__count { margin-left: auto; font-size: var(--fs-caption); color: var(--faint); font-variant-numeric: tabular-nums; }
/* In the rail a count becomes a dot on the icon's corner */
.ui-as-side__dot { position: absolute; top: 7px; left: 25px; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); opacity: 0; scale: 0.3; transition: opacity var(--motion-fast) var(--ease-fast), scale var(--motion-fast) var(--ease-fast); }
.ui-as-app[data-collapsed] .ui-as-side__dot { opacity: 1; scale: 1; transition: opacity var(--motion-moderate) var(--ease-moderate) 160ms, scale var(--motion-moderate) var(--ease-moderate) 160ms; }
.ui-as-side__chevron { display: grid; flex: none; margin-left: auto; color: var(--faint); transition: rotate var(--motion-moderate) var(--ease-moderate), opacity var(--motion-slow) var(--ease-slow) 100ms; }
.ui-as-side__chevron svg { color: currentColor; }
.ui-as-side__chevron[data-turned] { rotate: 90deg; }
/* Progress at the row's end: done a quiet check, in progress a ring in the brand's color, locked a faint lock – and a
   locked row reads faint and doesn't light under the pointer */
.ui-as-side__state { display: grid; flex: none; place-items: center; width: 16px; height: 16px; margin-left: auto; color: var(--faint); transition: opacity var(--motion-slow) var(--ease-slow) 100ms; }
.ui-as-side__chevron + .ui-as-side__state { margin-left: 4px; }
.ui-as-side__item .ui-as-side__state svg { color: currentColor; }
.ui-as-side__item .ui-as-side__state[data-state="done"] { color: var(--brand); }
.ui-as-side__state[data-state="active"] > i { width: 9px; height: 9px; border: 2px solid var(--brand); border-radius: 50%; }
.ui-as-side__item[data-state="locked"]:not([data-lit]) { color: var(--faint); }
.ui-as-side__item[data-state="locked"] .ui-as-side__marker { color: var(--faint); }
.ui-as-side__item[data-state="locked"]:hover { background: none; color: var(--faint); }
.ui-as-app[data-collapsed] .ui-as-side__state { opacity: 0; transition: opacity var(--motion-moderate-exit) var(--ease-exit); }
/* What a section puts above its heading – the course card above its chapters */
.ui-as-side__before { margin: 4px 0 6px; }
/* The menu's rows, as one block that swipes when the menu changes */
.ui-as-side__menu { display: flex; flex-direction: column; }

/* Labels leave quickly so they are gone a beat before the rail settles, and come back a beat after it opens */
.ui-as-side__text, .ui-as-side__count, .ui-as-side__label-text, .ui-as-user__name, .ui-as-user > svg:last-child {
  transition: opacity var(--motion-slow) var(--ease-slow) 100ms, translate var(--motion-slow) var(--ease-slow) 100ms;
}
.ui-as-app[data-collapsed] :is(.ui-as-side__text, .ui-as-side__count, .ui-as-side__chevron, .ui-as-side__label-text, .ui-as-user__name, .ui-as-user > svg:last-child) {
  opacity: 0;
  translate: -6px 0;
  transition: opacity var(--motion-moderate-exit) var(--ease-exit), translate var(--motion-moderate-exit) var(--ease-exit);
}

/* A group's rows fold open under it */
.ui-as-side__branch { display: flex; flex-direction: column; }
.ui-as-side__children { display: grid; grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows var(--motion-moderate) var(--ease-moderate), opacity var(--motion-moderate-exit) var(--ease-exit); }
.ui-as-side__children[data-open] { grid-template-rows: 1fr; opacity: 1; transition: grid-template-rows var(--motion-moderate) var(--ease-moderate), opacity var(--motion-moderate) var(--ease-moderate) 60ms; }
.ui-as-side__children > div { display: flex; flex-direction: column; gap: 1px; min-height: 0; overflow: hidden; }

/* A section heading; in the rail it shortens into a divider */
.ui-as-side__label {
  position: relative;
  display: flex;
  align-items: flex-end;
  height: 32px;
  padding: 0 12px 8px;
  /* Small capitals, as the lesson brief's section labels: micro size, semibold, 0.05em of tracking */
  font-size: var(--fs-micro);
  line-height: var(--lh-micro);
  font-weight: 550;
  font-variation-settings: "opsz" 14;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--faint);
  white-space: nowrap;
  transition: height var(--motion-slow) var(--ease-slow);
}
.ui-as-side__label::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 12px;
  right: 12px;
  height: 1px;
  background: var(--line);
  opacity: 0;
  scale: 0.3 1;
  transition: opacity var(--motion-fast) var(--ease-fast), scale var(--motion-fast) var(--ease-fast);
}
.ui-as-app[data-collapsed] .ui-as-side__label { height: 17px; }
.ui-as-app[data-collapsed] .ui-as-side__label::after { opacity: 1; scale: 1 1; transition: opacity var(--motion-moderate) var(--ease-moderate) 160ms, scale var(--motion-moderate) var(--ease-moderate) 160ms; }

/* Tooltips beside the rail: a small popover surface */
.ui-as-tip {
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--surface-5);
  box-shadow: var(--shadow-4);
  color: var(--fluid-foreground);
  font-family: var(--ui-font, "Inter Variable", "Inter", ui-sans-serif, system-ui, sans-serif);
  font-size: var(--fs-caption);
  line-height: var(--lh-caption);
  animation: ui-as-tip-in var(--motion-fast) var(--ease-fast);
}
.ui-as-tip__note { color: var(--fluid-muted); font-variant-numeric: tabular-nums; }
@keyframes ui-as-tip-in { from { opacity: 0; translate: -4px 0; } }

.ui-as-side__foot {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 4px;
  margin-top: auto;
}
.ui-as-side__foot > .ui-as-guide-slot { margin: 4px 0; }

/* "What's new" – two cards stacked, the second one peeks out above */
.ui-as-news { position: relative; padding-top: 30px; }
.ui-as-news__card {
  position: relative;
  z-index: 1;
  padding: 10px 10px 0;
  border-radius: 12px;
  background: var(--card);
  box-shadow: var(--shadow-3);
}
.ui-as-news__card--back {
  position: absolute;
  z-index: 0;
  top: 0;
  left: 10px;
  right: 10px;
  height: 48px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 9px 9px 0;
  background: var(--card);
  color: var(--faint);
}
.ui-as-news[data-count="1"] { padding-top: 0; }
.ui-as-news[data-count="1"] .ui-as-news__card--back { display: none; }
.ui-as-news__top { display: flex; align-items: center; justify-content: space-between; }
.ui-as-news__kicker { font-size: 11.5px; line-height: 15px; font-weight: 550; font-variation-settings: "opsz" 18; color: var(--accent); }
.ui-as-news__close {
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin: -2px -2px 0 0;
  border-radius: 6px;
  color: var(--faint);
}
.ui-as-news__close:hover { background: var(--hover); color: var(--ink); }
.ui-as-news__title { display: block; margin-top: 4px; font-size: var(--fs-body); line-height: 18px; font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-as-news__more {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: calc(100% + 20px);
  height: 34px;
  margin: 10px -10px 0;
  padding: 0 10px;
  border-top: 1px solid var(--line-soft);
  border-radius: 0 0 12px 12px;
  font-size: var(--fs-caption);
  color: var(--muted);
}
.ui-as-news__more:hover { background: var(--subtle); color: var(--ink); }

/* Onboarding progress */
/* Getting started: one card that morphs between the short summary and the full Setup Guide */
.ui-as-guide-slot { position: relative; flex: none; }
.ui-as-guide {
  position: absolute;
  z-index: 6;
  right: 0;
  bottom: 0;
  left: 0;
  overflow: hidden;
  border-radius: 12px;
  background: var(--card);
  box-shadow: var(--shadow-3);
  transition: height var(--motion-slow) var(--ease-slow), border-radius var(--motion-slow) var(--ease-slow), box-shadow var(--motion-moderate) var(--ease-moderate);
}
.ui-as-guide:not([data-open]):hover { box-shadow: var(--shadow-4); }
.ui-as-guide--pinned { position: relative; flex: none; margin: 4px 0; }
.ui-as-guide[data-open] { border-radius: 14px; box-shadow: var(--shadow-5); }
.ui-as-guide__content { animation: ui-as-guide-in var(--motion-slow) var(--ease-slow) both; }
/* Closing: the guide fades out while the card shrinks back to the summary's height */
.ui-as-guide[data-state="closing"] .ui-as-guide__content { animation: ui-as-guide-out var(--motion-moderate) var(--ease-moderate) both; }
.ui-as-guide[data-state="closing"] { border-radius: 12px; box-shadow: var(--shadow-3); }
@keyframes ui-as-guide-out { to { opacity: 0; } }
@keyframes ui-as-guide-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.ui-as-steps {
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 10px 10px 9px;
  text-align: left;
}
/* The library's Setup Guide inside the card: its own frame drops away, the card is the frame */
/* Opening and closing belong to the card, so the guide's own minimize button is left out */
.ui-as-guide .ui-sg__icon-btn[aria-expanded] { display: none; }
.ui-as-guide .ui-sg { zoom: 0.86; max-width: none; padding: 12px 4px 4px; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.ui-as-steps__title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--fs-body);
  line-height: 18px;
  font-weight: 550; font-variation-settings: "opsz" 18;
  color: var(--ink);
}
.ui-as-steps__title svg { color: var(--faint); }
.ui-as-steps__sub { font-size: var(--fs-caption); line-height: 17px; color: var(--muted); }
.ui-as-steps__cheer { color: var(--accent); }
.ui-as-steps__bar {
  height: 4px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 2px;
  background: var(--tray);
}
.ui-as-steps__bar i { display: block; min-width: 6px; height: 100%; border-radius: inherit; background: var(--accent); transition: width 600ms var(--ease); }

/* In the rail the cards above the user step aside; the Settings row and the avatar stay */
.ui-as-news, .ui-as-guide-slot { transition: opacity var(--motion-slow) var(--ease-slow) 100ms; }
.ui-as-app[data-collapsed] :is(.ui-as-news, .ui-as-guide-slot) { display: none; }
.ui-as-user {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 36px;
  /* The 20px avatar sits on the rail's center line */
  padding: 0 10px;
  white-space: nowrap;
  border-radius: 8px;
  font-size: var(--fs-body);
  font-weight: 550; font-variation-settings: "opsz" 18;
  color: var(--ink);
}
/* The face a squircle, as every avatar */
.ui-as-user img { flex: none; width: 20px; height: 20px; border-radius: 50%; corner-shape: squircle; object-fit: cover; box-shadow: var(--shadow-1); }
.ui-as-user svg { margin-left: auto; color: var(--faint); }
.ui-as-user:hover { background: var(--hover); }

/* ---------- Main ---------- */

/* Main area as a rounded panel, like the affectUI library */
.ui-as-main {
  /* Screens reflow their content by the width of this panel */
  container: ui-as-main / inline-size;
  position: relative;
  min-width: 0;
  margin: var(--frame-gap) var(--frame-gap) var(--frame-gap) 0;
  overflow-y: auto;
  /* No rubber-band bounce at the ends – sticky headers stay put */
  overscroll-behavior: none;
  transition: margin-left var(--motion-slow) var(--ease-slow);
  /* Surface 2 on the page's surface 1: the surface shadow draws its edge, no border */
  border-radius: var(--radius-panel);
  background: var(--panel);
  /* On the page like the composer, so the same shadow */
  box-shadow: var(--shadow-3);
}


/* Shared page parts: headings, toolbars, tabs, search, empty states – affectUI tokens */

.ui-as-page {
  padding: 46px 32px 56px;
}
.ui-as-page-title {
  margin: 0;
  font-size: 22px;
  line-height: 28px;
  font-weight: 550; font-variation-settings: "opsz" 18;
  color: var(--ink);
}
.ui-as-page-sub {
  margin: 6px 0 0;
  font-size: var(--fs-body);
  line-height: 20px;
  color: var(--muted);
}
.ui-as-page-sub a { color: var(--text); text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px; }
.ui-as-page-sub a:hover { color: var(--ink); text-decoration-color: currentColor; }

.ui-as-section-head { margin-top: 38px; }
/* Without tabs the tools sit on the same line as the title */
.ui-as-section-head[data-inline] { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.ui-as-section-head[data-inline] .ui-as-toolbar { margin-top: 0; }
.ui-as-section-head__title {
  margin: 0;
  font-size: var(--fs-title);
  line-height: 22px;
  font-weight: 550; font-variation-settings: "opsz" 18;
  color: var(--ink);
}
.ui-as-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 16px;
}
.ui-as-toolbar__left, .ui-as-toolbar__right { display: flex; align-items: center; gap: 6px; }

/* Segmented tabs: the active one gets a soft gray fill */
.ui-as-tabs { position: relative; display: flex; gap: 2px; }
/* The gray pill glides under the active tab */
.ui-as-tabs__pill {
  position: absolute;
  top: 0;
  left: 0;
  height: 32px;
  border-radius: 9px;
  background: var(--chip);
  transition: transform var(--motion-slow) var(--ease-slow), width var(--motion-slow) var(--ease-slow);
}
.ui-as-tabs__tab {
  position: relative;
  height: 32px;
  padding: 0 10px;
  border-radius: 9px;
  font-size: var(--fs-body);
  color: var(--muted);
  transition: background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast);
}
.ui-as-tabs__tab:hover { color: var(--ink); }
.ui-as-tabs__tab[aria-selected="true"] { color: var(--ink); }

/* Small outlined tools */
.ui-as-tool {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--card);
  box-shadow: var(--shadow-2);
  color: var(--text);
  transition: box-shadow var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast);
}
.ui-as-tool svg { color: var(--muted); }
.ui-as-tool:hover { box-shadow: var(--shadow-3); color: var(--ink); }
.ui-as-tool--label { padding: 0 10px; font-size: var(--fs-body); }

.ui-as-view {
  position: relative;
  display: flex;
  gap: 2px;
  height: 32px;
  padding: 2px;
  border-radius: 9px;
  background: var(--chip);
}
.ui-as-view__btn {
  display: grid;
  place-items: center;
  width: 30px;
  border-radius: 7px;
  color: var(--faint);
}
.ui-as-view__btn:hover { color: var(--ink); }
.ui-as-view__btn { position: relative; transition: color var(--motion-fast) var(--ease-fast); }
.ui-as-view__btn[aria-checked="true"] { color: var(--ink); }
/* White pill that slides between grid and list */
.ui-as-view__pill {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: 30px;
  border-radius: 7px;
  background: var(--card);
  box-shadow: var(--shadow-2);
  transition: transform var(--motion-slow) var(--ease-slow);
}
.ui-as-view[data-view="list"] .ui-as-view__pill { transform: translateX(32px); }

.ui-as-search {
  display: flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 10px;
  border-radius: 9px;
  background: var(--card);
  box-shadow: var(--shadow-2);
  color: var(--faint);
  cursor: text;
  transition: box-shadow var(--motion-fast) var(--ease-fast);
}
.ui-as-search:focus-within { box-shadow: var(--shadow-2), 0 0 0 3px var(--hover); }
.ui-as-search input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: var(--fs-body);
  color: var(--ink);
}
.ui-as-search input::placeholder { color: var(--placeholder); }
.ui-as-search__clear {
  display: grid;
  flex: none;
  place-items: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--chip);
  color: var(--muted);
  animation: ui-as-pop var(--motion-moderate) var(--ease-moderate);
}
.ui-as-search__clear:hover { color: var(--ink); }

/* Sort: the arrows turn half a circle for Z–A */
.ui-as-sort svg { transition: transform var(--motion-slow) var(--ease-slow); }
.ui-as-sort[data-dir="desc"] svg { transform: rotate(180deg); }
.ui-as-tool[data-active] { box-shadow: var(--shadow-3); color: var(--ink); }
.ui-as-tool__count {
  display: grid;
  place-items: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: var(--ink);
  font-size: 11px;
  font-weight: 550; font-variation-settings: "opsz" 18;
  color: var(--on-ink);
  animation: ui-as-pop var(--motion-moderate) var(--ease-moderate);
}

/* Popovers: attached to their trigger, they fade and scale in from that side */
.ui-as-anchor { position: relative; display: inline-flex; }
.ui-as-popover {
  position: absolute;
  z-index: 30;
  top: calc(100% + 6px);
  left: 0;
  transform-origin: top left;
  animation: ui-as-popover var(--motion-moderate) var(--ease-moderate);
}
.ui-as-popover[data-align="end"] { right: 0; left: auto; transform-origin: top right; }
.ui-as-popover[data-side="top"] { top: auto; bottom: calc(100% + 6px); transform-origin: bottom left; animation-name: ui-as-popover-up; }
.ui-as-popover[data-side="top"][data-align="end"] { transform-origin: bottom right; }
.ui-as-popover[data-side="right"] { top: auto; bottom: 0; left: calc(100% + 12px); transform-origin: bottom left; }
@keyframes ui-as-popover-up { from { opacity: 0; transform: scale(0.96) translateY(4px); } to { opacity: 1; transform: none; } }
.ui-as-popover--filter .ui-fm { zoom: 0.9; width: 340px; }

.ui-as-menu {
  min-width: 168px;
  padding: 4px;
  border-radius: 12px;
  background: var(--card);
  box-shadow: var(--shadow-4);
}
.ui-as-menu__title { display: block; padding: 6px 10px 4px; font-size: var(--fs-caption); font-weight: 550; font-variation-settings: "opsz" 18; color: var(--faint); }
.ui-as-menu__list { display: grid; gap: 1px; }
.ui-as-menu__item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  font-size: var(--fs-body);
  color: var(--text);
  text-align: left;
  white-space: nowrap;
  transition: background-color var(--motion-fast) var(--ease-fast), color var(--motion-fast) var(--ease-fast);
}
.ui-as-menu__item[data-rich] { min-height: 44px; padding: 6px 10px; }
.ui-as-menu__item > svg { flex: none; color: var(--muted); }
.ui-as-menu__item > svg:last-child:not(:first-child) { margin-left: auto; color: var(--ink); }
.ui-as-menu__label { display: grid; flex: 1; gap: 1px; min-width: 0; }
.ui-as-menu__label small { font-size: var(--fs-caption); line-height: 16px; color: var(--faint); }
.ui-as-menu__item:hover { background: var(--hover); color: var(--ink); }
.ui-as-menu__item[aria-checked="true"] { color: var(--ink); font-weight: 550; font-variation-settings: "opsz" 18; }
.ui-as-menu__item[aria-checked="true"] small { font-weight: 400; }
.ui-as-menu__item[data-danger] { color: #dc2626; }
.ui-as-menu__item[data-danger] > svg { color: #dc2626; }

.ui-as-toast {
  position: absolute;
  z-index: 40;
  left: 50%;
  bottom: 20px;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px 0 12px;
  border-radius: 999px;
  background: var(--ink);
  font-size: var(--fs-body);
  color: var(--on-ink);
  box-shadow: 0 10px 24px -8px rgba(0, 0, 0, 0.35);
  translate: -50% 0;
  animation: ui-as-toast 2200ms var(--ease) both;
}

/* Shared motion: content that changes (tabs, filters, new messages) rises in; --i staggers a list */
.ui-as-rise { animation: ui-as-rise var(--motion-slow) var(--ease-slow) both; animation-delay: calc(var(--i, 0) * 35ms); }
@keyframes ui-as-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes ui-as-pop { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: none; } }
@keyframes ui-as-popover { from { opacity: 0; transform: scale(0.96) translateY(-4px); } to { opacity: 1; transform: none; } }
@keyframes ui-as-toast {
  0% { opacity: 0; transform: translateY(12px) scale(0.96); }
  12%, 85% { opacity: 1; transform: none; }
  100% { opacity: 0; transform: translateY(6px); }
}
@media (prefers-reduced-motion: reduce) {
  .ui-as *, .ui-as *::before, .ui-as *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
.ui-as-search input::-webkit-search-cancel-button { display: none; }

/* Empty state in a dashed drop area */
.ui-as-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 16px;
  padding: 48px 24px 52px;
  border: 1px dashed var(--line-strong);
  border-radius: 14px;
  text-align: center;
}
.ui-as-empty[data-tall] { padding: 48px 24px 48px; }
.ui-as-empty__icon {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 11px;
  background: var(--chip);
  color: var(--muted);
}
.ui-as-empty__title { margin-top: 16px; font-size: var(--fs-subtitle); line-height: 20px; font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-as-empty__text { max-width: 430px; margin: 6px 0 0; font-size: var(--fs-body); line-height: 19px; color: var(--muted); text-wrap: balance; }
.ui-as-empty > .ui-button { margin-top: 18px; }

/* Glass Folder from the library at icon size; hovering the whole card or row opens it like hovering the folder itself */
.ui-as-folder-card__icon, .ui-as-folder-head__icon {
  position: relative;
  flex: none;
  width: 30px;
  height: 25px;
}
.ui-as-folder-card__icon .ui-fd, .ui-as-folder-head__icon .ui-fd {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 75px;
  translate: -50% -50%;
}
:is(.ui-as-folder-card, .ui-as-folder-head):hover .ui-fd-icon { transform: translate(-50%, -48%) scale(1.03); }
:is(.ui-as-folder-card, .ui-as-folder-head):hover .ui-fd-doc--left { transform: translate(32px, 70px) rotate(9deg); }
:is(.ui-as-folder-card, .ui-as-folder-head):hover .ui-fd-doc--right { transform: translate(286px, 76px) rotate(5deg); }
:is(.ui-as-folder-card, .ui-as-folder-head):hover .ui-fd-doc--middle { transform: translate(166px, 52px) rotate(-7deg); }
:is(.ui-as-folder-card, .ui-as-folder-head):hover .ui-fd-front {
  top: 24.8%;
  border-radius: 3cqw 3cqw 6.333cqw 6.333cqw;
  transform: translateZ(2.33cqw) rotateX(-9deg);
}

.ui-as-meta { display: inline-flex; align-items: center; gap: 4px; font-size: var(--fs-caption); line-height: 17px; color: var(--muted); }
.ui-as-meta svg { color: var(--faint); }


/* File card – used for templates and for the files inside a folder */
.ui-as-template { display: grid; width: 239px; text-align: left; }
.ui-as-template__preview {
  display: block;
  height: 158px;
  padding: 7px;
  border-radius: 14px;
  background: var(--card);
  box-shadow: var(--shadow-3);
  transition: box-shadow var(--motion-fast) var(--ease-fast);
}
.ui-as-template:hover .ui-as-template__preview { box-shadow: var(--shadow-4); }
.ui-as-template__name { margin-top: 10px; font-size: var(--fs-body); line-height: 18px; font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-as-template .ui-as-meta { margin-top: 2px; }

/* File illustration in the Glass Folder style: tinted back sheet, paper page, frosted type badge */
.ui-as-doc {
  --doc-back: #5bb7ea;
  --doc-glass-1: rgba(120, 200, 245, 0.72);
  --doc-glass-2: rgba(52, 150, 212, 0.78);
  --doc-shade: 60, 130, 180;
  --doc-paper: #eaf2f8;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  border-radius: 10px;
  background: var(--card);
}
.ui-as-doc[data-color="rose"] {
  --doc-back: #f27b90;
  --doc-glass-1: rgba(250, 150, 170, 0.74);
  --doc-glass-2: rgba(222, 70, 100, 0.8);
  --doc-shade: 190, 60, 88;
  --doc-paper: #f9eef1;
}
.ui-as-doc[data-color="emerald"] {
  --doc-back: #4cc591;
  --doc-glass-1: rgba(110, 215, 165, 0.74);
  --doc-glass-2: rgba(30, 160, 102, 0.8);
  --doc-shade: 40, 140, 96;
  --doc-paper: #edf7f2;
}
.ui-as-doc__art { position: relative; display: block; width: 72px; height: 92px; }

/* Tinted sheet peeking out behind the page, like the back of the folder */
.ui-as-doc__back {
  position: absolute;
  inset: 0;
  border-radius: 11px;
  background: var(--doc-back);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 10px 18px -8px rgba(var(--doc-shade), 0.45);
  transform: translate(10px, -4px) rotate(8deg);
  transition: transform var(--motion-slow) var(--ease-slow);
}

/* The page: white fading into a hint of the file's colour, like the documents in the folder */
.ui-as-doc__page {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 13px 11px;
  border-radius: 11px;
  background: linear-gradient(180deg, var(--doc-page, #fff) 0%, var(--doc-paper) 100%);
  box-shadow: var(--shadow-2);
  transform: rotate(-3deg);
  transition: transform var(--motion-slow) var(--ease-slow);
}
.ui-as-doc__title { display: block; width: 58%; height: 5px; margin-bottom: 3px; border-radius: 3px; background: var(--doc-ink-strong, rgba(0, 0, 0, 0.2)); }
.ui-as-doc__line { display: block; height: 4px; border-radius: 2px; background: var(--doc-ink, rgba(0, 0, 0, 0.1)); }
.ui-as-doc__image {
  display: block;
  height: 26px;
  margin-bottom: 2px;
  border-radius: 5px;
  background: linear-gradient(160deg, var(--doc-glass-1), var(--doc-glass-2));
  opacity: 0.55;
}

/* Spreadsheet: a 3 × 6 grid with a darker header row */
.ui-as-sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; }
.ui-as-sheet i { height: 8px; border-radius: 2px; background: var(--doc-cell, rgba(0, 0, 0, 0.07)); }
.ui-as-sheet i:nth-child(-n + 3) { background: rgba(var(--doc-shade), 0.35); }

/* Small frosted glass tag at the lower right corner, the same recipe as the folder's front pocket */
.ui-as-doc__type {
  position: absolute;
  right: -12px;
  bottom: 10px;
  z-index: 2;
  padding: 3px 6px;
  border-radius: 5px;
  background:
    linear-gradient(180deg, rgba(0, 0, 0, 0) 55%, rgba(var(--doc-shade), 0.25) 100%),
    linear-gradient(180deg, var(--doc-glass-1), var(--doc-glass-2));
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.6),
    0 6px 12px -4px rgba(var(--doc-shade), 0.45);
  -webkit-backdrop-filter: blur(4px) saturate(1.15);
  backdrop-filter: blur(4px) saturate(1.15);
  font-size: 10px;
  line-height: 13px;
  font-weight: 550; font-variation-settings: "opsz" 18;
  color: #fff;
  text-shadow: 0 1px 2px rgba(var(--doc-shade), 0.45);
  transition: transform var(--motion-slow) var(--ease-slow);
}
.ui-as-template:hover .ui-as-doc__back { transform: translate(14px, -7px) rotate(12deg); }
.ui-as-template:hover .ui-as-doc__page { transform: translateY(-4px) rotate(-5deg); }
.ui-as-template:hover .ui-as-doc__type { transform: translate(2px, -2px); }

/* Workspace initial and user initials */
.ui-as-side__logo { font-size: 10.5px; font-weight: 550; font-variation-settings: "opsz" 18; color: var(--ink); }
.ui-as-user__initials {
  display: grid;
  flex: none;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  corner-shape: squircle;
  background: var(--accent-soft);
  font-size: 9.5px;
  font-weight: 550; font-variation-settings: "opsz" 18;
  color: var(--accent);
}

/* File illustrations in dark mode: dark paper tinted by the file's color, light lines */
:where(.dark, [data-theme="dark"]) .ui-as-doc {
  --doc-page: #303238;
  --doc-edge: rgba(255, 255, 255, 0.1);
  --doc-ink: rgba(255, 255, 255, 0.14);
  --doc-ink-strong: rgba(255, 255, 255, 0.3);
  --doc-cell: rgba(255, 255, 255, 0.08);
}
:where(.dark, [data-theme="dark"]) .ui-as-doc { --doc-paper: #263039; }
:where(.dark, [data-theme="dark"]) .ui-as-doc[data-color="rose"] { --doc-paper: #36282d; }
:where(.dark, [data-theme="dark"]) .ui-as-doc[data-color="emerald"] { --doc-paper: #243530; }

/* Scrim behind the drawer – only used on narrow screens */
.ui-as-scrim { display: none; }

/* ---------- Narrow: tablet and phone ---------- */
/* Container queries on the app itself, so a scaled 1440 px preview keeps the desktop layout */

@container ui-as (max-width: 900px) {
  /* The main panel takes the whole width; the sidebar slides in over it as a drawer */
  .ui-as-app > .ui-as-main { grid-row: 1; grid-column: 1 / -1; margin-left: var(--frame-gap); }
  /* The container can't restyle its own grid here, so the panel spans the sidebar's column instead */
  .ui-as-app[data-aside] > .ui-as-main { grid-column: 1 / 3; }
  .ui-as-app[data-aside-covered] > .ui-as-main { grid-column: 1 / 4; }
  .ui-as-app > .ui-as-side {
    position: absolute;
    z-index: 50;
    top: 0;
    bottom: 0;
    left: 0;
    width: min(264px, calc(100% - 56px));
    /* No top padding: the head's own frame-gap margin puts it on the window's toolbar line */
    padding: 0 10px 10px 12px;
    border-radius: 0 18px 18px 0;
    background: var(--ui-page-fill, var(--page));
    box-shadow: var(--shadow-6);
  }
  .ui-as-app:not([data-drawer]) > .ui-as-side {
    visibility: hidden;
    translate: calc(-100% - 24px) 0;
    transition: translate var(--motion-slow-exit) var(--ease-exit), visibility 0s var(--motion-slow-exit);
  }
  .ui-as-app[data-drawer] > .ui-as-side {
    visibility: visible;
    opacity: 1;
    translate: 0 0;
    transition: translate var(--motion-slow) var(--ease-slow), visibility 0s;
  }
  .ui-as-app > .ui-as-scrim {
    display: block;
    position: absolute;
    z-index: 45;
    inset: 0;
    background: rgba(0, 0, 0, 0.28);
    visibility: hidden;
    opacity: 0;
    transition: opacity var(--motion-moderate-exit) var(--ease-exit), visibility 0s var(--motion-moderate-exit);
  }
  .ui-as-app:is([data-drawer], [data-end-drawer]) > .ui-as-scrim { visibility: visible; opacity: 1; transition: opacity var(--motion-slow) var(--ease-slow), visibility 0s; }
  /* The drawer from the right mirrors the sidebar's: over everything, the stage's glow included */
  .ui-as-app > .ui-as-end {
    position: absolute;
    z-index: 50;
    top: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    width: min(400px, calc(100% - 56px));
    overflow: hidden;
    border-radius: 18px 0 0 18px;
    background: var(--panel);
    box-shadow: var(--shadow-6);
    visibility: hidden;
    translate: calc(100% + 24px) 0;
    transition: translate var(--motion-slow-exit) var(--ease-exit), visibility 0s var(--motion-slow-exit);
  }
  .ui-as-app[data-end-drawer] > .ui-as-end { visibility: visible; translate: 0 0; transition: translate var(--motion-slow) var(--ease-slow), visibility 0s; }
  :where(.dark, [data-theme="dark"]) .ui-as-app > .ui-as-scrim { background: rgba(0, 0, 0, 0.55); }
  /* The icon to open it always waits in the top left corner of the panel */
  .ui-as-app:not([data-drawer]) > .ui-as-side-open {
    visibility: visible;
    opacity: 1;
    transition: opacity var(--motion-moderate) var(--ease-moderate) 160ms, visibility 0s;
  }
  /* It stays put while the panel scrolls, so it gets the panel's color behind it */
  .ui-as-app > .ui-as-side-open { left: calc(var(--frame-gap) + 9px); background: var(--panel); }
  .ui-as-app > .ui-as-side-open:hover { background: var(--chip); }

  /* Page parts: less padding, toolbars wrap */
  .ui-as-page { padding: 46px 24px 48px; }
  /* File cards fill the cells of the grids the screens switch to */
  .ui-as-main .ui-as-file-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
  .ui-as-main .ui-as-file-grid .ui-as-template { width: 100%; }
  .ui-as-main .ui-as-file-grid .ui-as-template__name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .ui-as-main .ui-as-file-grid .ui-as-meta { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .ui-as-main .ui-as-file-grid .ui-as-meta svg { display: inline-block; vertical-align: -2px; }
  .ui-as-toolbar { flex-wrap: wrap; row-gap: 10px; }
  .ui-as-toolbar__right { flex-wrap: wrap; }
  .ui-as-section-head[data-inline] { flex-wrap: wrap; row-gap: 12px; }
}

@container ui-as (max-width: 600px) {
  .ui-as-app > * { --frame-gap: 6px; }
  .ui-as-app > .ui-as-main { border-radius: 10px; }
  .ui-as-page { padding: 52px 16px 40px; }
  .ui-as-page-title { font-size: 20px; line-height: 26px; }
  .ui-as-section-head { margin-top: 32px; }
  /* Toolbars: tabs on their own line, the tools below; search takes what is left */
  .ui-as-toolbar__left, .ui-as-toolbar__right { width: 100%; }
  .ui-as-toolbar__right .ui-as-search { order: 9; flex: 1 1 100%; width: auto !important; }
  .ui-as-toolbar__right > .ui-button:last-child { margin-left: auto; }
  .ui-as-tabs { max-width: 100%; overflow-x: auto; scrollbar-width: none; }
  .ui-as-tabs__tab { flex: none; }
  .ui-as-empty { padding: 36px 18px 40px; }
  .ui-as-popover--filter .ui-fm { width: 300px; }
  .ui-as-main .ui-as-file-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 10px; }
  .ui-as-main .ui-as-file-grid .ui-as-template__preview { height: 128px; }
}

/* Narrow with an aside (the workspace's conversation): the panel keeps the full width, framed like the desktop's, and
   the aside waits off screen to the right. Opened, it slides in and pushes the panel left by its own width – a phone's
   all the way out, a tablet's still showing its left part, dimmed, where a tap brings it back. Attributes rather than
   the container query, since the app can't restyle its own grid from one */
.ui-as-aside-scrim { display: none; }
.ui-as-app[data-narrow][data-aside] { overflow: clip; grid-template-columns: minmax(0, 1fr); }
.ui-as-app[data-narrow][data-aside] > * { --ui-as-aside-width: min(26rem, 100cqi); }
.ui-as-app[data-narrow][data-aside] > :is(.ui-as-main, .ui-as-aside-scrim, .ui-as-aside) { grid-row: 1; grid-column: 1; }
.ui-as-app[data-narrow][data-aside] > :is(.ui-as-main, .ui-as-aside-scrim) {
  margin: var(--frame-gap);
  transition: margin-left var(--motion-slow) var(--ease-slow), translate var(--motion-slow-exit) var(--ease-exit), visibility 0s var(--motion-slow-exit);
}
.ui-as-app[data-narrow][data-aside] > .ui-as-aside-scrim { display: block; z-index: 2; visibility: hidden; cursor: pointer; }
.ui-as-app[data-narrow][data-aside] > .ui-as-aside {
  z-index: 3;
  justify-self: end;
  width: var(--ui-as-aside-width);
  visibility: hidden;
  translate: 100% 0;
  transition: translate var(--motion-slow-exit) var(--ease-exit), visibility 0s var(--motion-slow-exit);
}
.ui-as-app[data-narrow][data-aside-open] > :is(.ui-as-main, .ui-as-aside-scrim) {
  translate: calc(-1 * var(--ui-as-aside-width)) 0;
  transition: margin-left var(--motion-slow) var(--ease-slow), translate var(--motion-slow) var(--ease-slow), visibility 0s;
}
.ui-as-app[data-narrow][data-aside-open] > .ui-as-aside-scrim { visibility: visible; }
.ui-as-app[data-narrow][data-aside-open] > .ui-as-aside { visibility: visible; translate: 0 0; transition: translate var(--motion-slow) var(--ease-slow), visibility 0s; }
/* A stage's glow lies over everything; while the stage is pushed aside it fades */
.ui-as-app[data-narrow] > .ui-as-light { transition: opacity var(--motion-slow) var(--ease-slow); }
.ui-as-app[data-narrow][data-aside-open] > .ui-as-light { opacity: 0; }
/* The sidebar's button belongs to the panel, so it leaves with it */
.ui-as-app[data-narrow][data-aside-open] > .ui-as-side-open { visibility: hidden; opacity: 0; transition: opacity var(--motion-moderate-exit) var(--ease-exit), visibility 0s var(--motion-moderate-exit); }
@media (prefers-reduced-motion: reduce) {
  .ui-as-app[data-narrow][data-aside] > :is(.ui-as-main, .ui-as-aside-scrim, .ui-as-aside) { transition-duration: 0s; }
}
`;
