import type { CardShaderKind } from "../components/color-card";
import type { CourseArtwork, CourseInfo } from "../components/course-card";

/** Course presentation contracts and helpers. Applications supply catalog data. */

export type TeachingMode = "katas" | "interactive" | "explorative" | "mentor";

/** A security audit of a course's files, as the Courses API's audit route serves it (the skills.sh shape) */
export type CourseAudit = { provider: string; slug: string; status: "pass" | "warn" | "fail"; summary: string; auditedAt: string; riskLevel?: string };

export type KataProgress = { kata: string; started: number; finished: number; active: number };
export type WeeklyActivity = { week: string; installs: number; started: number; finished: number };

export type WebCourse = {
  id: string;
  slug: string;
  name: string;
  source: string;
  description: string;
  version: string;
  publishedAt: string;
  repository: string;
  repositoryUrl: string;
  author: string;
  language: string;
  framework: string | null;
  tags: string[];
  mode: TeachingMode;
  kataCount: number;
  installUrl: string;
  trendingRank: number;
  rating: number;
  hours: number;
  art: CourseArtwork;
  /** What drifts over its card (the learner pages' choice where it has one) */
  shader: CardShaderKind;
  /** Its repository's GitHub stars */
  stars: number;
  /** When the marketplace first saw it */
  firstSeen: string;
  audits: CourseAudit[];
  /** The chapters, in order: the metrics count how many reached each */
  chapters: string[];
  metrics: {
    installs: number;
    started: number;
    progressing: number;
    finished: number;
    completionRate: number;
    kataProgress: KataProgress[];
    weeklyActivity: WeeklyActivity[];
  };
};

export const teachingModes: Array<{ value: TeachingMode; label: string; description: string }> = [
  { value: "katas", label: "Katas", description: "Small failing tests, one at a time" },
  { value: "interactive", label: "Interactive", description: "Guided steps in your own project" },
  { value: "explorative", label: "Explorative", description: "Open questions, your own answers" },
  { value: "mentor", label: "Mentor", description: "Reviews and conversation" },
];

const shortDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** The course as the UIX cards draw it */
export const cardInfo = (course: WebCourse): CourseInfo => ({
  title: course.name,
  repo: course.repository,
  author: course.author,
  rating: course.rating,
  version: `v${course.version}`,
  updated: shortDate(course.publishedAt),
  language: course.language,
  chapters: course.chapters.length,
  lessons: course.kataCount,
  hours: course.hours,
  art: course.art,
});

export const installCommand = (course: WebCourse) => `npx dojofoo add ${course.installUrl}`;
/** The same, as an instruction for a coding agent: it installs the course and starts it */
export const installPrompt = (course: WebCourse) => `Install the ${course.name} dojo: run \`${installCommand(course)}\` in this project and follow its output, then run \`npx dojofoo ui\` to open its first lesson in the browser.`;
export const compactNumber = (n: number) => (n >= 1000 ? `${+(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `${n}`);
