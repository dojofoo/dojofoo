import { useState, type ReactNode, type Ref } from "react";
import { paneViewTransition } from "../lib/view-transition";
import { ContentSettings } from "../components/content-settings";
import type { ContentKind } from "../lib/content-preferences";
import { AppShell, Icon, type AppShellProps } from "../components/app-shell";
import { Breadcrumbs, type Crumb } from "../components/breadcrumbs";
import { CommandPalette } from "../components/command-palette";
import type { CommandGroup } from "../components/command-menu";
import { Cancel01Icon, ChatAiIcon, EvalsIcon, Settings04Icon } from "../lib/icons";
import { learningWorkspaceCss as css } from "../lib/learning-workspace-styles";

/** Controlled editor/material/conversation layout; applications own all content and requests. */
export function AgentChatWorkspace({ crumbs, editor, details, evals, header, composer, children, scroller, defaultSettingsOpen = false, defaultEvalsOpen = false, contentKind = "code", commands = [], onCommand, askAssistant = true, ...shell }: Omit<AppShellProps, "children" | "aside" | "asideColumns" | "asideCovered"> & {
  /** The trail in the window's toolbar – e.g. the mode, then the chapter; "Evals" follows while they are open */
  crumbs: Crumb[];
  editor: ReactNode;
  /** About what is open, e.g. the current lesson. Frames the editor as a 16:9 card with this below it, like the composer;
      without an editor (a course's page with no video) it fills the window */
  details?: ReactNode;
  /** The evaluations; the checklist button in the toolbar swaps them in for the IDE */
  evals?: ReactNode;
  header: ReactNode;
  composer: ReactNode;
  children: ReactNode;
  scroller?: Ref<HTMLDivElement>;
  /** Only offer a free-form question when the host can accept one. */
  askAssistant?: boolean;
  /** Start with the settings (the brief) open */
  defaultSettingsOpen?: boolean;
  /** The current content determines which settings section opens. */
  contentKind?: ContentKind;
  /** Start with the evaluations in place of the IDE */
  defaultEvalsOpen?: boolean;
  /** More groups for the command menu (⌥K or the sidebar's search), after the workspace's own */
  commands?: CommandGroup[];
  /** Runs a command from those groups, or "ask" with the typed text */
  onCommand?: (id: string, query?: string) => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(defaultSettingsOpen);
  const toggleSettings = () => paneViewTransition(() => setSettingsOpen((open) => !open));
  const [chatHidden, setChatHidden] = useState(false);
  // Narrow screens keep their separate conversation drawer.
  const [chatOpen, setChatOpen] = useState(false);
  const [evalsOpen, setEvalsOpen] = useState(defaultEvalsOpen);
  const showEvals = Boolean(evals) && evalsOpen;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const workspaceCommands: CommandGroup = { id: "workspace", label: "Workspace", commands: [
    ...(evals ? [{ id: "workspace:evals", label: evalsOpen ? "Show the editor" : "Show evals", icon: <Icon icon={EvalsIcon} size={16} />, keywords: "evaluation results trial" }] : []),
    { id: "workspace:settings", label: settingsOpen ? "Hide settings" : "Show settings", icon: <Icon icon={Settings04Icon} size={16} />, keywords: "brief" },
  ] };
  const runCommand = (id: string, query?: string) => {
    if (id === "workspace:evals") setEvalsOpen(open => !open);
    else if (id === "workspace:settings") toggleSettings();
    else onCommand?.(id, query);
  };
  const conversation = <section aria-label="Course conversation" className="ui-as-chat__main" data-surface="page">
    <header className="ui-as-chat__bar">
      {header}
      <button type="button" className="ui-as-icon-btn ui-as-chat__close ui-as-chat__wide" aria-label="Close chat" onClick={() => paneViewTransition(() => setChatHidden(true))}>
        <Icon icon={Cancel01Icon} size={15} />
      </button>
      <button type="button" className="ui-as-icon-btn ui-as-chat__close ui-as-chat__narrow" aria-label="Close chat" onClick={() => paneViewTransition(() => setChatOpen(false))}>
        <Icon icon={Cancel01Icon} size={15} />
      </button>
    </header>
    <div ref={scroller} className="ui-as-chat__thread scroll-fade"><div className="ui-as-chat__column">{children}</div></div>
    <div className="ui-as-chat__composer">{composer}</div>
  </section>;
  // The app's split: IDE and conversation in the golden ratio. Opened, the brief takes the conversation's column.
  // Only the conversation has a floor: where the shell is too narrow for the split (900px up to about 1120px, with the
  // sidebar open), the IDE gives way, never the page – its content answers to its own width
  return <AppShell {...shell} onSearch={() => setPaletteOpen(true)} aside={conversation} asideColumns="minmax(0, 1.618fr) minmax(22rem, 1fr)" asideCovered={settingsOpen} asideHidden={chatHidden} asideOpen={chatOpen} onAsideOpenChange={open => paneViewTransition(() => setChatOpen(open))}
    // Narrow, the settings are a drawer from the right, like the sidebar's; wide, they cover the conversation's column
    drawer={<ContentSettings kind={contentKind} onClose={() => paneViewTransition(() => setSettingsOpen(false))} />} drawerOpen={settingsOpen} onDrawerOpenChange={open => paneViewTransition(() => setSettingsOpen(open))}>
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} groups={[...commands, workspaceCommands]} onRun={runCommand} assistant={askAssistant} placeholder="Search lessons, files and commands…" />
    <style href="ui-screen-agent-chat" precedence="default">{css}</style>
    <div className="ui-as-chat" data-brief={settingsOpen || undefined}>
      <section aria-label="Course editor" className="ui-as-chat__main ui-as-chat__ide">
        <header className="ui-as-chat__bar">
          <span className="ui-as-chat__crumbs">
            <Breadcrumbs items={showEvals ? [...crumbs.slice(0, -1), { ...crumbs[crumbs.length - 1], onClick: () => setEvalsOpen(false) }, { label: "Evals" }] : crumbs} />
          </span>
          <span className="ui-as-chat__tools">
            {evals && <button type="button" className="ui-as-icon-btn" aria-label={evalsOpen ? "Hide evals" : "Show evals"} aria-pressed={evalsOpen} onClick={() => setEvalsOpen(open => !open)}>
              <Icon icon={EvalsIcon} size={16} />
            </button>}
            <button type="button" className="ui-as-icon-btn" aria-label={settingsOpen ? "Hide settings" : "Show settings"} aria-pressed={settingsOpen} onClick={toggleSettings}>
              <Icon icon={Settings04Icon} size={16} />
            </button>
            <button type="button" className="ui-as-icon-btn ui-as-chat__wide" aria-label={!chatHidden && !settingsOpen ? "Hide chat" : "Show chat"} aria-pressed={!chatHidden && !settingsOpen}
              onClick={() => paneViewTransition(() => { if (!chatHidden && !settingsOpen) setChatHidden(true); else { setChatHidden(false); setSettingsOpen(false); } })}>
              <Icon icon={ChatAiIcon} size={16} />
            </button>
            <button type="button" className="ui-as-icon-btn ui-as-chat__narrow" aria-label="Show chat" onClick={() => paneViewTransition(() => { setSettingsOpen(false); setChatOpen(true); })}>
              <Icon icon={ChatAiIcon} size={16} />
            </button>
          </span>
        </header>
        {showEvals ? <div className="ui-as-chat__evals scroll-fade" aria-label="Evals" role="region">{evals}</div>
          : <div className="ui-as-chat__editor" data-details={details ? "" : undefined}>
            {details ? <>{editor && <div className="ui-as-chat__code">{editor}</div>}<div className="ui-as-chat__details scroll-fade">{details}</div></> : editor}
          </div>}
      </section>
    </div>
  </AppShell>;
}
