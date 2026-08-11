import { createFileRoute, Link } from "@tanstack/react-router";
import { Badge, InputCopy } from "@dojocho/ui";
import { useEffect, useState } from "react";
import { StartsFinishesProgress, StuckChart } from "@/components/marketplace/course-progress";
import { getMarketplaceCourses, type MarketplaceCourse } from "@/lib/courses";

export const Route = createFileRoute("/courses/$source/$slug")({ component: CourseDetailPage });

function CourseDetailPage() {
  const { source, slug } = Route.useParams();
  const [course, setCourse] = useState<MarketplaceCourse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMarketplaceCourses()
      .then((courses) => {
        const match = courses.find((item) => item.source === source && item.slug === slug);
        if (!match) throw new Error("Course not found.");
        if (active) setCourse(match);
      })
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Unable to load course."));
    return () => { active = false; };
  }, [source, slug]);

  if (error) return <main className="mx-auto max-w-5xl px-6 py-16"><p role="alert">{error}</p></main>;
  if (!course) return <main className="mx-auto max-w-5xl px-6 py-16 text-muted-foreground">Loading course…</main>;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-dashed border-border">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-6">
          <Link to="/" className="text-sm text-muted-foreground transition-colors duration-80 hover:text-foreground">← All courses</Link>
        </div>
      </header>
      <article className="mx-auto grid max-w-5xl gap-12 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-[#6B97FF]">{course.source}</p>
          <h1 className="mt-3 text-4xl font-medium tracking-tight">{course.name}</h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{course.description}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            {course.categories.map((category) => <Badge key={category} color="gray">{category}</Badge>)}
          </div>
          <div className="mt-12 border-y border-dashed border-border py-6">
            <h2 className="text-sm font-medium">Where senpais get stuck</h2>
            <p className="mt-1 text-xs text-muted-foreground">Active course instances at each reached kata.</p>
            <div className="mt-6"><StuckChart points={course.metrics.kataProgress} /></div>
          </div>
        </div>
        <aside className="border-l border-dashed border-border pl-6">
          <InputCopy label="Install" value={`dojo add ${course.installUrl}`} variant="button" />
          <dl className="mt-8 space-y-4 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Katas</dt><dd>{course.kataCount}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Installs</dt><dd>{course.metrics.installs}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Progressing</dt><dd>{course.metrics.progressing}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Completed</dt><dd>{course.metrics.finished}</dd></div>
          </dl>
          <p className="mt-6 text-sm text-muted-foreground">{course.metrics.finished} finished</p>
          <div className="mt-3">
            <StartsFinishesProgress started={course.metrics.started} finished={course.metrics.finished} />
          </div>
        </aside>
      </article>
    </main>
  );
}
