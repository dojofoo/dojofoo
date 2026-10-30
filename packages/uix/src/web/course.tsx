import { followLink } from "../lib/link-event";
import { useState } from "react";
import { Icon } from "../components/app-shell";
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
 * them today (apps/web/src/routes/courses.$source.$slug.tsx): started against finished, then one bar chart of how many
 * projects reach – or finish – each lesson or chapter (the weekly installs are the sparkline beside it). Beside it all, what you'd check before installing: installs,
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
        <ButtonLink variant="ghost" size="sm" className="ui-crp__back" href={links.sectionHref("courses")} icon={<Icon icon={ArrowLeft01Icon} size={14} />} onClick={event => followLink(event, () => links.navigate("courses"))}>All courses</ButtonLink>

        <div className="ui-crp-layout">
          <div className="ui-crp-main">
            <header className="ui-crp-head">
              <div className="ui-crp-head__card"><CourseCard flip={false} course={cardInfo(course)} mark={course.author === "Dojo.foo" ? <BrandLogo mono /> : undefined} showVersion /></div>
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
            </header>

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
                <a href="/docs/quickstart" onClick={event => followLink(event, () => links.openDoc("/docs/quickstart"))}><Icon icon={BookOpen01Icon} size={13} />Quickstart</a>
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

const reachSeries = ["Reached", "Finished"] as const;

/** One bar chart for the lessons (or chapters): how many projects reached each, or switched, how many finished it –
    each bar on its track, rounded, in the brand's pink; the axis names every fifth; past what fits, it scrolls */
function ReachChart({ unit, reach }: { unit: "lesson" | "chapter"; reach: Array<{ kata: string; started: number; finished: number }> }) {
  const [series, setSeries] = useState<(typeof reachSeries)[number]>("Reached");
  const [hover, setHover] = useState<number | null>(null);
  const value = (item: (typeof reach)[number]) => (series === "Reached" ? item.started : item.finished);
  // The axis's top rounded up to a value that halves cleanly, as the KPI chart's
  const top = (() => {
    // At least 2, so an empty chart's axis still counts in whole projects (2, 1, 0)
    const half = Math.max(...reach.map(value), 2) / 2;
    const pow = 10 ** Math.floor(Math.log10(half || 1));
    return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((step) => step * pow >= half) ?? 10) * pow * 2;
  })();
  const shown = hover ?? null;
  const verb = series === "Reached" ? "reached" : "finished";
  const total = reach.reduce((sum, item) => sum + value(item), 0);
  return (
    <section className="ui-crp-panel ui-crp-reach" aria-labelledby="ui-crp-reach">
      <div className="ui-crp-reach__head">
        <div>
          <h2 id="ui-crp-reach">{series === "Reached" ? `Reaching each ${unit}` : `Finishing each ${unit}`}</h2>
          {/* What a bar says, as you point at it */}
          <p aria-live="polite">{shown === null
            ? total === 0 ? "No projects yet." : `Projects that ${verb} each ${unit}.`
            : `${unit === "lesson" ? "Lesson" : "Chapter"} ${shown + 1} · ${reach[shown].kata}: ${compactNumber(value(reach[shown]))} ${verb}`}</p>
        </div>
        <SegmentedControl size="compact" kind="tabs" label="Show" options={reachSeries} value={series} onChange={(next) => setSeries(next as typeof series)} />
      </div>
      <div className="ui-crp-reach__chart">
        <div className="ui-crp-reach__y" aria-hidden="true"><span>{compactNumber(top)}</span><span>{compactNumber(top / 2)}</span><span>0</span></div>
        <div className="ui-crp-reach__scroll scroll-fade-x">
          <ol className="ui-crp-reach__bars" style={{ ["--count" as string]: reach.length }} onPointerLeave={() => setHover(null)}>
            {reach.map((item, index) => (
              <li key={item.kata} aria-label={`${unit === "lesson" ? "Lesson" : "Chapter"} ${index + 1}, ${item.kata}: ${value(item)} ${verb}`}
                data-active={hover === index || undefined} onPointerEnter={() => setHover(index)}>
                <span className="ui-crp-reach__track"><b style={{ height: `${(value(item) / top) * 100}%` }} /></span>
                {/* The axis names the first and every fifth */}
                <span className="ui-crp-reach__x" aria-hidden="true">{index === 0 || (index + 1) % 5 === 0 ? index + 1 : ""}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
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
.ui-crp { --ui-crp-brand-soft: color-mix(in oklab, var(--brand) 40%, var(--surface-3)); padding: 28px 8px 64px; container: ui-web / inline-size; }
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

/* Reaching each lesson: a bar per lesson on its own rounded track, the axis every fifth, scrolling past what fits */
.ui-crp-reach__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.ui-crp-reach__head p { margin: 4px 0 0; color: var(--muted); font-size: var(--fs-body); font-variant-numeric: tabular-nums; }
.ui-crp-reach__chart { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; margin-top: 20px; }
.ui-crp-reach__y { display: flex; flex-direction: column; justify-content: space-between; height: 160px; color: var(--muted); font-size: var(--fs-caption); font-variant-numeric: tabular-nums; text-align: right; }
.ui-crp-reach__y span { line-height: 1; }
.ui-crp-reach__scroll { overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: thin; }
.ui-crp-reach__bars { display: grid; grid-template-columns: repeat(var(--count), minmax(12px, 1fr)); gap: 5px; min-width: calc(var(--count) * 17px); margin: 0; padding: 0; list-style: none; }
.ui-crp-reach__bars li { display: grid; grid-template-rows: 160px auto; gap: 8px; }
.ui-crp-reach__track { position: relative; display: block; overflow: hidden; border-radius: 6px; corner-shape: round; background: var(--chip); transition: background-color var(--motion-fast) var(--ease-standard); }
.ui-crp-reach__track b { position: absolute; right: 0; bottom: 0; left: 0; border-radius: inherit; background: var(--brand); transition: height var(--motion-moderate) var(--ease-moderate); }
.ui-crp-reach__bars li[data-active] .ui-crp-reach__track { background: var(--ui-crp-brand-soft); }
.ui-crp-reach__x { height: 1em; color: var(--muted); font-size: var(--fs-caption); line-height: 1; font-variant-numeric: tabular-nums; text-align: center; white-space: nowrap; }
@media (prefers-reduced-motion: reduce) { .ui-crp-reach__track b { transition: none; } }
@media (forced-colors: active) { .ui-crp-reach__track, .ui-crp-reach__track b { forced-color-adjust: none; } }

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
