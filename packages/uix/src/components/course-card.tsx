import type { CSSProperties, ReactNode } from "react";
import { FlipCard } from "~/components/flip-card";
import { CardShader, type CardShaderKind } from "~/components/color-card";
import { cn } from "~/lib/utils";

/*
 * Course cards. CourseArt draws a course's artwork – a gradient in its hue with its monogram – at any size, or as a
 * square cover the width of its column. CourseFlipCard is the course as a square card that turns over (FlipCard) – a
 * click turns it, no hint says so: the front in the course's colors, white contour lines drifting over it (Topography)
 * – who made it top left (a mark, e.g. our logo, else the author's name), its rating top right, the repository and the
 * course's name, when it was updated bottom left; the back only what the front doesn't say – version, language,
 * chapters, lessons and the time it takes.
 * A course you study (`enrolled`) says what you have instead: your version top left – an Update button once there is a
 * newer one – and your progress at the foot, as the small cards show it: where you are, the percent and the bar.
 *
 *   <CourseFlipCard mark={<BrandLogo />} course={{ title: "Everyday TypeScript", repo: "dojofoo/everyday-typescript",
 *     author: "Dojo", rating: 4.9, version: "v1.4.0", updated: "12 Oct 2026", language: "TypeScript", chapters: 4,
 *     lessons: 12, hours: 6, art: { hue: 350, glyph: "TS" } }}
 *     enrolled={{ version: "v1.4.0", latest: "v1.5.0", onUpdate, progress: 42, label: "02 · Objects", value: "Merge settings" }} />
 */
export type CourseArtwork = { /** OKLCH hue of the gradient */ hue: number; /** One to three letters */ glyph: string };

export type CourseInfo = {
  title: string;
  /** Where the course lives, "org/repo" on GitHub */
  repo: string;
  author: string;
  /** Out of 5 */
  rating?: number;
  /** What drifts over its card: the contour map (the default), the network or the waves */
  shader?: CardShaderKind;
  version: string;
  updated: string;
  language: string;
  chapters: number;
  lessons: number;
  /** Time to complete, in hours */
  hours: number;
  art: CourseArtwork;
};

/** A course you study: the version you have (a newer `latest` turns it into an Update button) and how far you are */
export type CourseEnrollment = {
  version: string;
  latest?: string;
  /** While the update runs */
  updating?: boolean;
  onUpdate?: () => void;
  /** 0–100 */
  progress: number;
  /** Where you are, e.g. the chapter */
  label?: ReactNode;
  /** What's next, e.g. the lesson */
  value?: ReactNode;
};

export function CourseArt({ art, size = 44, cover = false, className }: { art: CourseArtwork; size?: number; /** Square, as wide as its column – a tile's cover */ cover?: boolean; className?: string }) {
  return (
    <span className={cn("ui-cc-art", className)} data-cover={cover || undefined} aria-hidden="true" style={{ "--art-hue": art.hue, "--art-size": `${size}px` } as CSSProperties}>
      <style href="ui-course-card" precedence="default">{css}</style>
      <b>{art.glyph}</b>
    </span>
  );
}

/** The card's front: the course's colors with its contour map, who made it, its rating, its name and when it changed –
    or, for a course you study, your version and your progress */
function CourseFront({ course, mark, enrolled }: { course: CourseInfo; mark?: ReactNode; enrolled?: CourseEnrollment }) {
  const outdated = enrolled?.latest !== undefined && enrolled.latest !== enrolled.version;
  return (
    <div className="ui-cf__face ui-cf__front" style={{ "--art-hue": course.art.hue } as CSSProperties}>
      <style href="ui-course-card" precedence="default">{css}</style>
      <CardShader kind={course.shader ?? "topography"} seed={seedOf(course.repo)} className="ui-cf__lines" />
      <div className="ui-cf__row ui-cf__head">
        {!enrolled ? <span className="ui-cf__author">{mark ?? course.author}</span>
          : outdated ? (
            // Above the card's own turn-over button, so it updates rather than turns
            <button type="button" className="ui-cf__update light" disabled={enrolled.updating} title={`${enrolled.version} → ${enrolled.latest}`}
              aria-label={`Update ${course.title} to ${enrolled.latest}`} onPointerDown={(event) => event.stopPropagation()} onClick={enrolled.onUpdate}>
              {enrolled.updating ? "Updating…" : "Update"}
            </button>
          ) : <span className="ui-cf__version">{enrolled.version}</span>}
        {course.rating !== undefined && <span className="ui-cf__rating" aria-label={`Rated ${course.rating} out of 5`}>★ {course.rating.toFixed(1)}</span>}
      </div>
      <div className="ui-cf__name">
        <span className="ui-cf__repo">{course.repo}</span>
        <b>{course.title}</b>
      </div>
      {enrolled ? (
        <div className="ui-cf__progress">
          <div className="ui-cf__row ui-cf__row--end">
            <span className="ui-cf__updated">{enrolled.label && <small>{enrolled.label}</small>}{enrolled.value && <span>{enrolled.value}</span>}</span>
            <span className="ui-cf__rating">{enrolled.progress}%</span>
          </div>
          <span className="ui-cf__bar" aria-hidden="true"><i style={{ width: `${Math.max(enrolled.progress, 3)}%` }} /></span>
        </div>
      ) : (
        <div className="ui-cf__row ui-cf__row--end">
          <span className="ui-cf__updated"><small>Updated</small><span>{course.updated}</span></span>
        </div>
      )}
    </div>
  );
}

export function CourseFlipCard({ course, mark, enrolled, className }: { course: CourseInfo; /** In the author's name's place, e.g. our logo on our own courses */ mark?: ReactNode; /** A course you study: your version and progress */ enrolled?: CourseEnrollment; className?: string }) {
  const label = enrolled ? `${course.title}, ${enrolled.progress}% done` : course.title;
  return (
    <FlipCard className={cn("ui-cf h-auto w-full aspect-square", className)} frontLabel={`${label} – show details`} backLabel={`${course.title} – show the front`}
      front={<CourseFront course={course} mark={mark} enrolled={enrolled} />}
      back={
        <div className="ui-cf__face ui-cf__back">
          <span className="ui-cf__kicker">Details</span>
          <dl>
            <div><dt>Version</dt><dd>{enrolled?.version ?? course.version}</dd></div>
            <div><dt>Language</dt><dd>{course.language}</dd></div>
            <div><dt>Chapters</dt><dd>{course.chapters}</dd></div>
            <div><dt>Lessons</dt><dd>{course.lessons}</dd></div>
            <div><dt>Time to complete</dt><dd>~{course.hours} h</dd></div>
          </dl>
        </div>
      } />
  );
}

export type CertificateInfo = { id: string; title: string; learner: string; issued: string; lessons: number; score: number; art: CourseArtwork };

/**
 * CertificateFlipCard – a certificate as the course cards are: square, in its course's colors with the contour map, the
 * mark top left and the score top right, what it certifies in the middle and when at the foot; turned over, its details.
 */
export function CertificateFlipCard({ certificate, mark, className }: { certificate: CertificateInfo; mark?: ReactNode; className?: string }) {
  return (
    <FlipCard className={cn("ui-cf h-auto w-full aspect-square", className)} frontLabel={`Certificate: ${certificate.title} – show details`} backLabel={`Certificate: ${certificate.title} – show the front`}
      front={
        <div className="ui-cf__face ui-cf__front" style={{ "--art-hue": certificate.art.hue } as CSSProperties}>
          <style href="ui-course-card" precedence="default">{css}</style>
          <CardShader kind="topography" seed={seedOf(certificate.id)} className="ui-cf__lines" />
          <div className="ui-cf__row ui-cf__head"><span className="ui-cf__author">{mark ?? "Dojo"}</span><span className="ui-cf__rating">{certificate.score}%</span></div>
          <div className="ui-cf__name"><span className="ui-cf__repo">Certificate of completion</span><b>{certificate.title}</b></div>
          <div className="ui-cf__row ui-cf__row--end"><span className="ui-cf__updated"><small>Issued</small><span>{certificate.issued}</span></span></div>
        </div>
      }
      back={
        <div className="ui-cf__face ui-cf__back">
          <span className="ui-cf__kicker">Details</span>
          <dl>
            <div><dt>Learner</dt><dd>{certificate.learner}</dd></div>
            <div><dt>Lessons</dt><dd>{certificate.lessons}</dd></div>
            <div><dt>Score</dt><dd>{certificate.score}%</dd></div>
            <div><dt>ID</dt><dd>DOJO-{certificate.id.toUpperCase()}</dd></div>
          </dl>
        </div>
      } />
  );
}

/** Each course its own contour map: a number from its repository's name */
const seedOf = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);

const css = /* css */ `
/* Artwork: the course's hue, light at the top left and deep at the bottom right, its monogram set large and tight */
.ui-cc-art {
  position: relative;
  display: grid;
  flex: none;
  place-items: end start;
  width: var(--art-size);
  height: var(--art-size);
  overflow: hidden;
  padding: calc(var(--art-size) * 0.1);
  border-radius: calc(var(--art-size) * 0.14);
  background:
    radial-gradient(120% 90% at 0% 0%, oklch(0.78 0.16 var(--art-hue) / 0.9), transparent 60%),
    linear-gradient(135deg, oklch(0.62 0.2 var(--art-hue)), oklch(0.34 0.13 calc(var(--art-hue) + 40)));
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12), var(--shadow-2);
  color: rgb(255 255 255 / 0.92);
}
.ui-cc-art b { font-size: calc(var(--art-size) * 0.42); font-weight: 750; line-height: 0.9; letter-spacing: -0.04em; }
/* A cover: square at the column's width, everything in proportion to it (its padding is a percentage – of the column,
   so of its own width; container units here would measure the window) */
.ui-cc-art[data-cover] { container-type: inline-size; width: 100%; height: auto; aspect-ratio: 1; padding: 9%; border-radius: 10px; }
.ui-cc-art[data-cover] b { font-size: 34cqi; }

/* The flip card, square: type in proportion to its width, so it reads the same in the sidebar and on a page */
.ui-cf { --flip-radius: 14px; container-type: inline-size; }
.ui-cf__face { position: relative; display: flex; flex-direction: column; justify-content: space-between; height: 100%; padding: 8cqi; overflow: hidden; border-radius: inherit; }
.ui-cf__face > :not(.ui-cf__lines) { position: relative; }
/* The front's name always on the card's middle line: equal rows above and below it, the top line at the top, the foot
   (the date, or your progress) at the bottom – whatever either holds */
.ui-cf__front { display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: 1fr auto 1fr; }
.ui-cf__front > .ui-cf__head { align-self: start; }
.ui-cf__front > :last-child { align-self: end; }
/* The contour lines: drawn white on black and screened over the colors, so only the lines show */
.ui-cf__lines { position: absolute; inset: 0; mix-blend-mode: screen; opacity: 0.55; pointer-events: none; }
/* The network and the waves draw brighter than the contours, so they stay quieter */
.ui-cf__lines[data-kind="network"] { opacity: 0.45; image-rendering: pixelated; }
.ui-cf__lines[data-kind="waves"] { opacity: 0.4; }
.ui-cf__lines[data-kind="opal"] { opacity: 0.6; }
.ui-cf__front {
  background:
    radial-gradient(120% 90% at 0% 0%, oklch(0.74 0.16 var(--art-hue) / 0.85), transparent 60%),
    linear-gradient(140deg, oklch(0.58 0.2 var(--art-hue)), oklch(0.3 0.12 calc(var(--art-hue) + 40)));
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
  color: #fff;
}
.ui-cf__back { background: var(--card); box-shadow: var(--shadow-3); color: var(--ink); }
.ui-cf__row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.ui-cf__row--end { align-items: flex-end; }
/* As on the small cards, the padding meets what you see: each line of type is trimmed to its letters (the top of its
   capitals to its baseline), the top line aligns its tops, the foot its bottoms – baselines and the bar */
.ui-cf__author { display: block; font-size: max(12px, 5.6cqi); line-height: 1; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; text-box: trim-both cap alphabetic; }
/* A mark sits at the name's height, in the front's white */
.ui-cf__author > * { display: block; height: max(9px, 4cqi); width: auto; color: #fff; }
/* Our logo's box is the drawing (1.84:1, not the 3.19:1 it claims), the same size as before – so its top meets the
   padding rather than running past its box */
.ui-cf__author > .dojo-brand-logo { height: max(15.7px, 6.95cqi); aspect-ratio: 2225 / 1212; }
.ui-cf__rating { display: block; font-size: max(11.5px, 5cqi); line-height: 1; font-weight: 600; font-variant-numeric: tabular-nums; text-box: trim-both cap alphabetic; }
.ui-cf__kicker { font-size: max(10px, 4.2cqi); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
.ui-cf__name { display: flex; flex-direction: column; gap: 1.6cqi; min-width: 0; }
.ui-cf__repo { overflow: hidden; font-family: var(--font-mono); font-size: max(10.5px, 4.6cqi); opacity: 0.72; white-space: nowrap; text-overflow: ellipsis; }
.ui-cf__name b { font-size: 10cqi; line-height: 1.05; font-weight: 600; letter-spacing: -0.03em; text-wrap: balance; }
/* Its two lines as far apart as untrimmed: the label's baseline over the value's capitals */
.ui-cf__updated { display: flex; flex-direction: column; gap: max(6.5px, calc(2.3cqi + 1px)); font-size: max(12px, 5cqi); font-weight: 500; font-variant-numeric: tabular-nums; }
.ui-cf__updated > * { display: block; line-height: 1; text-box: trim-both cap alphabetic; }
.ui-cf__updated small { font-size: max(10.5px, 4.4cqi); font-weight: 400; opacity: 0.65; }
/* A course you study: its version top left, or – a newer one out – the Update button, a light one as the cards' actions
   are, lifted over the turn-over button so a click updates; at the foot your progress, as on the small cards */
.ui-cf__head { align-items: flex-start; }
.ui-cf__version { display: block; font-size: max(11.5px, 5cqi); line-height: 1; font-weight: 600; font-variant-numeric: tabular-nums; text-box: trim-both cap alphabetic; }
.ui-cf .ui-cf__update { z-index: 11; display: inline-flex; align-items: center; height: max(22px, 9cqi); padding: 0 max(8px, 3.6cqi); border-radius: 7px; background: var(--surface-6); color: var(--fluid-foreground); box-shadow: 0 1px 2px rgb(0 0 0 / 0.2); font-size: max(11.5px, 5cqi); font-weight: 550; transition: opacity var(--motion-fast) var(--ease-fast), scale var(--motion-fast) var(--ease-fast); }
.ui-cf .ui-cf__update:hover:not(:disabled) { opacity: 0.9; }
.ui-cf .ui-cf__update:active:not(:disabled) { scale: 0.96; }
.ui-cf .ui-cf__update:disabled { opacity: 0.7; }
.ui-cf .ui-cf__update:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
/* The bar as far under the baseline as before */
.ui-cf__progress { display: grid; gap: max(10.5px, 4.4cqi); }
.ui-cf__progress .ui-cf__updated { min-width: 0; }
.ui-cf__progress .ui-cf__updated > * { overflow: clip visible; white-space: nowrap; text-overflow: ellipsis; }
.ui-cf__bar { display: block; height: 4px; overflow: hidden; border-radius: 2px; background: rgb(255 255 255 / 0.25); }
.ui-cf__bar i { display: block; height: 100%; border-radius: inherit; background: #fff; }
.ui-cf__back dl { display: flex; flex-direction: column; margin: 0; }
.ui-cf__back dl div { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 2.4cqi 0; border-top: 1px solid var(--fluid-hairline); font-size: max(12px, 5.2cqi); }
.ui-cf__back dt { color: var(--muted); }
.ui-cf__back dd { margin: 0; font-weight: 500; font-variant-numeric: tabular-nums; }

/* The rail: the card leaves the sidebar */
.ui-as-app[data-collapsed] .ui-as-side .ui-cf { display: none; }
`;

/** The cards' styles, for screens that lay out their own cards from these classes (ui-cf__*) */
export { css as courseCardCss };
