import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@dojofoo/uix/components/app-shell";
import { WorkspaceSkeleton } from "@dojofoo/uix/components/workspace-skeleton";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { categoryIcons } from "@dojofoo/uix/components/app-directory";
import { CourseExplore } from "@dojofoo/uix/containers/course-explore";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { DashboardPalette } from "@/components/dashboard-palette";
import { dashboardNavigation, dashboardNavigationKey } from "@/lib/dashboard-navigation";
import { starterCourses } from "@/lib/starter-courses";

export const Route = createFileRoute("/explore")({ component: ExplorePage });

function ExplorePage() {
  const navigate = Route.useNavigate();
  const { account, toast } = useAccountMenu();
  const [installed, setInstalled] = useState<{ dojo: string; runId: string }[]>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/control/courses", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Could not load installed courses.");
      return response.json();
    }).then(setInstalled)
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message); });
    return () => controller.abort();
  }, []);
  const open = (courseId: string) => {
    const course = installed?.find(item => item.dojo === courseId);
    if (course) void navigate({ to: "/learn/$runId", params: { runId: course.runId } });
    else void navigate({ to: "/course/$courseId", params: { courseId } });
  };


  return <div className="h-dvh overflow-hidden"><AppShell {...account} workspace="Dojo" sidebarWidth="18rem" showNews={false} showOnboarding={false}
    brand={<Link to="/" aria-label="Dojo dashboard" className="flex items-center"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></Link>}
    navigationKey={dashboardNavigationKey} active="explore" navigation={dashboardNavigation()} onNavigate={id => { void navigate({ to: id === "explore" ? "/explore" : "/" }); }}
    onSearch={() => setPaletteOpen(true)}>
    {!installed ? <WorkspaceSkeleton label="Loading courses" rows={4} /> : <CourseExplore courses={starterCourses.map(item => ({ ...item, mark: <BrandLogo mono /> }))} featuredId="how-to-run-a-dojo"
      categories={[
        { id: "all", label: "All courses", icon: categoryIcons.all },
        { id: "getting-started", label: "Getting started", icon: categoryIcons.development },
        { id: "authoring", label: "Authoring", icon: categoryIcons.product },
      ]}
      description="Two starter courses to help you find your way and create something of your own."
      installed={installed.map(item => item.dojo)} onOpen={open} onPreview={open} />}
    {error && <p role="alert">{error}</p>}

    <DashboardPalette open={paletteOpen} onOpenChange={setPaletteOpen} searchLabel="Search courses" placeholder="Search courses and pages…"
      groups={[{ id: "explore", label: "Courses in Explore", commands: starterCourses.map(item => ({ id: `install:${item.id}`, label: item.title, keywords: item.blurb })) }]}
      onRun={id => { if (id.startsWith("install:")) open(id.slice(8)); }} />
    {toast}
  </AppShell></div>;
}
