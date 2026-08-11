import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, CardGroup } from "@dojocho/ui";
import { useEffect, useMemo, useState } from "react";
import { CourseCard } from "@/components/marketplace/course-card";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { getMarketplaceCourses, type MarketplaceCourse } from "@/lib/courses";

export const Route = createFileRoute("/")({ component: CoursesPage });

function CoursesPage() {
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
  const visibleCourses = category === "All"
    ? courses
    : courses.filter((course) => course.categories.includes(category));

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-dashed border-border">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-5 lg:px-8">
          <img src="/logo.svg" alt="dojocho" className="h-4 w-auto" />
          <nav className="ml-auto flex items-center gap-1">
            <Link to="/$" params={{ _splat: "docs" }} className="px-3 py-2 text-sm text-muted-foreground transition-colors duration-80 hover:text-foreground">Docs</Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-14 lg:px-8">
        <div className="max-w-2xl">
          <p className="mb-3 text-xs uppercase tracking-[0.18em] text-[#6B97FF]">Learn with your coding agent</p>
          <h1 className="text-4xl font-medium tracking-tight">Courses</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Install a dojo, solve its katas in your agentic harness or the web UI, and resume from the same checkpoint.
          </p>
        </div>

        <div className="mt-10 flex flex-wrap gap-1 border-y border-dashed border-border py-3">
          {categories.map((item) => (
            <Button
              key={item}
              type="button"
              size="compact"
              variant={category === item ? "secondary" : "ghost"}
              active={category === item}
              onClick={() => setCategory(item)}
            >
              {item}
            </Button>
          ))}
        </div>

        {error ? (
          <p role="alert" className="mt-8 border-l-2 border-destructive py-2 pl-4 text-sm text-destructive">{error}</p>
        ) : courses.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">Loading courses…</p>
        ) : (
          <CardGroup columns={3} separated border="outlined" className="mt-8 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
            {visibleCourses.map((course) => <CourseCard key={course.id} course={course} />)}
          </CardGroup>
        )}
      </section>
    </main>
  );
}
