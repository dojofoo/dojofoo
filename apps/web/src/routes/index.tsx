import { createFileRoute } from "@tanstack/react-router";
import { Button, CardGroup } from "@dojocho/ui";
import { useEffect, useMemo, useState } from "react";
import { CourseCard } from "@/components/marketplace/course-card";
import { SiteNavigation } from "@/components/layout/site-navigation";
import { getMarketplaceCourses, type MarketplaceCourse } from "@/lib/courses";

export const Route = createFileRoute("/")({ component: DojosPage });

function DojosPage() {
  const [courses, setCourses] = useState<MarketplaceCourse[]>([]);
  const [category, setCategory] = useState("All");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMarketplaceCourses()
      .then((result) => active && setCourses(result))
      .catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Unable to load courses."));
    return () => { active = false; };
  }, []);

  const categories = useMemo(
    () => ["All", ...new Set(courses.flatMap((course) => course.categories))],
    [courses],
  );
  const visibleCourses = courses.filter((course) => {
    const inCategory = category === "All" || course.categories.includes(category);
    return inCategory;
  });

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNavigation />

      <section className="marketplace-lined-frame mx-auto max-w-(--fd-layout-width) px-4 sm:px-5">
        <div className="marketplace-lined-surface min-h-[calc(100vh-4rem)] px-5 py-12 lg:px-8">
          <div className="max-w-2xl">
            <h1 className="text-4xl font-medium tracking-tight">Dojos</h1>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Dojos are AI-assisted courses you work through with your coding agent.
            </p>
          </div>

          <div className="mt-10 grid gap-8 md:grid-cols-[11rem_minmax(0,1fr)] lg:grid-cols-[12rem_minmax(0,1fr)]">
            <aside aria-label="Dojo categories" className="md:border-r md:border-dashed md:border-border">
              <p className="mb-2 px-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Categories</p>
              <div className="flex overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
                {categories.map((item) => (
                  <Button
                    key={item}
                    type="button"
                    variant="ghost"
                    aria-pressed={category === item}
                    onClick={() => setCategory(item)}
                    className={`shrink-0 justify-start rounded-none border-l px-4 py-3 md:w-full ${
                      category === item
                        ? "border-primary font-medium text-foreground"
                        : "border-transparent text-muted-foreground"
                    }`}
                  >
                    {item}
                  </Button>
                ))}
              </div>
            </aside>

            <div className="min-w-0">
              {error ? (
                <p role="alert" className="border-l-2 border-destructive py-2 pl-4 text-sm text-destructive">{error}</p>
              ) : courses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Loading courses…</p>
              ) : (
                <CardGroup columns={3} separated proximityHover={false} border="outlined" className="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visibleCourses.map((course) => <CourseCard key={course.id} course={course} />)}
                </CardGroup>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
