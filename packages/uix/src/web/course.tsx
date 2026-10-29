import { followLink } from "../lib/link-event";
import { useState } from "react";
import { Icon } from "../components/app-shell";
import { BrandLogo } from "../components/brand-logo";
import { ButtonLink } from "../components/button";
import { CourseCard } from "../components/course-card";
import { KpiChart } from "../components/kpi-chart";
import { SegmentedControl } from "../components/segmented-control";
import { ArrowLeft01Icon, BookOpen01Icon } from "../lib/icons";
import { cardInfo, compactNumber, installCommand, installPrompt, teachingModes, type CourseAudit, type WebCourse } from "./catalog";
import { CommandCopy, SitePage, useSite } from "./site";

/*
 * A course's page, as skills.sh lays out a skill's: its course card beside what it is, how to
 * install it – the command, or a prompt that has your agent install and start it – and its numbers as the site shows
 * them today (apps/web/src/routes/courses.$source.$slug.tsx): started against finished, how many projects reach each
 * chapter, and the weekly installs, starts and finishes. Beside it all, what you'd check before installing: installs,
 * the repository, its stars, when the marketplace first saw it, and the security audits of its files. The charts are
 * Dojofoo's: its pink and its neutrals.
 */

const weekLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
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
  const most = Math.max(...reach.map((chapter) => chapter.started), 1);
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

              <div className="ui-crp-grid">
                {weeks.length > 0 ? <KpiChart className="ui-crp-chart" title="Weekly activity" value={compactNumber(weeks.reduce((n, week) => n + week.installs, 0))}
                  delta={weeks.length > 1 ? weeks.at(-1)!.installs - weeks.at(-2)!.installs : undefined}
                  labels={weeks.map((week) => weekLabel(week.week))} tooltipLabels={weeks.map((week) => `Week of ${weekLabel(week.week)}`)}
                  series={[
                    { label: "Installs", color: "var(--brand)", values: weeks.map((week) => week.installs) },
                    { label: "Started", color: "var(--ui-crp-brand-soft)", values: weeks.map((week) => week.started) },
                    { label: "Finished", color: "var(--fluid-foreground)", values: weeks.map((week) => week.finished) },
                  ]}
                  footer="Installs over the last twelve weeks" defaultIndex={weeks.length - 1} />
                  : <section className="ui-crp-panel"><h2>Weekly activity</h2><p>No activity recorded yet.</p></section>}

                <section className="ui-crp-panel" aria-labelledby="ui-crp-reach">
                  <h2 id="ui-crp-reach">Reaching each {course.chapters ? "chapter" : "lesson"}</h2>
                  <p>Projects that started a {course.chapters ? "chapter" : "lesson"}, and how many of them finished it.</p>
                  <ol className="ui-crp-reach">
                    {reach.map((chapter, index) => (
                      <li key={chapter.kata}>
                        <span className="ui-crp-reach__name"><span>{String(index + 1).padStart(2, "0")}</span>{chapter.kata}</span>
                        <span className="ui-crp-reach__bar" role="img" aria-label={`${chapter.started} started, ${chapter.finished} finished`}>
                          <i style={{ width: `${(chapter.started / most) * 100}%` }} />
                          <b style={{ width: `${(chapter.finished / most) * 100}%` }} />
                        </span>
                        <span className="ui-crp-reach__n">{compactNumber(chapter.finished)}<small> / {compactNumber(chapter.started)}</small></span>
                      </li>
                    ))}
                  </ol>
                  <p className="ui-crp-legend"><span className="ui-crp-legend__finished" />Finished<span className="ui-crp-legend__started" />Started</p>
                </section>
              </div>
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

.ui-crp-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: 16px; }
@container ui-web (max-width: 1240px) { .ui-crp-grid { grid-template-columns: minmax(0, 1fr); } }
.ui-crp-panel { padding: 20px 20px 18px; border-radius: calc(20px * var(--squircle-factor, 1)); background: var(--surface-3); box-shadow: var(--shadow-3); }
.ui-crp-panel > p { margin: 4px 0 0; color: var(--muted); font-size: var(--fs-body); }

/* Each chapter: who started it (the pink, light) and who finished it (full), with a gap of the panel between */
.ui-crp-reach { display: grid; gap: 10px; margin: 20px 0 0; padding: 0; list-style: none; }
.ui-crp-reach li { display: grid; grid-template-columns: minmax(7rem, 11rem) minmax(0, 1fr) 5.5rem; align-items: center; gap: 12px; font-size: var(--fs-body); }
@container ui-web (max-width: 420px) {
  .ui-crp-reach li { grid-template-columns: minmax(0, 1fr) auto; row-gap: 6px; }
  .ui-crp-reach__bar { grid-column: 1 / -1; grid-row: 2; }
}
.ui-crp-reach__name { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.ui-crp-reach__name span { margin-right: 8px; color: var(--muted); font-variant-numeric: tabular-nums; }
.ui-crp-reach__bar { position: relative; height: 8px; border-radius: 999px; corner-shape: round; background: var(--chip); }
.ui-crp-reach__bar i, .ui-crp-reach__bar b { position: absolute; inset: 0 auto 0 0; border-radius: inherit; }
.ui-crp-reach__bar i { background: var(--ui-crp-brand-soft); }
.ui-crp-reach__bar b { background: var(--brand); box-shadow: 2px 0 0 var(--surface-3); }
.ui-crp-reach__n { text-align: right; font-variant-numeric: tabular-nums; }
.ui-crp-reach__n small { color: var(--muted); font-size: inherit; }
.ui-crp-legend { display: flex; align-items: center; gap: 6px; margin: 16px 0 0; color: var(--muted); font-size: var(--fs-caption); }
.ui-crp-legend span { width: 8px; height: 8px; border-radius: 50%; corner-shape: round; }
.ui-crp-legend__finished { background: var(--brand); }
.ui-crp-legend__started { margin-left: 10px; background: var(--ui-crp-brand-soft); }
@media (forced-colors: active) { .ui-crp-reach__bar, .ui-crp-reach__bar i, .ui-crp-reach__bar b, .ui-crp-legend span { forced-color-adjust: none; } }
/* The chart fills its column (it's 460px at most on its own) */
.ui-crp-grid .ui-crp-chart { min-width: 0; max-width: none; }

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
