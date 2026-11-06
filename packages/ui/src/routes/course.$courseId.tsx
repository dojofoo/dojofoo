import { Link } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { Button } from "@dojofoo/uix/components/button";
import { WorkspaceSkeleton } from "@dojofoo/uix/components/workspace-skeleton";
import { CoursePreview } from "@dojofoo/uix/web/course";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { dashboardNavigation, dashboardNavigationKey } from "@/lib/dashboard-navigation";
import { starterCourses } from "@/lib/starter-courses";
import { courseArt } from "@/lib/course-color";

export const Route = createFileRoute("/course/$courseId")({ component: CoursePage });
export type InstalledCourse = { id: string; title: string; workspaceId: string; runId: string; mode: "katas" | "interactive"; kata: string | null;
  description: string; version: string; author?: string; repository?: string; language: string; framework?: string; tags: string[]; lessons: string[] };
function CoursePage() {
  const { courseId } = Route.useParams();
  const navigate = Route.useNavigate();
  const { account } = useAccountMenu();
  const [course, setCourse] = useState<InstalledCourse>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const starter = starterCourses.find(item => item.id === courseId);
  useEffect(() => {
    const controller = new AbortController();
    setCourse(undefined); setError(undefined); setLoading(true);
    void fetch(`/api/control/courses/${encodeURIComponent(courseId)}`, { signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (response.status === 404 && starter) return;
      if (!response.ok) throw new Error(body.error ?? "Could not load the course.");
      if (!controller.signal.aborted) await navigate({ to: "/learn/$runId/{-$lessonId}", params: { runId: body.runId }, replace: true });
    }).catch(cause => { if (!controller.signal.aborted) setError(cause.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [courseId, navigate]);
  const title = course?.title ?? starter?.title ?? courseId;
  const lessons = course?.lessons ?? starter?.lessonTitles ?? [];
  const open = (runId: string) => navigate({ to: "/learn/$runId/{-$lessonId}", params: { runId } });
  async function install() {
    setBusy(true); setError(undefined);
    try {
      const response = await fetch(`/api/control/starters/${encodeURIComponent(courseId)}/install`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await response.json(); if (!response.ok) throw new Error(body.error ?? "Could not install the course.");
      const descriptor = await fetch(`/api/control/courses/${encodeURIComponent(courseId)}`).then(response => response.json()) as InstalledCourse;
      await open(descriptor.runId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { setBusy(false); }
  }
  return <div className="h-dvh"><AppShell {...account} workspace="Dojo" sidebarWidth="18rem" showNews={false} showOnboarding={false}
    brand={<Link to="/" aria-label="Dojo dashboard" className="flex items-center"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></Link>}
    navigation={dashboardNavigation()} navigationKey={dashboardNavigationKey} active="explore"
    onNavigate={id => { if (id === "courses" || id === "explore") void navigate({ to: id === "explore" ? "/explore" : "/" }); }}>
    <div className="mx-auto w-full max-w-6xl px-6">
      {loading ? <WorkspaceSkeleton label="Loading course preview" rows={4} /> : (course || starter) && <CoursePreview
        course={{ name: title, description: course?.description ?? starter?.blurb ?? "", repository: course?.repository ?? "", author: course?.author ?? starter?.author ?? "Local course",
          language: course?.language ?? starter?.language ?? "Other", framework: course?.framework ?? null, mode: course?.mode ?? starter!.mode,
          kataCount: lessons.length, version: course?.version ?? starter?.version ?? "", tags: course?.tags ?? starter?.tags ?? [] }}
        card={{ title, version: course?.version ?? starter?.version ?? "", author: course?.author ?? starter?.author ?? "Local course", lessons: lessons.length, art: starter?.art ?? courseArt(courseId) }} lessons={lessons}>
        <p className="mb-4 text-sm text-(--muted)">{course ? "Installed in your workspace. Continue your learning session." : "Install this course in the folder where you started Dojo to begin."}</p>
        <Button className="justify-self-start" loading={busy} onClick={() => { if (course) void open(course.runId); else void install(); }}>{course ? "Continue learning" : "Install course"}</Button>
      </CoursePreview>}
      {error && <p role="alert" className="p-6 text-sm text-(--destructive)">{error}</p>}
    </div>
  </AppShell></div>;
}
