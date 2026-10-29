import { useNavigate } from "@tanstack/react-router";
import { CommandPalette } from "@dojofoo/uix/components/command-palette";
import type { CommandGroup } from "@dojofoo/uix/components/command-menu";

/**
 * The dashboard pages' search (Courses, Explore, Settings): the page's own groups first (its courses, say), then the
 * dashboard's pages, as the sidebar lists them, then Help. A page's own commands go to `onRun`; the rest it handles
 */
export function DashboardPalette({ open, onOpenChange, groups = [], onRun, searchLabel = "Search", placeholder = "Search courses and pages…" }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups?: CommandGroup[];
  onRun?: (id: string) => void;
  searchLabel?: string;
  placeholder?: string;
}) {
  const navigate = useNavigate();
  return <CommandPalette open={open} onOpenChange={onOpenChange} assistant={false} searchLabel={searchLabel} placeholder={placeholder} groups={[
    ...groups,
    { id: "dashboard", label: "Dashboard", commands: [{ id: "page:courses", label: "Courses" }, { id: "page:explore", label: "Explore courses" }] },
    { id: "help", label: "Help", commands: [{ id: "help:docs", label: "Documentation" }] },
  ]} onRun={id => {
    if (id === "page:courses") void navigate({ to: "/" });
    else if (id === "page:explore") void navigate({ to: "/explore" });
    else if (id === "help:docs") window.open("https://dojo.foo/docs", "_blank", "noopener,noreferrer");
    else onRun?.(id);
  }} />;
}
