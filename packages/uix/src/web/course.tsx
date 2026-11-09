import { NavigationLink } from "../components/navigation-link";
import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Icon } from "../components/icon";
import { BrandLogo } from "../components/brand-logo";
import { ButtonLink } from "../components/button";
import { CourseCard } from "../components/course-card";
import { SegmentedControl } from "../components/segmented-control";
import { ArrowLeft01Icon, BookOpen01Icon } from "../lib/icons";
import { cardInfo, compactNumber, installCommand, installPrompt, teachingModes, type CourseAudit, type WebCourse } from "./catalog";
import { CommandCopy, SitePage, useSite } from "./site";

/*
 * A course's page, as skills.sh lays out a skill's: its course card beside what it is, how to
 * install it – the command, or a prompt that has your agent install and start it – and its numbers as the site shows
 * them today (apps/web/src/routes/courses.$source.$slug.tsx): started against finished, then a chart of how many
 * projects reach and finish each lesson or chapter (the weekly installs are the sparkline beside it). Beside it all, what you'd check before installing: installs,
 * the repository, its stars, when the marketplace first saw it, and the security audits of its files. The charts are
 * Dojofoo's: its pink and its neutrals.
 */

const longDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const installWays = ["Command", "Prompt"] as const;

export function CoursePage({ course }: { course: WebCourse }) {
  const links = useSite();
  const [way, setWay] = useState<(typeof installWays)[number]>("Command");
  const { metrics } = course;
  const command = installCommand(course);
  const prompt = installPrompt(course);
  const mode = teachingModes.find((item) => item.value === course.mode);
  const reach = metrics.kataProgress;
  const weeks = metrics.weeklyActivity;
  return (
    <SitePage current="courses" window={false}>
      <style href="ui-web-course" precedence="default">{css}</style>
      <article className="ui-crp">
        <ButtonLink variant="ghost" size="sm" className="ui-crp__back" href={links.sectionHref("courses")} icon={<Icon icon={ArrowLeft01Icon} size={14} />} onNavigate={() => links.navigate("courses")}>All courses</ButtonLink>

        <div className="ui-crp-layout">
          <div className="ui-crp-main">
            <CourseHeader course={course} card={cardInfo(course)} />

            <section className="ui-crp-install" aria-labelledby="ui-crp-install">
              <div className="ui-crp-install__head">
                <h2 id="ui-crp-install">Installation</h2>
                {command && <SegmentedControl size="compact" kind="tabs" label="Install with" options={installWays} value={way} onChange={(next) => setWay(next as typeof way)} />}
              </div>
              {command ? (way === "Command" || !prompt
                ? <CommandCopy command={command} />
                : <CommandCopy prompt command={prompt} />)
                : <p>No installation source is available for this course.</p>}
              {command && <p className="ui-crp-install__note">
                {way === "Command"
                  ? "Run it in your project, then npx dojofoo to open its first lesson in your browser."
                  : "Paste it into your agent. It installs the course and opens its first lesson in your browser."}
                <NavigationLink href="/docs/quickstart" onNavigate={() => links.openDoc("/docs/quickstart")}><Icon icon={BookOpen01Icon} size={13} />Quickstart</NavigationLink>
              </p>}
            </section>

            <div className="ui-crp-numbers">
              <section className="ui-crp-stats" aria-label="Course activity">
                <Stat label="Started" value={compactNumber(metrics.started)} />
                <Stat label="In progress" value={compactNumber(metrics.progressing)} />
                <Stat label="Finished" value={compactNumber(metrics.finished)} note={`${metrics.completionRate}% of starts`} />
              </section>

              <ReachChart unit={course.chapters ? "chapter" : "lesson"} reach={reach} />
            </div>
          </div>

          <aside className="ui-crp-side" aria-label="About this course">
            <div className="ui-crp-side__item">
              <h3>Installs</h3>
              <p className="ui-crp-side__big">{compactNumber(metrics.installs)}</p>
              <Sparkline values={weeks.map((week) => week.installs)} />
            </div>
            <div className="ui-crp-side__item">
              <h3>Repository</h3>
              <a className="ui-crp-side__repo" href={course.repositoryUrl} target="_blank" rel="noreferrer">{course.repository}</a>
            </div>
            {course.stars !== undefined && <div className="ui-crp-side__item">
              <h3>GitHub stars</h3>
              <p className="ui-crp-side__value">{compactNumber(course.stars)}</p>
            </div>}
            {course.firstSeen && <div className="ui-crp-side__item">
              <h3>First seen</h3>
              <p className="ui-crp-side__value">{longDate(course.firstSeen)}</p>
            </div>}
            {!!course.audits?.length && <div className="ui-crp-side__item">
              <h3>Security audits</h3>
              <ul className="ui-crp-audits">{course.audits.map((audit) => <Audit key={audit.slug} audit={audit} />)}</ul>
              <p className="ui-crp-side__note">Scanned {longDate(course.audits[0]?.auditedAt ?? course.publishedAt)}: the manifest, the teaching files and every lesson.</p>
            </div>}
          </aside>
        </div>
      </article>
    </SitePage>
  );
}

/** The narrowest a lesson's step gets before the chart scrolls instead */
const minStep = 3;

/** Every k-th lesson the axis names, besides the first: the fewest that keeps its labels apart at this step width */
const tickEvery = (step: number) => [1, 5, 10, 20, 25, 50, 100, 200, 500].find((k) => step * k >= 32 && (k === 1 || step * (k - 1) >= 24)) ?? 1000;

/** The top of the axis, rounded up to a value that halves cleanly, as the KPI chart's; at least 2, so an empty
    chart still counts whole projects (2, 1, 0) */
function axisTop(max: number) {
  const half = Math.max(max, 2) / 2;
  const pow = 10 ** Math.floor(Math.log10(half));
  return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((step) => step * pow >= half) ?? 10) * pow * 2;
}

/** A stepped area along the lessons: one flat step per lesson at its value, closed along the baseline */
const stepArea = (values: number[], top: number) =>
  `M0 100${values.map((value, index) => ` V${100 - (value / top) * 100} H${index + 1}`).join("")} V100 Z`;
const stepLine = (values: number[], top: number) =>
  values.map((value, index) => `${index ? "V" : "M0 "}${100 - (value / top) * 100} H${index + 1}`).join(" ");

/**
 * How far projects get, lesson by lesson (or chapter by chapter): how many reached each, and of them how many
 * finished it, as two stepped areas – a step per lesson, side by side, so any number of lessons draws one shape.
 * The legend and the axis stay put; past `minStep` a lesson, only the plot scrolls, fading at its edges. Pointing at
 * it, or the arrow keys, picks a lesson and the line under the title reads it out.
 */
function ReachChart({ unit, reach }: { unit: "lesson" | "chapter"; reach: Array<{ kata: string; started: number; finished: number }> }) {
  const [active, setActive] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  // The plot's width, for the axis's labels; a guess until it's measured
  const [width, setWidth] = useState(800);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const count = reach.length;
  const Unit = unit === "lesson" ? "Lesson" : "Chapter";
  const top = axisTop(Math.max(0, ...reach.map((item) => item.started)));
  const step = Math.max(width / Math.max(count, 1), minStep);
  const every = tickEvery(step);
  const ticks = reach.map((_, index) => index).filter((index) => index === 0 || (index + 1) % every === 0);
  const total = reach.reduce((sum, item) => sum + item.started, 0);

  // Picking a lesson keeps it in view when the plot scrolls
  const pick = (index: number) => {
    setActive(index);
    const element = scroller.current;
    if (!element) return;
    const left = index * step, right = left + step, margin = 48;
    if (left < element.scrollLeft + margin) element.scrollLeft = left - margin;
    else if (right > element.scrollLeft + element.clientWidth - margin) element.scrollLeft = right - element.clientWidth + margin;
  };
  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return Math.min(count - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * count)));
  };
  const onKey = (event: KeyboardEvent) => {
    const from = active ?? (event.key === "ArrowLeft" ? count : -1);
    if (event.key === "ArrowRight") pick(Math.min(count - 1, from + 1));
    else if (event.key === "ArrowLeft") pick(Math.max(0, from - 1));
    else if (event.key === "Home") pick(0);
    else if (event.key === "End") pick(count - 1);
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };
  const shown = active === null ? undefined : reach[active];

  return (
    <section className="ui-crp-panel ui-crp-reach" aria-labelledby="ui-crp-reach">
      <div className="ui-crp-reach__head">
        <h2 id="ui-crp-reach">{Unit} by {unit}</h2>
        <ul className="ui-crp-reach__legend" aria-label="Legend">
          <li data-series="reached">Reached</li>
          <li data-series="finished">Finished</li>
        </ul>
        {/* What the picked lesson says: one line, its numbers before its name, so a long name is what's cut */}
        <p aria-live="polite">{shown && active !== null
          ? `${Unit} ${active + 1}: ${compactNumber(shown.started)} reached, ${compactNumber(shown.finished)} finished · ${shown.kata}`
          : total === 0 ? "No projects yet." : `Projects per ${unit}.`}</p>
      </div>
      <div className="ui-crp-reach__chart">
        <div className="ui-crp-reach__y" aria-hidden="true"><span>{compactNumber(top)}</span><span>{compactNumber(top / 2)}</span><span>0</span></div>
        <div ref={scroller} className="ui-crp-reach__scroll scroll-fade-x">
          <div className="ui-crp-reach__plot" style={{ minWidth: count * minStep }} tabIndex={0} role="group"
            aria-label={`${Unit}s – use the arrow keys to read each ${unit}`} data-active={active !== null || undefined}
            onPointerMove={(event) => setActive(indexAt(event))} onPointerDown={(event) => setActive(indexAt(event))}
            onPointerLeave={() => setActive(null)} onBlur={() => setActive(null)} onKeyDown={onKey}>
            <svg viewBox={`0 0 ${Math.max(count, 1)} 100`} preserveAspectRatio="none" aria-hidden="true">
              <path className="ui-crp-reach__reached" d={stepArea(reach.map((item) => item.started), top)} />
              <path className="ui-crp-reach__finished" d={stepArea(reach.map((item) => item.finished), top)} />
              <path className="ui-crp-reach__edge" d={stepLine(reach.map((item) => item.started), top)} vectorEffect="non-scaling-stroke" />
              {active !== null && <rect className="ui-crp-reach__pick" x={active} width={1} y={0} height={100} />}
            </svg>
            <div className="ui-crp-reach__x" aria-hidden="true">
              {/* Under its step's middle; at the plot's ends, where a narrow step would push it past the edge, in from it */}
              {ticks.map((index) => <span key={index} style={{ left: `${((index + 0.5) / count) * 100}%` }}
                data-edge={step < 24 ? index === 0 ? "start" : index === count - 1 ? "end" : undefined : undefined}>{index + 1}</span>)}
            </div>
          </div>
        </div>
      </div>
      {/* The numbers themselves, for a screen reader */}
      <ol className="sr-only">
        {reach.map((item, index) => <li key={`${index}:${item.kata}`}>{`${Unit} ${index + 1}, ${item.kata}: ${item.started} reached, ${item.finished} finished`}</li>)}
      </ol>
    </section>
  );
}

type PreviewCard = ComponentProps<typeof CourseCard>["course"];

type CourseSummary = Pick<WebCourse, "name" | "description" | "repository" | "author" | "language" | "framework" | "mode" | "kataCount" | "version" | "tags">;

function CourseHeader({ course, card }: { course: CourseSummary; card: PreviewCard }) {
  const mode = teachingModes.find(item => item.value === course.mode);
  return (            <header className="ui-crp-head">
              <div className="ui-crp-head__card"><CourseCard flip={false} course={card} mark={course.author === "Dojo.foo" ? <BrandLogo mono /> : undefined} showVersion /></div>
              <div className="ui-crp-head__text">
                <p className="ui-crp-head__repo">{course.repository}</p>
                <h1>{course.name}</h1>
                <p className="ui-crp-head__lead">{course.description}</p>
                <dl className="ui-crp-facts">
                  <div><dt>Author</dt><dd>{course.author}</dd></div>
                  <div><dt>Language</dt><dd>{course.language}</dd></div>
                  <div><dt>Framework</dt><dd>{course.framework ?? "None"}</dd></div>
                  <div><dt>Teaching</dt><dd title={mode?.description}>{mode?.label}</dd></div>
                  <div><dt>Lessons</dt><dd>{course.kataCount}</dd></div>
                  <div><dt>Version</dt><dd>v{course.version}</dd></div>
                </dl>
                <ul className="ui-crp-tags" aria-label="Topics">{course.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
              </div>
            </header>);
}

/** The website's course presentation, embedded in a local shell without fabricated activity metrics. */
export function CoursePreview({ course, card, lessons, children }: {
  course: CourseSummary; card: PreviewCard; lessons: string[]; children: ReactNode;
}) {
  return <article className="ui-crp">
    <style href="ui-web-course" precedence="default">{css}</style>
    <div className="ui-crp-main">
      <CourseHeader course={course} card={card} />
      <section className="ui-crp-install" aria-label="Course installation">{children}</section>
      <section className="ui-crp-panel" aria-label="Course content">
        <h2>Course content</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">{lessons.map((title, index) => <li key={`${index}:${title}`}>{title}</li>)}</ol>
      </section>
    </div>
  </article>;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="ui-crp-stat">
      <span>{label}</span>
      <b>{value}</b>
      {note && <small>{note}</small>}
    </div>
  );
}

const statusLabel = { pass: "Pass", warn: "Warn", fail: "Fail" } as const;

function Audit({ audit }: { audit: CourseAudit }) {
  return (
    <li className="ui-crp-audit">
      <span className="ui-crp-audit__name">{audit.provider}<small>{audit.summary}</small></span>
      <span className="ui-crp-audit__status" data-status={audit.status}>{statusLabel[audit.status]}</span>
    </li>
  );
}

/** The installs' twelve weeks as a line, in the brand pink over a wash of it */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const points = values.map((value, index) => `${(index / Math.max(values.length - 1, 1)) * 100},${30 - ((value - min) / Math.max(max - min, 1)) * 26}`);
  return (
    <svg className="ui-crp-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,32 ${points.join(" ")} 100,32`} />
      <polyline points={points.join(" ")} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const css = /* css */ `
/* On the page, as wide as its header and footer */
.ui-crp { padding: 28px 8px 64px; container: ui-web / inline-size; }
@media (max-width: 1203px) { .ui-crp { padding-inline: 20px; } }
@media (max-width: 720px) { .ui-crp { padding-block: 24px 48px; } }
.ui-crp__back { margin-left: -10px; }

/* The page and, beside it, what you'd check before installing – it stays in view as the page scrolls */
.ui-crp-layout { display: grid; grid-template-columns: minmax(0, 1fr) 17rem; align-items: start; gap: 48px; margin-top: 20px; }
@container ui-web (max-width: 1020px) { .ui-crp-layout { grid-template-columns: minmax(0, 1fr); } }
.ui-crp-main { display: grid; gap: 40px; min-width: 0; }

/* The card beside its words, as Explore's featured course */
.ui-crp-head { display: grid; grid-template-columns: minmax(12rem, 15rem) minmax(0, 1fr); gap: 36px; }
@container ui-web (max-width: 720px) { .ui-crp-head { grid-template-columns: minmax(0, 1fr); } .ui-crp-head__card { max-width: 16rem; } }
.ui-crp-head__repo { margin: 0; color: var(--muted); font-family: var(--font-mono); font-size: 12.5px; }
.ui-crp-head h1 { margin: 6px 0 0; font-size: 32px; line-height: 1.1; font-weight: 650; letter-spacing: -0.02em; text-wrap: balance; }
.ui-crp-head__lead { max-width: 36rem; margin: 12px 0 0; color: var(--muted); font-size: 15px; line-height: 1.55; text-wrap: pretty; }
.ui-crp-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px 24px; max-width: 34rem; margin: 24px 0 0; }
.ui-crp-facts dt { color: var(--muted); font-size: var(--fs-caption); }
.ui-crp-facts dd { margin: 2px 0 0; font-size: var(--fs-subtitle); font-weight: 550; }
.ui-crp-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 20px 0 0; padding: 0; list-style: none; }
.ui-crp-tags li { padding: 3px 9px; border-radius: 999px; corner-shape: round; background: var(--chip); color: var(--muted); font-size: var(--fs-caption); font-weight: 500; }

/* Installation: the command or the prompt, switched */
.ui-crp-install { display: grid; gap: 12px; }
.ui-crp-install__head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.ui-crp-install h2, .ui-crp-panel h2 { margin: 0; font-size: var(--fs-subtitle); font-weight: 600; }
.ui-crp-install__note { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin: 0; color: var(--muted); font-size: var(--fs-body); }
.ui-crp-install__note a { display: inline-flex; align-items: center; gap: 5px; color: var(--ink); font-weight: 550; }
@media (hover: hover) { .ui-crp-install__note a:hover { color: var(--accent); } }

/* The numbers: tiles on the card surface, then the chart and the chapters */
.ui-crp-numbers { display: grid; gap: 16px; }
.ui-crp-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
@container ui-web (max-width: 560px) { .ui-crp-stats { grid-template-columns: minmax(0, 1fr); } }
/* Tiles and panels as the KPI card beside them: its radius, surface and shadow */
.ui-crp-stat { display: grid; gap: 4px; padding: 16px 20px; border-radius: calc(20px * var(--squircle-factor, 1)); background: var(--surface-3); box-shadow: var(--shadow-3); }
.ui-crp-stat span { color: var(--muted); font-size: var(--fs-caption); font-weight: 500; }
.ui-crp-stat b { font-size: 26px; line-height: 1.1; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.ui-crp-stat small { color: var(--muted); font-size: var(--fs-caption); }

.ui-crp-panel { padding: 20px 20px 18px; border-radius: calc(20px * var(--squircle-factor, 1)); background: var(--surface-3); box-shadow: var(--shadow-3); }
.ui-crp-panel > p { margin: 4px 0 0; color: var(--muted); font-size: var(--fs-body); }

/* Lesson by lesson: the title and the line under it, the legend beside both (on a phone, the line under both too);
   the line stays one line, so picking a lesson doesn't move the chart */
.ui-crp-reach__head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: 4px 16px; }
.ui-crp-reach__head p { grid-column: 1; margin: 0; overflow: hidden; color: var(--muted); font-size: var(--fs-body); font-variant-numeric: tabular-nums; white-space: nowrap; text-overflow: ellipsis; }
.ui-crp-reach__legend { grid-row: 1 / span 2; grid-column: 2; display: flex; gap: 14px; margin: 2px 0 0; padding: 0; list-style: none; color: var(--muted); font-size: var(--fs-caption); }
.ui-crp-reach__legend li { display: flex; align-items: center; gap: 6px; white-space: nowrap; }
.ui-crp-reach__legend li::before { width: 10px; height: 10px; border-radius: 3px; corner-shape: round; background: var(--ui-crp-finished); content: ""; }
.ui-crp-reach__legend li[data-series="reached"]::before { background: var(--ui-crp-reached); box-shadow: inset 0 1.5px 0 var(--brand); }
@container ui-web (max-width: 560px) {
  .ui-crp-reach__legend { grid-row: 1; }
  .ui-crp-reach__head p { grid-column: 1 / -1; }
}

/* The axis beside the plot, which alone scrolls; its labels level with the plot's top, middle and baseline */
.ui-crp-reach { --ui-crp-reached: color-mix(in oklab, var(--brand) 22%, transparent); --ui-crp-finished: var(--brand); --ui-crp-plot: 168px; }
.ui-crp-reach__chart { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; margin-top: 20px; }
.ui-crp-reach__y { position: relative; display: grid; height: var(--ui-crp-plot); color: var(--muted); font-size: var(--fs-caption); font-variant-numeric: tabular-nums; line-height: 1; text-align: right; }
/* Each on its line: the widest sets the column, the others stacked over it and moved down to theirs */
.ui-crp-reach__y span { grid-area: 1 / 1; align-self: start; translate: 0 -50%; }
.ui-crp-reach__y span:nth-child(2) { align-self: center; translate: 0; }
.ui-crp-reach__y span:nth-child(3) { align-self: end; translate: 0 50%; }
.ui-crp-reach__scroll { overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: thin; }
.ui-crp-reach__plot { position: relative; padding-bottom: 22px; outline: none; cursor: crosshair; touch-action: pan-x; }
/* The grid's three lines, under the areas */
.ui-crp-reach__plot::before { position: absolute; inset: 0 0 22px; background: linear-gradient(var(--line), var(--line)) 0 0 / 100% 1px no-repeat, linear-gradient(var(--line), var(--line)) 0 50% / 100% 1px no-repeat; border-bottom: 1px solid var(--line); content: ""; pointer-events: none; }
.ui-crp-reach__plot svg { position: relative; display: block; width: 100%; height: var(--ui-crp-plot); overflow: visible; }
.ui-crp-reach__reached { fill: var(--ui-crp-reached); }
.ui-crp-reach__finished { fill: var(--ui-crp-finished); }
.ui-crp-reach__edge { fill: none; stroke: var(--brand); stroke-width: 1.5; stroke-linejoin: round; }
.ui-crp-reach__pick { fill: var(--ink); opacity: 0.1; }
.ui-crp-reach__plot:focus-visible { box-shadow: 0 0 0 2px var(--focus-ring); border-radius: 4px; }
.ui-crp-reach__x { position: absolute; right: 0; bottom: 0; left: 0; height: 14px; color: var(--muted); font-size: var(--fs-caption); line-height: 1; font-variant-numeric: tabular-nums; }
.ui-crp-reach__x span { position: absolute; top: 0; translate: -50% 0; white-space: nowrap; }
.ui-crp-reach__x span[data-edge="start"] { left: 0 !important; translate: 0; }
.ui-crp-reach__x span[data-edge="end"] { left: 100% !important; translate: -100% 0; }
@media (forced-colors: active) { .ui-crp-reach svg path { forced-color-adjust: none; } }

/* The side column, skills.sh's: small caps labels over plain values, rules between */
.ui-crp-side { position: sticky; top: 88px; display: grid; }
.ui-crp-side__item { display: grid; gap: 6px; padding: 16px 0; background: var(--ui-web-rule) left top / var(--ui-web-rule-size) repeat-x; }
.ui-crp-side__item:first-child { padding-top: 0; background: none; }
.ui-crp-side h3 { margin: 0; color: var(--muted); font-size: var(--fs-caption); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; }
.ui-crp-side__big { margin: 0; font-size: 28px; line-height: 1.1; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.ui-crp-side__value { margin: 0; font-size: var(--fs-subtitle); font-weight: 550; font-variant-numeric: tabular-nums; }
.ui-crp-side__repo { overflow: hidden; color: var(--ink); font-family: var(--font-mono); font-size: 13px; text-decoration: underline; text-decoration-color: var(--line); text-underline-offset: 3px; white-space: nowrap; text-overflow: ellipsis; }
@media (hover: hover) { .ui-crp-side__repo:hover { color: var(--accent); text-decoration-color: currentColor; } }
.ui-crp-side__note { margin: 4px 0 0; color: var(--muted); font-size: var(--fs-caption); line-height: 1.45; text-wrap: pretty; }
.ui-crp-spark { width: 100%; height: 36px; margin-top: 4px; overflow: visible; }
.ui-crp-spark polyline { fill: none; stroke: var(--brand); stroke-width: 1.75; stroke-linejoin: round; stroke-linecap: round; }
.ui-crp-spark polygon { fill: color-mix(in oklab, var(--brand) 14%, transparent); }

/* An audit: who scanned, what they found, and the verdict as a pill */
.ui-crp-audits { display: grid; gap: 10px; margin: 2px 0 0; padding: 0; list-style: none; }
.ui-crp-audit { display: flex; align-items: start; justify-content: space-between; gap: 12px; }
.ui-crp-audit__name { display: grid; gap: 1px; min-width: 0; font-size: var(--fs-body); font-weight: 550; }
.ui-crp-audit__name small { color: var(--muted); font-size: var(--fs-caption); font-weight: 400; line-height: 1.4; }
.ui-crp-audit__status { --tone: var(--success); flex: none; padding: 2px 8px; border-radius: 999px; corner-shape: round; background: color-mix(in oklab, var(--tone) 14%, transparent); color: var(--tone); font-size: 11px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
.ui-crp-audit__status[data-status="warn"] { --tone: #b45309; }
.ui-crp-audit__status[data-status="fail"] { --tone: #dc2626; }
:is(.dark, [data-theme="dark"]) .ui-crp-audit__status[data-status="warn"] { --tone: #fbbf24; }
:is(.dark, [data-theme="dark"]) .ui-crp-audit__status[data-status="fail"] { --tone: #f87171; }
`;
