import { useEffect, useState } from "react";
import { Button } from "@dojofoo/uix/components/button";
import { MenuButton } from "@dojofoo/uix/components/app-shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@dojofoo/ui/dialog";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { categoryIcons } from "@dojofoo/uix/components/app-directory";
import { CourseExplore } from "@dojofoo/uix/containers/course-explore";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { DashboardPalette } from "@/components/dashboard-palette";
import { dashboardNavigation, dashboardNavigationKey } from "@/lib/dashboard-navigation";
import { starterCourses } from "@/lib/starter-courses";

export const Route = createFileRoute("/explore")({
  validateSearch: (search: Record<string, unknown>): { course?: string } =>
    typeof search.course === "string" && starterCourses.some(item => item.id === search.course) ? { course: search.course } : {},
  component: ExplorePage,
});

function ExplorePage() {
  const navigate = Route.useNavigate();
  const { account, toast } = useAccountMenu();
  const [workspaces, setWorkspaces] = useState<{ id: string; path: string }[]>([]);
  const [installed, setInstalled] = useState<{ workspaceId: string; courseId: string }[]>([]);
  const courseId = Route.useSearch().course ?? null;
  const [workspaceId, setWorkspaceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    const read = async (path: string) => {
      const response = await fetch(`/api/control/${path}`, { signal: controller.signal });
      if (!response.ok) throw new Error("Could not load your workspaces and installed courses.");
      return response.json();
    };
    void Promise.all([read("workspaces"), read("starters")]).then(([workspaces, courses]) => {
      setWorkspaces(workspaces); setInstalled(courses);
    }).catch(cause => { if (!controller.signal.aborted) setError(String(cause.message ?? cause)); });
    return () => controller.abort();
  }, []);
  const choose = (id: string) => { setWorkspaceId(""); void navigate({ search: { course: id }, replace: true }); };
  const close = () => { void navigate({ search: { course: undefined }, replace: true }); };
  const alreadyInstalled = installed.some(item => item.courseId === courseId && item.workspaceId === workspaceId);
  const enter = async () => {
    if (!courseId || !workspaceId || busy) return;
    setBusy(true); setError(undefined);
    try {
      const discovery = await fetch("/api/control/starters");
      if (!discovery.ok) throw new Error("Could not check installed courses. Try again.");
      const current: typeof installed = await discovery.json();
      setInstalled(current);
      if (!current.some(item => item.courseId === courseId && item.workspaceId === workspaceId)) {
        const response = await fetch(`/api/control/starters/${encodeURIComponent(courseId)}/install`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspaceId }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not install the course.");
        setInstalled(previous => [...previous, { courseId, workspaceId }]);
      }
      await navigate({ to: "/interactive", search: { workspace: workspaceId, course: courseId } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  };

  return <div className="h-dvh overflow-hidden"><AppShell {...account} workspace="Dojo" sidebarWidth="18rem" showNews={false} showOnboarding={false}
    brand={<a href="/" aria-label="Dojo dashboard" className="flex items-center"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></a>}
    navigationKey={dashboardNavigationKey} active="explore" navigation={dashboardNavigation()} onNavigate={id => { void navigate({ to: id === "explore" ? "/explore" : "/" }); }}
    onSearch={() => setPaletteOpen(true)}>
    <CourseExplore courses={starterCourses.map(item => ({ ...item, mark: <BrandLogo mono /> }))} featuredId="how-to-run-a-dojo"
      categories={[
        { id: "all", label: "All courses", icon: categoryIcons.all },
        { id: "getting-started", label: "Getting started", icon: categoryIcons.development },
        { id: "authoring", label: "Authoring", icon: categoryIcons.product },
      ]}
      description="Two starter courses to help you find your way and create something of your own."
      installed={[...new Set(installed.map(item => item.courseId))]} onInstall={choose} onOpen={choose} />
    {error && !courseId && <p role="alert">{error}</p>}
    <Dialog open={courseId !== null} onOpenChange={open => { if (!open && !busy) close(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{starterCourses.find(item => item.id === courseId)?.title}</DialogTitle>
          <DialogDescription>Choose the workspace where you want to learn. Existing course edits are preserved.</DialogDescription></DialogHeader>
        <MenuButton label="Course workspace" align="start" value={workspaceId} onChange={setWorkspaceId} disabled={busy}
          options={workspaces.map(item => ({ value: item.id, label: item.path }))} />
        {!workspaces.length && <p>Open Dojo from an existing workspace to install a course.</p>}
        {error && <p role="alert">{error}</p>}
        <DialogFooter><Button variant="ghost" disabled={busy} onClick={close}>Cancel</Button>
          <Button disabled={!workspaceId || busy} loading={busy} onClick={() => void enter()}>{alreadyInstalled ? "Open course" : "Install course"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <DashboardPalette open={paletteOpen} onOpenChange={setPaletteOpen} searchLabel="Search courses" placeholder="Search courses and pages…"
      groups={[{ id: "explore", label: "Courses in Explore", commands: starterCourses.map(item => ({ id: `install:${item.id}`, label: item.title, keywords: item.blurb })) }]}
      onRun={id => { if (id.startsWith("install:")) choose(id.slice(8)); }} />
    {toast}
  </AppShell></div>;
}
