import type { CSSProperties, ReactNode } from "react";
import { CardDetails, CardFigure, CardKicker, CardMark, CardText, CardTitle, ColorCard, ColorCardButton, ColorCardTag, type CardShaderKind } from "./color-card";
import { CertificateSeal } from "./certificate-seal";
import { cn } from "../lib/utils";

/*
 * Courses and certificates, as compositions of ColorCard. CourseArt draws a course's artwork – a gradient in its hue
 * with its monogram – at any size, or as a square cover the width of its column.
 *
 * CourseCard is the course as a big card that turns over: who made it top left (a mark, e.g. our logo, else the
 * author's name), its rating top right, the repository and the course's name, when it was updated at the foot; the back
 * only what the front doesn't say – version, language, chapters, lessons and the time it takes. A course you study
 * (`enrolled`) says what you have instead: your version top left – an Update button once there is a newer one – its
 * author over the title, and your progress at the foot, as the small cards show it.
 *
 *   <CourseCard mark={<BrandLogo />} course={{ title: "Everyday TypeScript", repo: "dojofoo/everyday-typescript",
 *     author: "Dojo.foo", rating: 4.9, version: "v1.4.0", updated: "12 Oct 2026", language: "TypeScript", chapters: 4,
 *     lessons: 12, hours: 6, art: { hue: 350, glyph: "TS" } }}
 *     enrolled={{ version: "v1.4.0", latest: "v1.5.0", onUpdate, progress: 42, label: "02 · Objects", value: "Merge settings" }} />
 *
 * CertificateCard is a certificate as a big, centered card that turns over: the badge at the top, what it certifies
 * from the middle line down, who earned it and when at the foot; the back its details and its hash.
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
  chapters?: number;
  lessons: number;
  /** Time to complete, in hours */
  hours?: number;
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

/** A course's color, for the cards drawn from one */
export const courseColor = (art: CourseArtwork) => `oklch(0.58 0.2 ${art.hue})`;

export function CourseCard({ course, mark, enrolled, badge, className, showVersion = false, flip = true }: { course: CourseInfo; /** In the author's name's place, e.g. our logo on our own courses */ mark?: ReactNode; /** A course you study: your version and progress */ enrolled?: CourseEnrollment; /** A format badge in place of the enrolled version label. */ badge?: ReactNode; className?: string; showVersion?: boolean; flip?: boolean }) {
  const outdated = enrolled?.latest !== undefined && enrolled.latest !== enrolled.version;
  return (<>
    <style href="ui-course-card" precedence="default">{css}</style>
    <ColorCard size="big" flip={flip} color={courseColor(course.art)} shader={course.shader ?? "topography"} seed={course.repo} className={cn("ui-course", className)}
      aria-label={enrolled ? `${course.title}, ${enrolled.progress}% done` : course.title}
      header={<>
        {!enrolled ? <CardMark>{mark ?? course.author}</CardMark>
          : badge ? <ColorCardTag className="ui-course__badge">{badge}</ColorCardTag> : outdated ? (
            // Over the card's turn-over button (and not pressing it), so it updates rather than turns
            <ColorCardButton disabled={enrolled.updating} title={`${enrolled.version} → ${enrolled.latest}`} aria-label={`Update ${course.title} to ${enrolled.latest}`}
              onPointerDown={(event) => event.stopPropagation()} onClick={enrolled.onUpdate}>{enrolled.updating ? "Updating…" : "Update"}</ColorCardButton>
          ) : <CardFigure>{enrolled.version}</CardFigure>}
        {showVersion ? <CardFigure aria-label={`Version ${course.version}`}>{course.version}</CardFigure> : course.rating !== undefined && <CardFigure aria-label={`Rated ${course.rating} out of 5`}>★ {course.rating.toFixed(1)}</CardFigure>}
      </>}
      // Its version has the top left, so a course you study names its author over the title (others, their repository)
      main={<>{enrolled ? <CardKicker>{course.author}</CardKicker> : <CardKicker code>{course.repo}</CardKicker>}<CardTitle>{course.title}</CardTitle></>}
      footer={enrolled ? <><CardText label={enrolled.label} value={enrolled.value} /><CardFigure>{enrolled.progress}%</CardFigure></> : <CardText label="Updated" value={course.updated} />}
      progress={enrolled?.progress}>
      <CardDetails items={[["Version", enrolled?.version ?? course.version], ["Language", course.language], ...(course.chapters === undefined ? [] : [["Chapters", course.chapters] as [string, number]]), ["Lessons", course.lessons], ...(course.hours === undefined ? [] : [["Time to complete", `~${course.hours}\u00a0h`] as [string, string]])]} />
    </ColorCard>
  </>);
}

export type CertificateInfo = { id: string; title: string; learner: string; issued: string; lessons: number; score: number; art: CourseArtwork; digest?: string };

/** A certificate: the badge – its rings drawn from the certificate's hash – what it certifies, who and when; turned
    over, its details and the hash itself (shortened to its ends; whole on hover and read aloud). The hash reproduces
    the badge; it doesn't prove the certificate was issued */
export function CertificateCard({ certificate, className }: { certificate: CertificateInfo; className?: string }) {
  return (<>
    <style href="ui-course-card" precedence="default">{css}</style>
    <ColorCard size="big" flip centered color={courseColor(certificate.art)} shader="topography" seed={certificate.id} className={cn("ui-certificate", className)}
      aria-label={`Certificate: ${certificate.title}`}
      header={<CertificateSeal digest={certificate.digest} className="ui-certificate__seal" />}
      main={<CardTitle>{certificate.title}</CardTitle>}
      footer={<CardText value={certificate.learner} label={`Issued ${certificate.issued}`} labelBelow />}>
      <CardDetails items={[
        ["Learner", certificate.learner],
        ["Lessons", certificate.lessons],
        ["Score", `${certificate.score}%`],
        ["ID", certificate.digest
          ? <span className="ui-certificate__hash" title={certificate.digest} aria-label={certificate.digest}>{certificate.digest.slice(0, 8)}…{certificate.digest.slice(-8)}</span>
          : `DOJO-${certificate.id.toUpperCase()}`],
      ]} />
    </ColorCard>
  </>);
}

const css = /* css */ `
.ui-course .ui-course__badge { border-radius: 999px; corner-shape: round; }
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
  border-radius: calc((var(--art-size) * 0.14) * var(--squircle-factor, 1));
  background:
    radial-gradient(120% 90% at 0% 0%, oklch(0.78 0.16 var(--art-hue) / 0.9), transparent 60%),
    linear-gradient(135deg, oklch(0.62 0.2 var(--art-hue)), oklch(0.34 0.13 calc(var(--art-hue) + 40)));
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12), var(--shadow-2);
  color: rgb(255 255 255 / 0.92);
}
.ui-cc-art b { font-size: calc(var(--art-size) * 0.42); font-weight: 750; line-height: 0.9; letter-spacing: -0.04em; }
/* A cover: square at the column's width, everything in proportion to it (its padding is a percentage – of the column,
   so of its own width; container units here would measure the window) */
.ui-cc-art[data-cover] { container-type: inline-size; width: 100%; height: auto; aspect-ratio: 1; padding: 9%; border-radius: calc(10px * var(--squircle-factor, 1)); }
.ui-cc-art[data-cover] b { font-size: 34cqi; }

/* The certificate's badge (116 by 102.2, cropped to what it draws), 28% of the card high: its word starts on the top
   padding; the hash on the back in monospace */
.ui-certificate .ui-certificate__seal { width: 32cqi; height: 28cqi; }
.ui-certificate__hash { font-family: var(--font-mono); font-size: 0.92em; }

/* The rail: the course card leaves the sidebar */
.ui-as-app[data-collapsed] .ui-as-side .ui-course { display: none; }
`;
