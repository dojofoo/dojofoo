import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { CourseAppearance } from "@dojofoo/config";
import { AppShell, EmptyState } from "@dojofoo/uix/components/app-shell";
import { BrandLogo } from "@dojofoo/uix/components/brand-logo";
import { Button } from "@dojofoo/uix/components/button";
import { CardFigure, CardMark, CardText, CardTitle, ColorCard } from "@dojofoo/uix/components/color-card";
import { CertificateCard, courseColor } from "@dojofoo/uix/components/course-card";
import type { CoursePosition } from "@/server/control/routes";
import { useAccountMenu } from "@/hooks/use-account-menu";
import { DashboardPalette } from "@/components/dashboard-palette";
import { courseArt } from "@/lib/course-color";
import { dashboardNavigation, dashboardNavigationKey } from "@/lib/dashboard-navigation";

export const Route = createFileRoute("/me")({ component: ProfilePage });

/** The part of GET /api/control/courses this page reads */
type StudiedCourse = { dojo: string; title: string; runId: string | null; language: string; appearance?: CourseAppearance; position?: CoursePosition };

const percent = (position?: CoursePosition) => position ? Math.round(position.completedLessons / position.totalLessons * 100) : 0;

/** The learner's own page: who they are, the courses they study with how far they are, and the courses they finished */
function ProfilePage() {
  const navigate = Route.useNavigate();
  const { account, toast } = useAccountMenu();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [courses, setCourses] = useState<StudiedCourse[]>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/control/courses", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Could not load your courses (${response.status})`);
        setCourses(await response.json() as StudiedCourse[]);
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load your courses."); });
    return () => controller.abort();
  }, []);

  const name = account.user.name;
  const finished = courses?.filter(course => course.position?.complete) ?? [];
  const lessonsDone = courses?.reduce((sum, course) => sum + (course.position?.completedLessons ?? 0), 0) ?? 0;
  const stats: [string, number][] = [["Courses", courses?.length ?? 0], ["Finished", finished.length], ["Lessons done", lessonsDone]];

  return <div className="h-dvh overflow-hidden"><AppShell {...account} workspace="Dojo" sidebarWidth="18rem" showNews={false} showOnboarding={false}
    brand={<Link to="/" aria-label="Dojo dashboard" className="flex items-center"><BrandLogo className="aspect-[2567/1211] h-6 w-auto" /></Link>}
    navigation={dashboardNavigation()} navigationKey={dashboardNavigationKey} active={[]}
    onNavigate={id => { void navigate({ to: id === "explore" ? "/explore" : "/" }); }} onSearch={() => setPaletteOpen(true)}>
    <div className="lj-page" aria-busy={courses === undefined && !error ? true : undefined}>
      <header className="lj-page__head flex flex-wrap items-center gap-5">
        {account.user.avatar
          ? <img src={account.user.avatar} alt="" className="size-16 rounded-full object-cover" />
          : <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-[var(--brand)] text-2xl font-semibold text-white">{name.charAt(0).toUpperCase()}</span>}
        <div className="min-w-0 flex-1">
          <span className="ui-ob-kicker">Profile</span>
          <h1 className="ui-ob-title">{name}</h1>
          {account.user.email && <p className="ui-ob-sub">{account.user.email}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={() => { void navigate({ to: "/settings/$section", params: { section: "profile" }, state: { settingsDepth: 1 } }); }}>Edit profile</Button>
      </header>

      <dl className="mb-10 grid grid-cols-3 gap-3" aria-label="Summary">
        {stats.map(([label, value]) => <div key={label} className="rounded-xl bg-[var(--fluid-hover)] px-4 py-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
        </div>)}
      </dl>

      {error && <div role="alert"><EmptyState title="Could not load your courses" text={error} /></div>}
      {courses === undefined && !error && <p role="status">Loading your courses…</p>}

      {courses && <section aria-label="Courses">
        <h2 className="lj-section">Courses</h2>
        {courses.length === 0
          ? <EmptyState title="No courses yet" text="Courses you start show here with how far you are."
            action={<Button onClick={() => { void navigate({ to: "/explore" }); }}>Explore courses</Button>} />
          : <div className="lj-grid lj-grid--cards">
            {courses.map(course => <ColorCard key={course.dojo} color={courseColor(courseArt(course.dojo, course.appearance))}
              href={course.runId ? `/learn/${encodeURIComponent(course.runId)}` : undefined}
              aria-label={`${course.title}, ${percent(course.position)}% done`}
              header={<CardMark>{course.language}</CardMark>}
              main={<CardTitle>{course.title}</CardTitle>}
              footer={<>
                <CardText label={course.position?.complete ? "Completed" : course.position ? `${course.position.completedLessons} of ${course.position.totalLessons} lessons` : "Not started"} />
                <CardFigure>{percent(course.position)}%</CardFigure>
              </>} progress={percent(course.position)} />)}
          </div>}
      </section>}

      {courses && <section className="lj-courses__next" aria-label="Certificates">
        <h2 className="lj-section">Certificates</h2>
        {finished.length === 0
          ? <EmptyState title="No certificates yet" text="Finish every lesson of a course to earn its certificate." />
          : <div className="lj-grid lj-grid--cards">
            {finished.map(course => <CertificateCard key={course.dojo} certificate={{ id: course.dojo, title: course.title, learner: name,
              lessons: course.position?.totalLessons ?? 0, art: courseArt(course.dojo, course.appearance) }} />)}
          </div>}
      </section>}
    </div>
    <DashboardPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    {toast}
  </AppShell></div>;
}
