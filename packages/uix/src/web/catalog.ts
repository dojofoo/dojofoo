import type { CardShaderKind } from "~/components/color-card";
import type { CourseArtwork, CourseInfo } from "~/components/course-card";

/*
 * The website's course catalog, as its Courses API serves it (apps/web/src/lib/courses.ts: MarketplaceCourse), with
 * what the UIX cards draw a course from (its artwork, rating). Sample data: the learner pages' courses and the two
 * dojos the docs describe. Each course's numbers are made up but fixed, from its id.
 */

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

type Seed = Omit<WebCourse, "slug" | "source" | "repositoryUrl" | "installUrl" | "metrics" | "kataCount" | "stars" | "firstSeen" | "audits"> & { installs: number; finishRate: number; stars: number; firstSeen: string; risk?: "low" | "medium" };

const seeds: Seed[] = [
  { id: "effect-ts", stars: 1840, firstSeen: "2026-03-02", shader: "opal", name: "Effect-TS", description: "Master Effect-TS through hands-on katas, from Effect.succeed to managed runtimes.", version: "1.3.0", publishedAt: "2026-09-18", repository: "dojofoo/effect-ts", author: "Dojo.foo", language: "TypeScript", framework: "Effect", tags: ["effect", "functional", "concurrency"], mode: "katas", trendingRank: 1, rating: 4.9, hours: 14, art: { hue: 270, glyph: "FX" }, installs: 4820, finishRate: 0.31,
    chapters: ["Foundations", "Errors", "Modelling", "Services & Layers", "Schema", "Concurrency", "Resources", "Streams", "Observability", "HTTP", "Capstone", "Advanced"] },
  { id: "pydantic-agents", stars: 960, firstSeen: "2026-06-11", shader: "waves", name: "Pydantic Agents", description: "Learn Pydantic models, validation, and pydantic-ai agents through hands-on katas.", version: "0.8.1", publishedAt: "2026-10-02", repository: "dojofoo/pydantic-agents", author: "Dojo.foo", language: "Python", framework: "pydantic-ai", tags: ["python", "validation", "agents"], mode: "katas", trendingRank: 2, rating: 4.7, hours: 8, art: { hue: 330, glyph: "PA" }, installs: 2310, finishRate: 0.27,
    chapters: ["Models", "Validation", "Settings", "Serialization", "Agents", "Tools", "Structured output", "Evals"] },
  { id: "everyday-typescript", stars: 3120, firstSeen: "2026-01-19", shader: "topography", name: "Everyday TypeScript", description: "Arrays, objects and the types that keep them honest – one small program at a time.", version: "1.5.0", publishedAt: "2026-10-12", repository: "dojofoo/everyday-typescript", author: "Dojo.foo", language: "TypeScript", framework: null, tags: ["typescript", "basics"], mode: "katas", trendingRank: 3, rating: 4.9, hours: 6, art: { hue: 350, glyph: "TS" }, installs: 12400, finishRate: 0.42,
    chapters: ["Arrays", "Objects", "Narrowing", "Generics"] },
  { id: "async-javascript", stars: 2410, firstSeen: "2026-02-08", shader: "network", name: "Async JavaScript", description: "Promises, async and await, and cancelling what you started.", version: "2.0.1", publishedAt: "2026-10-08", repository: "dojofoo/async-javascript", author: "Dojo.foo", language: "JavaScript", framework: null, tags: ["javascript", "async", "promises"], mode: "interactive", trendingRank: 4, rating: 4.8, hours: 5, art: { hue: 190, glyph: "JS" }, installs: 9800, finishRate: 0.38,
    chapters: ["Callbacks", "Promises", "Async and await", "Cancellation", "The event loop"] },
  { id: "learn-vitest", stars: 15800, firstSeen: "2026-04-22", shader: "waves", name: "Testing with Vitest", description: "Tests that tell you what broke and why.", version: "1.2.0", publishedAt: "2026-10-02", repository: "vitest-dev/learn-vitest", author: "Vitest", language: "TypeScript", framework: "Vitest", tags: ["testing", "typescript"], mode: "katas", trendingRank: 6, rating: 4.7, hours: 4, art: { hue: 145, glyph: "VT" }, installs: 6200, finishRate: 0.36,
    chapters: ["First test", "Matchers", "Mocks", "Snapshots"] },
  { id: "advanced-typescript", stars: 870, firstSeen: "2026-05-30", shader: "waves", name: "Advanced TypeScript", description: "Types that compute: mapped, conditional and template literal types.", version: "0.9.2", publishedAt: "2026-09-30", repository: "dojofoo/advanced-typescript", author: "Dojo.foo", language: "TypeScript", framework: null, tags: ["typescript", "types"], mode: "explorative", trendingRank: 5, rating: 4.6, hours: 9, art: { hue: 255, glyph: "ATS" }, installs: 3100, finishRate: 0.22,
    chapters: ["Narrowing shapes", "Mapped types", "Conditional types"] },
  { id: "rust-for-ts", stars: 640, firstSeen: "2026-07-03", risk: "medium", shader: "topography", name: "Rust for TypeScript devs", description: "Ownership and borrowing, from what you already know.", version: "0.6.0", publishedAt: "2026-09-14", repository: "ferris-school/rust-for-ts", author: "Community", language: "Rust", framework: null, tags: ["rust", "systems"], mode: "mentor", trendingRank: 7, rating: 4.5, hours: 12, art: { hue: 35, glyph: "RS" }, installs: 4000, finishRate: 0.18,
    chapters: ["Ownership", "Borrowing", "Structs", "Enums", "Traits", "Errors", "Iterators"] },
  { id: "sql-foundations", stars: 1210, firstSeen: "2026-02-27", shader: "network", name: "SQL Foundations", description: "Select, join and group – queries you can read later.", version: "1.0.3", publishedAt: "2026-10-01", repository: "dojofoo/sql-foundations", author: "Dojo.foo", language: "SQL", framework: null, tags: ["sql", "data"], mode: "interactive", trendingRank: 8, rating: 4.3, hours: 5, art: { hue: 295, glyph: "SQL" }, installs: 5500, finishRate: 0.33,
    chapters: ["Select", "Filter", "Join", "Group", "Subqueries"] },
  { id: "regex", stars: 430, firstSeen: "2026-03-16", shader: "network", name: "Regex Katas", description: "Patterns from simple matches to lookarounds.", version: "3.1.0", publishedAt: "2026-08-21", repository: "katacommunity/regex", author: "Community", language: "JavaScript", framework: null, tags: ["regex", "javascript"], mode: "katas", trendingRank: 9, rating: 4.4, hours: 3, art: { hue: 235, glyph: "RX" }, installs: 2700, finishRate: 0.29,
    chapters: ["Literals", "Classes", "Quantifiers", "Groups", "Anchors", "Lookarounds"] },
];

/** A small fixed sequence per course: the same numbers on every render */
function random(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Sample audits of a course's files – what an automated scan of its manifest, SENSEI and lesson files would report */
function auditsOf(seed: Seed): CourseAudit[] {
  const at = `${seed.publishedAt}T09:00:00.000Z`;
  return [
    { provider: "Gen Agent Trust Hub", slug: "agent-trust-hub", status: "pass", summary: "No security issues detected in the course's teaching and lesson files.", auditedAt: at, riskLevel: "SAFE" },
    seed.risk === "medium"
      ? { provider: "Socket", slug: "socket", status: "warn", summary: "1 alert · its setup task downloads a toolchain", auditedAt: at, riskLevel: "MEDIUM" }
      : { provider: "Socket", slug: "socket", status: "pass", summary: "No alerts", auditedAt: at },
    { provider: "Snyk", slug: "snyk", status: "pass", summary: "Risk: LOW · No issues", auditedAt: at, riskLevel: "LOW" },
  ];
}

function build({ installs, finishRate, risk: _risk, ...seed }: Seed): WebCourse {
  const next = random(seed.id);
  const [source, slug] = seed.repository.split("/");
  const started = Math.round(installs * (0.62 + next() * 0.12));
  const finished = Math.round(started * finishRate);
  // Each chapter keeps most of those who reached the one before, falling evenly (give or take) to the last one's
  // readers – whoever finished the course finished its last chapter, so a few more than them reached it
  const count = seed.chapters.length;
  const lastReached = Math.round(finished * 1.12);
  const step = count > 1 ? (lastReached / started) ** (1 / (count - 1)) : 1;
  let reached = started;
  const kataProgress = seed.chapters.map((kata, index) => {
    const last = index === count - 1;
    if (last) reached = lastReached;
    else if (index > 0) reached = Math.max(Math.round(reached * step * (0.97 + next() * 0.06)), lastReached);
    const done = last ? finished : Math.round(reached * (0.78 + next() * 0.12));
    return { kata, started: reached, finished: done, active: reached - done };
  });
  // Twelve weeks up to the course's last update, rising toward it
  const end = new Date("2026-10-19T00:00:00Z");
  const weeklyActivity = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(end);
    date.setUTCDate(end.getUTCDate() - (11 - index) * 7);
    const base = (installs / 40) * (0.55 + index * 0.06) * (0.85 + next() * 0.3);
    return { week: date.toISOString().slice(0, 10), installs: Math.round(base), started: Math.round(base * 0.68), finished: Math.round(base * 0.68 * finishRate) };
  });
  return {
    ...seed,
    slug,
    source,
    repositoryUrl: `https://github.com/${seed.repository}`,
    installUrl: seed.repository,
    kataCount: seed.chapters.length * 4 + Math.round(next() * 6),
    audits: auditsOf({ installs, finishRate, risk: _risk, ...seed }),
    metrics: { installs, started, progressing: started - finished, finished, completionRate: Math.round((finished / started) * 1000) / 10, kataProgress, weeklyActivity },
  };
}

export const catalog: WebCourse[] = seeds.map(build);

export const courseById = (id: string) => catalog.find((course) => course.id === id) ?? catalog[0];

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
