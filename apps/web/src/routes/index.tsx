import { createFileRoute } from "@tanstack/react-router";
import { CardGroup, Select, SelectContent, SelectItem, SelectTrigger } from "@dojocho/ui";
import { ArrowRight, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { CourseCard } from "@/components/marketplace/course-card";
import { SiteNavigation } from "@/components/layout/site-navigation";
import { loadMarketplaceCourses } from "@/lib/courses.functions";

export const Route = createFileRoute("/")({
  loader: () => loadMarketplaceCourses(),
  staleTime: 60_000,
  component: DojosPage,
});

function DojosPage() {
  const courses = Route.useLoaderData();
  const [category, setCategory] = useState("All");
  const [sortBy, setSortBy] = useState("popularity");

  const categories = useMemo(
    () => ["All", ...new Set(courses.flatMap((course) => course.categories))],
    [courses],
  );
  const visibleCourses = useMemo(() => courses
    .filter((course) => category === "All" || course.categories.includes(category))
    .sort((left, right) => {
      if (sortBy === "newest") {
        return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
      }
      if (sortBy === "trending") return left.trendingRank - right.trendingRank;
      return right.installs - left.installs;
    }), [category, courses, sortBy]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNavigation />

      <section className="marketplace-lined-frame mx-auto max-w-(--fd-layout-width) px-4 sm:px-5">
        <div className="marketplace-lined-surface grid min-h-[calc(100vh-4rem)] md:grid-cols-[19rem_minmax(0,1fr)]">
          <aside
            aria-label="Dojo categories"
            className="border-b border-dashed border-border bg-surface-1 py-6 md:border-b-0 md:border-r md:py-12"
          >
            <p className="px-4 pb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Categories</p>
            <nav className="flex overflow-x-auto md:block md:overflow-visible">
                {categories.map((item, index) => (
                  <button
                    key={item}
                    type="button"
                    aria-label={item}
                    aria-pressed={category === item}
                    onClick={() => setCategory(item)}
                    className={`marketplace-category flex shrink-0 cursor-pointer items-center gap-2.5 border-dashed border-border px-4 py-4 text-left text-[13px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--focus-ring,#6B97FF)] md:w-full ${
                      index === categories.length - 1 ? "" : "border-r md:border-b md:border-r-0"
                    } ${
                      category === item
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">{item}</span>
                    {category === item && (
                      <ArrowRight
                        aria-label="Selected category"
                        className="size-4 shrink-0 text-foreground"
                        role="img"
                        strokeWidth={1.75}
                      />
                    )}
                  </button>
                ))}
            </nav>
          </aside>

          <div className="min-w-0 px-5 py-12 lg:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-2xl">
                <h1 className="text-4xl font-medium tracking-tight">Dojos</h1>
                <p className="mt-3 text-base leading-7 text-muted-foreground">
                  Dojos are AI-assisted courses you work through with your coding agent.
                </p>
              </div>
              <Select value={sortBy} onValueChange={setSortBy} size="compact">
                <SelectTrigger
                  aria-label="Sort dojos"
                  icon={ArrowUpDown}
                  className="min-w-[9.5rem]"
                />
                <SelectContent>
                  <SelectItem index={0} value="newest">Newest</SelectItem>
                  <SelectItem index={1} value="popularity">Popularity</SelectItem>
                  <SelectItem index={2} value="trending">Trending</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-10 min-w-0">
              <CardGroup columns={3} separated proximityHover={false} border="outlined" className="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleCourses.map((course) => <CourseCard key={course.id} course={course} />)}
              </CardGroup>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
