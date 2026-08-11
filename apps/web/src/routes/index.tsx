import { createFileRoute } from "@tanstack/react-router";
import { CardGroup, Select, SelectContent, SelectItem, SelectTrigger } from "@dojofoo/ui";
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
  const [language, setLanguage] = useState("all");
  const [framework, setFramework] = useState("all");
  const [sortBy, setSortBy] = useState("popularity");

  const languages = useMemo(
    () => [...new Set(courses.map((course) => course.language))].sort(),
    [courses],
  );
  const frameworks = useMemo(
    () => [...new Set(courses.flatMap((course) => course.framework ? [course.framework] : []))].sort(),
    [courses],
  );
  const visibleCourses = useMemo(() => courses
    .filter((course) => language === "all" || course.language === language)
    .filter((course) => framework === "all" || course.framework === framework)
    .sort((left, right) => {
      if (sortBy === "newest") {
        return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
      }
      if (sortBy === "trending") return left.trendingRank - right.trendingRank;
      return right.installs - left.installs;
    }), [courses, framework, language, sortBy]);

  const languageAvailable = (item: string) => framework === "all"
    || courses.some((course) => course.language === item && course.framework === framework);
  const frameworkAvailable = (item: string) => language === "all"
    || courses.some((course) => course.language === language && course.framework === item);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNavigation />

      <section className="marketplace-lined-frame mx-auto max-w-(--fd-layout-width) px-4 sm:px-5">
        <div className="marketplace-lined-surface grid min-h-[calc(100vh-4rem)] md:grid-cols-[19rem_minmax(0,1fr)]">
          <aside
            aria-label="Dojo filters"
            className="border-b border-dashed border-border bg-surface-1 py-6 md:border-b-0 md:border-r md:py-12"
          >
            <p className="px-4 pb-4 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Filters</p>
            <FilterMenu
              label="Language"
              allLabel="All languages"
              items={languages}
              selected={language}
              onSelect={setLanguage}
              isAvailable={languageAvailable}
            />
            <FilterMenu
              label="Framework"
              allLabel="All frameworks"
              items={frameworks}
              selected={framework}
              onSelect={setFramework}
              isAvailable={frameworkAvailable}
              className="mt-6"
            />
          </aside>

          <div className="min-w-0 px-5 py-12 lg:px-8">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-2xl">
                <h1 className="text-4xl font-medium tracking-tight">Dojos</h1>
                <p className="mt-3 font-prose text-base leading-7 text-muted-foreground">
                  Dojos are AI-assisted courses. Add them via CLI and let your agent guide you through katas, learning material, and interactive teaching dialogues.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
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

function FilterMenu({
  label,
  allLabel,
  items,
  selected,
  onSelect,
  isAvailable,
  className = "",
}: {
  label: string;
  allLabel: string;
  items: string[];
  selected: string;
  onSelect: (value: string) => void;
  isAvailable: (value: string) => boolean;
  className?: string;
}) {
  const options = [{ label: allLabel, value: "all" }, ...items.map((item) => ({ label: item, value: item }))];

  return (
    <section className={className} aria-label={label}>
      <h2 className="px-4 pb-2 text-[13px] text-muted-foreground">{label}</h2>
      <nav>
        {options.map((option, index) => {
          const active = selected === option.value;
          const disabled = option.value !== "all" && !isAvailable(option.value);
          return (
            <button
              key={option.value}
              type="button"
              aria-label={option.label}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onSelect(option.value)}
              className={`marketplace-category flex w-full items-center gap-2.5 border-dashed border-border px-4 py-4 text-left text-[13px] outline-none transition-colors focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[color:var(--focus-ring,#6B97FF)] disabled:cursor-not-allowed disabled:opacity-35 ${
                index === options.length - 1 ? "" : "border-b"
              } ${
                active ? "font-medium text-foreground" : "text-muted-foreground"
              } ${disabled ? "" : "cursor-pointer"}`}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {active && (
                <ArrowRight
                  aria-label="Selected filter"
                  className="size-4 shrink-0 text-foreground"
                  role="img"
                  strokeWidth={1.75}
                />
              )}
            </button>
          );
        })}
      </nav>
    </section>
  );
}
