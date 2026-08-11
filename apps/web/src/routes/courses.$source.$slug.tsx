import { createFileRoute, notFound } from "@tanstack/react-router";
import { Badge, InputCopy } from "@dojocho/ui";
import { StartsFinishesProgress } from "@/components/marketplace/course-progress";
import { ChapterReachChart } from "@/components/marketplace/chapter-reach-chart";
import { SiteNavigation } from "@/components/layout/site-navigation";
import { loadMarketplaceCourses } from "@/lib/courses.functions";

export const Route = createFileRoute("/courses/$source/$slug")({
  loader: async ({ params }) => {
    const courses = await loadMarketplaceCourses();
    const course = courses.find(
      (item) => item.source === params.source && item.slug === params.slug,
    );
    if (!course) throw notFound();
    return course;
  },
  staleTime: 60_000,
  component: CourseDetailPage,
});

function CourseDetailPage() {
  const course = Route.useLoaderData();

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNavigation />
      <div className="marketplace-lined-frame mx-auto max-w-(--fd-layout-width) px-4 sm:px-5">
        <article className="marketplace-lined-surface grid min-h-[calc(100vh-4rem)] gap-12 px-6 py-14 lg:grid-cols-[minmax(0,1fr)_20rem] lg:px-8">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-[#6B97FF]">{course.source}</p>
            <h1 className="mt-3 text-4xl font-medium tracking-tight">{course.name}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">{course.description}</p>
            <p className="mt-3 font-mono text-xs text-muted-foreground">v{course.version}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {course.categories.map((category) => <Badge key={category} color="gray">{category}</Badge>)}
            </div>
            <div className="mt-12 border-y border-dashed border-border py-6">
              <h2 className="text-sm font-medium">Chapter reach</h2>
              <p className="mt-1 text-xs text-muted-foreground">Unique dojo instances that reached each chapter.</p>
              <ChapterReachChart data={course.metrics.kataProgress} className="mt-6 h-64" />
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
      </div>
    </main>
  );
}
