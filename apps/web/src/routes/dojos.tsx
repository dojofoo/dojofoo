import { createFileRoute } from "@tanstack/react-router";
import { CardGroup, Select, SelectContent, SelectItem, SelectTrigger } from "@dojofoo/ui";
import { ArrowUpDown, Search } from "@mynaui/icons-react";
import { useMemo, useState } from "react";
import { CourseCard } from "@/components/marketplace/course-card";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteNavigation } from "@/components/layout/site-navigation";
import { loadMarketplaceCourses } from "@/lib/courses.functions";

export const Route = createFileRoute("/dojos")({
  loader: () => loadMarketplaceCourses(),
  staleTime: 60_000,
  component: DojosPage,
});

function DojosPage() {
  const courses = Route.useLoaderData();
  const [styleFilter, setStyleFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("all");
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [courseQuery, setCourseQuery] = useState("");
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
    .filter((course) => styleFilter === "all" || course.mode === styleFilter)
    .filter((course) => languageFilter === "all" || course.language === languageFilter)
    .filter((course) => frameworkFilter === "all" || course.framework === frameworkFilter)
    .filter((course) => {
      const query = courseQuery.trim().toLowerCase();
      if (!query) return true;
      return [course.name, course.description, course.repository, course.language, course.framework, ...course.tags]
        .filter(Boolean)
        .some((value) => value?.toLowerCase().includes(query));
    })
    .sort((left, right) => {
      if (sortBy === "newest") {
        return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
      }
      if (sortBy === "trending") return left.trendingRank - right.trendingRank;
      return right.installs - left.installs;
    }), [courseQuery, courses, frameworkFilter, languageFilter, sortBy, styleFilter]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNavigation />
      <div className="marketplace-lined-frame mx-auto max-w-(--fd-layout-width) px-4 sm:px-5">
        <div className="marketplace-lined-surface">
          <section className="flex min-h-[calc(100vh-4rem)] flex-col border-border border-t [border-top-style:dashed]" id="dojos">
          <div className="flex min-w-0 flex-1 flex-col px-5 py-12 lg:px-8">
            <div className="max-w-2xl">
              <h1 className="text-4xl font-medium tracking-tight">All dojos</h1>
              <p className="mt-3 font-prose text-base leading-7 text-muted-foreground">
                Dojos are AI-assisted courses. Add them via CLI and let your agent guide you through katas, learning material, and interactive teaching dialogues.
              </p>
            </div>

            <div className="mt-9 grid flex-1 border-y border-dashed border-border lg:grid-cols-[15rem_minmax(0,1fr)]">
              <aside className="border-border border-b py-5 [border-bottom-style:dashed] lg:border-r lg:border-b-0 lg:[border-right-style:dashed]">
                <MarketplaceFilterGroup
                  label="Teaching style"
                  onValueChange={setStyleFilter}
                  options={[
                    { label: "Any", value: "all" },
                    { label: "Katas", value: "katas" },
                    { label: "Interactive", value: "interactive" },
                    { label: "Explorative", value: "explorative" },
                    { label: "Mentor", value: "mentor" },
                  ]}
                  value={styleFilter}
                />
                <MarketplaceFilterGroup
                  className="mt-7"
                  label="Framework / Lang"
                  onValueChange={setLanguageFilter}
                  options={[
                    { label: "Any", value: "all" },
                    ...languages.map((language) => ({ label: language, value: language })),
                  ]}
                  value={languageFilter}
                />
                {frameworks.length ? (
                  <MarketplaceFilterGroup
                    className="mt-7"
                    label="Framework"
                    onValueChange={setFrameworkFilter}
                    options={[
                      { label: "Any framework", value: "all" },
                      ...frameworks.map((framework) => ({ label: framework, value: framework })),
                    ]}
                    value={frameworkFilter}
                  />
                ) : null}
              </aside>

              <div className="min-w-0">
                <div className="flex items-stretch border-border border-b [border-bottom-style:dashed]">
                  <label className="relative min-w-0 flex-1">
                    <span className="sr-only">Search courses</span>
                    <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      className="h-12 w-full bg-background pr-5 pl-11 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:bg-muted/30"
                      onChange={(event) => setCourseQuery(event.target.value)}
                      placeholder="Search dojos"
                      type="search"
                      value={courseQuery}
                    />
                  </label>
                  <div className="flex items-center border-border border-l px-2 [border-left-style:dashed]">
                    <Select value={sortBy} onValueChange={setSortBy} size="compact">
                      <SelectTrigger aria-label="Sort dojos" icon={ArrowUpDown} className="min-w-[9.5rem]" />
                      <SelectContent>
                        <SelectItem index={0} value="newest">Newest</SelectItem>
                        <SelectItem index={1} value="popularity">Popularity</SelectItem>
                        <SelectItem index={2} value="trending">Trending</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="min-w-0 p-5 lg:p-7">
                  {visibleCourses.length > 0 ? (
                    <CardGroup columns={3} separated proximityHover={false} border="outlined" className="grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {visibleCourses.map((course) => <CourseCard key={course.id} course={course} />)}
                    </CardGroup>
                  ) : (
                    <div className="grid min-h-52 place-items-center border border-dashed border-border p-6 text-center">
                      <div>
                        <p className="font-medium">No dojos found (don't panic - we're creating new ones)</p>
                        <button
                          className="mt-2 px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
                          onClick={() => {
                            setStyleFilter("all");
                            setLanguageFilter("all");
                            setFrameworkFilter("all");
                            setCourseQuery("");
                          }}
                          type="button"
                        >
                          Clear filters
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          </section>
          <SiteFooter />
        </div>
      </div>
    </main>
  );
}

type MarketplaceFilterOption = {
  label: string;
  value: string;
};

function MarketplaceFilterGroup({
  className = "",
  label,
  onValueChange,
  options,
  value,
}: {
  className?: string;
  label: string;
  onValueChange: (value: string) => void;
  options: readonly MarketplaceFilterOption[];
  value: string;
}) {
  return (
    <nav aria-label={label} className={className}>
      <p className="px-4 font-display text-xs font-medium text-muted-foreground uppercase tracking-[0.14em]">
        {label}
      </p>
      <div className="mt-2 flex flex-col">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              aria-pressed={active}
              className={`px-4 py-1.5 text-left text-sm transition-colors ${active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              key={option.value}
              onClick={() => onValueChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
