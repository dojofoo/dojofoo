import type { CSSProperties, ReactNode } from "react";
import { FlipCard } from "~/components/flip-card";
import { CardShader, type CardShaderKind } from "~/components/color-card";
import { cn } from "~/lib/utils";

/*
 * Course cards. CourseArt draws a course's artwork – a gradient in its hue with its monogram – at any size, or as a
 * square cover the width of its column. CourseFlipCard is the course as a square card that turns over (FlipCard): the
 * front in the course's colors, white contour lines drifting over it (Topography) – who made it top left (a mark, e.g.
 * our logo, else the author's name), its rating top right, the repository and the course's name, when it was updated
 * bottom left; the back only what the front doesn't say – version, language, chapters, lessons and the time it takes.
 *
 *   <CourseFlipCard mark={<BrandLogo />} course={{ title: "Everyday TypeScript", repo: "dojofoo/everyday-typescript",
 *     author: "Dojo", rating: 4.9, version: "v1.4.0", updated: "12 Oct 2026", language: "TypeScript", chapters: 4,
 *     lessons: 12, hours: 6, art: { hue: 350, glyph: "TS" } }} />
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

export function CourseArt({ art, size = 44, cover = false, className }: { art: CourseArtwork; size?: number; /** Square, as wide as its column – a tile's cover */ cover?: boolean; className?: string }) {
  return (
    <span className={cn("ui-cc-art", className)} data-cover={cover || undefined} aria-hidden="true" style={{ "--art-hue": art.hue, "--art-size": `${size}px` } as CSSProperties}>
      <style href="ui-course-card" precedence="default">{css}</style>
      <b>{art.glyph}</b>
    </span>
  );
}

/** The card's front: the course's colors with its contour map, who made it, its rating, its name and when it changed */
function CourseFront({ course, mark }: { course: CourseInfo; mark?: ReactNode }) {
  return (
    <div className="ui-cf__face ui-cf__front" style={{ "--art-hue": course.art.hue } as CSSProperties}>
      <style href="ui-course-card" precedence="default">{css}</style>
      <CardShader kind={course.shader ?? "topography"} seed={seedOf(course.repo)} className="ui-cf__lines" />
      <div className="ui-cf__row">
        <span className="ui-cf__author">{mark ?? course.author}</span>
        {course.rating !== undefined && <span className="ui-cf__rating" aria-label={`Rated ${course.rating} out of 5`}>★ {course.rating.toFixed(1)}</span>}
      </div>
      <div className="ui-cf__name">
        <span className="ui-cf__repo">{course.repo}</span>
        <b>{course.title}</b>
      </div>
      <div className="ui-cf__row ui-cf__row--end">
        <span className="ui-cf__updated"><small>Updated</small>{course.updated}</span>
        <FlipHint>Details</FlipHint>
      </div>
    </div>
  );
}

export function CourseFlipCard({ course, mark, className }: { course: CourseInfo; /** In the author's name's place, e.g. our logo on our own courses */ mark?: ReactNode; className?: string }) {
  return (
    <FlipCard className={cn("ui-cf h-auto w-full aspect-square", className)} frontLabel={`${course.title} – show details`} backLabel={`${course.title} – show the front`}
      front={<CourseFront course={course} mark={mark} />}
      back={
        <div className="ui-cf__face ui-cf__back">
          <span className="ui-cf__kicker">Details</span>
          <dl>
            <div><dt>Version</dt><dd>{course.version}</dd></div>
            <div><dt>Language</dt><dd>{course.language}</dd></div>
            <div><dt>Chapters</dt><dd>{course.chapters}</dd></div>
            <div><dt>Lessons</dt><dd>{course.lessons}</dd></div>
            <div><dt>Time to complete</dt><dd>~{course.hours} h</dd></div>
          </dl>
          <div className="ui-cf__row ui-cf__row--end"><span /><FlipHint>Front</FlipHint></div>
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
          <div className="ui-cf__row"><span className="ui-cf__author">{mark ?? "Dojo"}</span><span className="ui-cf__rating">{certificate.score}%</span></div>
          <div className="ui-cf__name"><span className="ui-cf__repo">Certificate of completion</span><b>{certificate.title}</b></div>
          <div className="ui-cf__row ui-cf__row--end"><span className="ui-cf__updated"><small>Issued</small>{certificate.issued}</span><FlipHint>Details</FlipHint></div>
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
          <div className="ui-cf__row ui-cf__row--end"><span /><FlipHint>Front</FlipHint></div>
        </div>
      } />
  );
}

/** Each course its own contour map: a number from its repository's name */
const seedOf = (text: string) => [...text].reduce((n, c) => (n * 31 + c.charCodeAt(0)) % 9973, 7);

/** The turn-over glyph and its word, as in the lab's FlipCard demo */
function FlipHint({ children }: { children: string }) {
  return (
    <span className="ui-cf__hint">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M13.25 8a5.25 5.25 0 0 1-9.4 3.2M2.75 8a5.25 5.25 0 0 1 9.4-3.2" />
        <path d="M12.5 2.25v2.5H10M3.5 13.75v-2.5H6" />
      </svg>
      {children}
    </span>
  );
}

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
.ui-cf__author { display: flex; align-items: center; height: max(9px, 4cqi); font-size: max(12px, 5.6cqi); font-weight: 600; letter-spacing: -0.01em; }
/* A mark sits at the name's height, in the front's white */
.ui-cf__author > * { height: 100%; width: auto; color: #fff; }
.ui-cf__rating { font-size: max(11.5px, 5cqi); font-weight: 600; font-variant-numeric: tabular-nums; }
.ui-cf__kicker { font-size: max(10px, 4.2cqi); font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: var(--muted); }
.ui-cf__name { display: flex; flex-direction: column; gap: 1.6cqi; min-width: 0; }
.ui-cf__repo { overflow: hidden; font-family: var(--font-mono); font-size: max(10.5px, 4.6cqi); opacity: 0.72; white-space: nowrap; text-overflow: ellipsis; }
.ui-cf__name b { font-size: 10cqi; line-height: 1.05; font-weight: 600; letter-spacing: -0.03em; text-wrap: balance; }
.ui-cf__updated { display: flex; flex-direction: column; gap: 1px; font-size: max(12px, 5cqi); font-weight: 500; font-variant-numeric: tabular-nums; }
.ui-cf__updated small { font-size: max(10.5px, 4.4cqi); font-weight: 400; opacity: 0.65; }
.ui-cf__hint { display: inline-flex; align-items: center; gap: 5px; font-size: max(11px, 4.8cqi); font-weight: 500; opacity: 0.65; }
.ui-cf__hint svg { width: 1.2em; height: 1.2em; }
.ui-cf__back dl { display: flex; flex-direction: column; margin: 0; }
.ui-cf__back dl div { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 2.4cqi 0; border-top: 1px solid var(--fluid-hairline); font-size: max(12px, 5.2cqi); }
.ui-cf__back dt { color: var(--muted); }
.ui-cf__back dd { margin: 0; font-weight: 500; font-variant-numeric: tabular-nums; }

/* The rail: the card leaves the sidebar */
.ui-as-app[data-collapsed] .ui-as-side .ui-cf { display: none; }
`;

/** The cards' styles, for screens that lay out their own cards from these classes (ui-cf__*) */
export { css as courseCardCss };
