import { useMemo, useState } from "react";
import { EmptyState, Icon, MenuButton } from "../components/app-shell";
import { Button } from "../components/button";
import { ArrowUpDownIcon, Cancel01Icon, CoursesIcon, Search01Icon } from "../lib/icons";
import { teachingModes, type TeachingMode, type WebCourse } from "./catalog";
import { CourseTile } from "./course-tile";
import { PageHead, SitePage, useSite } from "./site";

/*
 * Courses: the catalog as a search, laid out as the site's "All dojos" (apps/web/src/routes/dojos.tsx) – on the page,
 * not in a window: the filters in a sidebar (teaching style, language, framework), the search and the sort over the
 * results, and the results as Explore draws them (each course's color card). The query reads a course's name,
 * description, repository, language, framework and tags.
 */

type Sort = "popularity" | "trending" | "newest" | "rating";

const sorts: Array<{ value: Sort; label: string }> = [
  { value: "popularity", label: "Most installed" },
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
  { value: "rating", label: "Top rated" },
];

export function CoursesPage({ courses, initialQuery = "" }: { courses: WebCourse[]; initialQuery?: string }) {
  const links = useSite();
  const [query, setQuery] = useState(initialQuery);
  const [mode, setMode] = useState<TeachingMode | "all">("all");
  const [language, setLanguage] = useState("all");
  const [framework, setFramework] = useState("all");
  const [sort, setSort] = useState<Sort>("popularity");
  const languages = useMemo(() => [...new Set(courses.map((course) => course.language))].sort(), [courses]);
  const frameworks = useMemo(() => [...new Set(courses.flatMap((course) => (course.framework ? [course.framework] : [])))].sort(), [courses]);
  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return courses
      .filter((course) => mode === "all" || course.mode === mode)
      .filter((course) => language === "all" || course.language === language)
      .filter((course) => framework === "all" || course.framework === framework)
      .filter((course) => {
        const text = [course.name, course.description, course.repository, course.language, course.framework ?? "", ...course.tags].join(" ").toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .sort((a, b) => sort === "newest" ? b.publishedAt.localeCompare(a.publishedAt)
        : sort === "trending" ? a.trendingRank - b.trendingRank
        : sort === "rating" ? (b.rating ?? -1) - (a.rating ?? -1)
        : b.metrics.installs - a.metrics.installs);
  }, [courses, query, mode, language, framework, sort]);
  const filtered = query !== "" || mode !== "all" || language !== "all" || framework !== "all";
  const clear = () => { setQuery(""); setMode("all"); setLanguage("all"); setFramework("all"); };

  return (
    <SitePage current="courses" window={false}>
      <div data-course-catalog="" className="mx-auto max-w-[1280px] px-2 pt-10 pb-8 max-[1304px]:px-5">
        <PageHead kicker="Courses" title="Find your dojo" lead="A dojo is an installable free or premium-hosted package with its own sensei. It learns how you learn, then guides you through coding katas, interactive lessons, capstone projects or even interviews." />
        <div className="mt-9 grid grid-cols-[13rem_minmax(0,1fr)] gap-10 max-[761px]:grid-cols-[minmax(0,1fr)] max-[761px]:gap-6">
          <aside className="scroll-fade sticky top-4 grid max-h-[calc(100dvh-32px)] gap-6 self-start overflow-y-auto max-[761px]:static max-[761px]:max-h-none max-[761px]:grid-cols-[auto_minmax(0,1fr)] max-[761px]:gap-x-2.5 max-[761px]:gap-y-3 max-[761px]:overflow-visible max-[761px]:[mask-image:none]" aria-label="Filters">
            <FilterList label="Teaching style" value={mode} onChange={(value) => setMode(value as TeachingMode | "all")}
              options={[{ value: "all", label: "Any" }, ...teachingModes.map((item) => ({ value: item.value, label: item.label, title: item.description }))]} />
            <FilterList label="Language" value={language} onChange={setLanguage} options={[{ value: "all", label: "Any" }, ...languages.map((item) => ({ value: item, label: item }))]} />
            <FilterList label="Framework" value={framework} onChange={setFramework} options={[{ value: "all", label: "Any" }, ...frameworks.map((item) => ({ value: item, label: item }))]} />
          </aside>

          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <label className="flex h-[42px] min-w-0 flex-1 items-center gap-2.5 rounded-[calc(12px*var(--squircle-factor,1))] bg-(--surface-3) pr-2 pl-3.5 text-(--muted) shadow-(--shadow-2) transition-shadow duration-(--motion-fast) ease-(--ease-standard) focus-within:shadow-[var(--shadow-2),0_0_0_2px_var(--accent)] [&_input]:h-full [&_input]:min-w-0 [&_input]:flex-1 [&_input]:border-0 [&_input]:bg-transparent [&_input]:text-sm [&_input]:text-(--ink) [&_input]:outline-none [&_input::placeholder]:text-(--placeholder) [&_input::-webkit-search-cancel-button]:hidden [&_button]:grid [&_button]:size-[26px] [&_button]:place-items-center [&_button]:rounded-[calc(4px*var(--squircle-factor,1))] [&_button:hover]:bg-(--hover) [&_button:hover]:text-(--ink)">
                <Icon icon={Search01Icon} size={16} />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Escape" && setQuery("")}
                  placeholder="Search by name, language, framework or topic" aria-label="Search courses" />
                {query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")}><Icon icon={Cancel01Icon} size={13} /></button>}
              </label>
              <MenuButton label="Sort courses" value={sort} options={sorts.filter(item => item.value !== "rating" || courses.some(course => course.rating !== undefined))} onChange={setSort} icon={ArrowUpDownIcon} className="max-[761px]:size-[42px] max-[761px]:gap-0 max-[761px]:rounded-[calc(12px*var(--squircle-factor,1))] max-[761px]:bg-(--surface-3) max-[761px]:p-0 max-[761px]:text-[0px] max-[761px]:[&>svg:last-child]:hidden" />
            </div>
            <div data-course-count="" className="mt-[18px] mb-3.5 flex min-h-8 items-center gap-2 [&_p]:m-0 [&_p]:flex-1 [&_p]:text-[length:var(--fs-body)] [&_p]:text-(--muted) [&_b]:font-[550] [&_b]:text-(--ink)">
              <p aria-live="polite">{results.length === 1 ? "1 course" : `${results.length} courses`}{query && <> for <b>“{query.trim()}”</b></>}</p>
              {filtered && <Button variant="ghost" size="sm" onClick={clear}>Clear filters</Button>}
            </div>
            {results.length > 0 ? (
              <div data-course-grid="" className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,14.5rem),1fr))] gap-x-4 gap-y-5">{results.map((course) => <CourseTile key={course.id} course={course} href={links.courseHref(course)} onOpen={links.openCourse} />)}</div>
            ) : (
              <EmptyState icon={CoursesIcon} title="No courses found" text="Don’t panic – we’re creating new ones. Try another word, or clear the filters." action={<Button variant="secondary" size="sm" onClick={clear}>Clear filters</Button>} tall />
            )}
          </div>
        </div>
      </div>
    </SitePage>
  );
}

/** A filter as the site's sidebar has them: its name, then its choices, the picked one marked */
function FilterList({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string; title?: string }> }) {
  return (
    <nav className="grid gap-px max-[761px]:col-span-full max-[761px]:grid-cols-subgrid max-[761px]:items-center" aria-label={label}>
      <span className="mb-1.5 ml-2.5 text-[length:var(--fs-caption)] font-semibold tracking-[0.05em] text-(--muted) uppercase max-[761px]:m-0">{label}</span>
      {/* The choices on their own, so on a phone they scroll sideways under a name that stays */}
      <div className="scroll-fade-x grid gap-px min-[761px]:[mask-image:none] max-[761px]:flex max-[761px]:gap-1 max-[761px]:overflow-x-auto max-[761px]:overscroll-x-contain max-[761px]:[scrollbar-width:none]">
        {options.map((option) => (
          <button key={option.value} type="button" className="h-[30px] rounded-[calc(8px*var(--squircle-factor,1))] px-2.5 text-left text-[length:var(--fs-subtitle)] text-(--muted) transition-colors duration-(--motion-fast) ease-(--ease-standard) hover:bg-(--hover) hover:text-(--ink) aria-pressed:bg-(--select) aria-pressed:font-[550] aria-pressed:text-(--ink) aria-pressed:hover:bg-(--select) max-[761px]:flex-none"
            aria-pressed={option.value === value} title={option.title} onClick={() => onChange(option.value)}>{option.label}</button>
        ))}
      </div>
    </nav>
  );
}
