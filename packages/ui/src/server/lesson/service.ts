import { execFileSync } from "node:child_process";
import { courseTitle } from "@dojofoo/config/course-installations";
import { prepareWorkspace } from "@dojofoo/config/project-preparation";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  type DojoManifest,
  type ChapterReference,
  courseContent,
  type CourseIntroduction,
  findCurrentKata,
  dojoDir,
  findKataByIdOrName,
  findNextKata,
  kataState,
  readCatalog,
  readDojoRc,
  resolveAllKatas,
  writeDojoRc,
} from "@dojofoo/config";
import type { DojoLessonContext, LearnerEvidenceExcerpt, LearnerObservation } from "@dojofoo/protocol";
import { withPathLock, writeFileAtomic } from "@dojofoo/harness/persona";
import { resolveAgent } from "@dojofoo/config/runtime";
import { learnerEvidence as storedLearnerEvidence } from "../agent-session/evidence";
import { updateOpenWindows } from "../agent-session/guard-store";
import { lessonEvidence } from "./learner-evidence";
import { recordLearnerObservation } from "./learner-observations";
import { senseiTurn } from "./instructions";
import { parseSenseiContent } from "./sensei-content";

type WebState = {
  version: 4;
  results: Record<string, TestReport>;
  learnerObservations: Record<string, LearnerObservation[]>;
  observations: Record<string, {
    /** The latest check's observation id, so a kata context read can mark its report seen (D16) */
    id?: string;
    code: string;
    failureSignature: string;
    attempt: number;
  }>;
};

export type TestReport = {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  durationMs?: number;
  complete: boolean;
  tests: Array<{
    name: string;
    suite: string[];
    filePath?: string;
    status: "passed" | "failed" | "skipped";
    failureMessages: string[];
    durationMs?: number;
  }>;
  coverage?: {
    lines: { covered: number; total: number; percentage: number };
    lineHits: Record<string, number>;
  };
};

export type CheckObservation = {
  id: string;
  attempt: number;
  codeChanged: boolean;
  diff: string;
  report: TestReport;
};

export type LessonSnapshot = {
  dojo: string;
  course?: Pick<DojoManifest, "appearance" | "name" | "title" | "version" | "description" | "author" | "repository" | "language"> & { lessons: number; chapters?: ChapterReference[]; intro?: CourseIntroduction | null };
  kata: string;
  title: string;
  briefing: string;
  intro?: CourseIntroduction | null;
  chapter?: ChapterReference & { intro?: CourseIntroduction | null };
  contentIssues?: string[];
  /** Course-relative authored material location, which can differ from the learner's file directory. */
  briefingBasePath?: string;
  code: string;
  starterCode: string;
  fileId: "solution";
  filePath: string;
  language: "javascript" | "typescript" | "python";
  introduced: boolean;
  harness?: string;
  state: "completed" | "ongoing" | "not-started";
  isCurrent: boolean;
  result: TestReport | null;
  learnerEvidence?: LearnerEvidenceExcerpt[];
  learnerObservations?: LearnerObservation[];
  fragments: Record<string, string>;
  lessons: Array<{ name: string; title: string; summary: string; state: string; isCurrent: boolean; chapter?: ChapterReference }>;
  /** Whether `.dojorc` names this course as `currentDojo` (the learner's read); only "Make this my current course" changes it (D30) */
  courseCurrent?: boolean;
};

export type LessonFileResource = {
  type: "lesson-files";
  id: "solution";
  attributes: {
    path: string;
    language: LessonSnapshot["language"];
    content: string;
    starterContent: string;
  };
};

export function dojoLessonContext(snapshot: LessonSnapshot): DojoLessonContext {
  return {
    phase: snapshot.introduced ? "resume" : "start",
    course: {
      id: snapshot.dojo,
      completedLessons: snapshot.lessons
        .filter(lesson => lesson.state === "completed" && lesson.name !== snapshot.kata)
        .map(lesson => ({ id: lesson.name, title: lesson.title, summary: lesson.summary })),
    },
    lesson: {
      id: snapshot.kata,
      title: snapshot.title,
      objective: snapshot.briefing || snapshot.title,
      state: snapshot.state,
    },
    learner: {
      file: { path: snapshot.filePath, language: snapshot.language, content: snapshot.code },
      latestCheck: snapshot.result,
      ...(snapshot.learnerEvidence?.length ? { evidence: snapshot.learnerEvidence } : {}),
      ...(snapshot.learnerObservations?.length ? { interpretations: snapshot.learnerObservations } : {}),
    },
  };
}

export function dojoLessonFragment(snapshot: LessonSnapshot, fragmentId: string): { fragmentId: string } {
  if (!snapshot.fragments[fragmentId]) throw new Error(`Lesson fragment not found: ${fragmentId}`);
  return { fragmentId };
}

type LessonParts = {
  rc: ReturnType<typeof readDojoRc>;
  catalog: ReturnType<typeof readCatalog>;
  katas: ReturnType<typeof resolveAllKatas>;
  progress: NonNullable<ReturnType<typeof readDojoRc>["progress"]>[string] | undefined;
  current: ReturnType<typeof findCurrentKata>;
  selected: NonNullable<ReturnType<typeof findKataByIdOrName>>;
  sensei: string;
  senseiContent: ReturnType<typeof parseSenseiContent>;
  webState: WebState;
  result: TestReport | null;
  learnerEvidence: LearnerEvidenceExcerpt[];
};

/** A lesson as the learner's page reads it; `conversation` names the workspace's coding agent. */
function lessonSnapshot(root: string, parts: LessonParts, conversation: Pick<LessonSnapshot, "harness">): LessonSnapshot {
  const { rc, catalog, katas, progress, current, selected, sensei, senseiContent, webState, result, learnerEvidence } = parts;
  const selectedState = kataState(selected, progress);
  const scaffoldPath = selected.starterPath ?? resolve(dojoDir(root, rc.currentDojo), selected.template);
  const starterCode = existsSync(scaffoldPath) ? readFileSync(scaffoldPath, "utf8") : "";
  const content = courseContent(dojoDir(root, rc.currentDojo), catalog as unknown as Record<string, unknown>);
  const intro = content.lessons.find(lesson => lesson.id === selected.name)?.intro;
  const chapter = content.chapters.find(chapter => chapter.id === (selected.chapter?.id ?? "default"));
  return {
    dojo: rc.currentDojo,
    course: { appearance: catalog.appearance, name: catalog.name, title: courseTitle(root, rc.currentDojo, catalog), version: catalog.version, description: catalog.description, author: catalog.author,
      repository: catalog.repository, language: catalog.language, chapters: content.chapters, intro: content.intro, lessons: katas.length },
    kata: selected.name,
    title: selected.title ?? humanTitle(selected.name),
    intro, chapter, contentIssues: content.issues,
    briefing: intro?.content ?? senpaiBriefing(sensei),
    briefingBasePath: intro ? dirname(intro.path) : relative(dojoDir(root, rc.currentDojo), dirname(selected.senseiPath)),
    code: existsSync(selected.workspacePath) ? readFileSync(selected.workspacePath, "utf8") : starterCode,
    starterCode,
    fileId: "solution",
    filePath: relative(root, selected.workspacePath),
    language: editorLanguage(selected.workspacePath),
    introduced: progress?.kataIntros?.includes(selected.name) === true,
    ...conversation,
    state: selectedState,
    isCurrent: selected.name === current?.name,
    result,
    learnerEvidence,
    learnerObservations: webState.learnerObservations[rc.currentDojo] ?? [],
    fragments: senseiContent.fragments,
    lessons: katas.map((kata) => ({
      chapter: kata.chapter,
      name: kata.name,
      title: kata.title ?? humanTitle(kata.name),
      summary: content.lessons.find(lesson => lesson.id === kata.name)?.intro?.content.split("\n").map(line => line.trim()).find(line => line && !line.startsWith("#")) ?? lessonSummary(readFileSync(kata.senseiPath, "utf8")),
      state: kataState(kata, progress),
      isCurrent: kata.name === current?.name,
    })),
  };
}

/** The rc as the course `courseId` sees it, whatever the CLI's current course is (D30); written back only by "Make this my current course". */
export function courseView(stored: ReturnType<typeof readDojoRc>, courseId: string): ReturnType<typeof readDojoRc> {
  return stored.currentDojo === courseId ? stored
    : { ...stored, currentDojo: courseId, currentKata: stored.progress?.[courseId]?.lastActive ?? null };
}

/** The learner's read of a lesson of any course. */
export async function readLesson(root: string, courseId: string, lessonId: string): Promise<LessonSnapshot | null> {
  const stored = readDojoRc(root);
  const rc = courseView(stored, courseId);
  if (!rc.currentDojo) return null;
  const catalog = readCatalog(root, rc.currentDojo);
  const katas = resolveAllKatas(root, rc, catalog);
  const progress = rc.progress?.[rc.currentDojo];
  const current = findCurrentKata(katas, rc.currentKata) ?? findNextKata(katas, progress);
  const selected = findKataByIdOrName(katas, lessonId);
  if (!selected) return null;
  const webState = readWebState(root);
  const sensei = readFileSync(selected.senseiPath, "utf8");
  const priorLesson = katas.slice(0, katas.indexOf(selected)).reverse().find(kata => kataState(kata, progress) === "completed");
  const evidence = lessonEvidence(await storedLearnerEvidence(root, courseId, selected.name),
    priorLesson ? await storedLearnerEvidence(root, courseId, priorLesson.name) : []);
  // A completed lesson without a stored report shows its test map, as the prepared read does, without writing it
  const result = webState.results[lessonKey(courseId, selected.name)]
    ?? (kataState(selected, progress) === "completed" ? completedTestReport(sensei) : null);
  return { ...lessonSnapshot(root, { rc, catalog, katas, progress, current, selected, sensei, senseiContent: parseSenseiContent(sensei), webState, result, learnerEvidence: evidence },
    { harness: resolveAgent(root) }), courseCurrent: stored.currentDojo === courseId };
}

export async function readLessonFile(
  root: string,
  courseId: string,
  lessonId: string,
  fileId: string,
): Promise<LessonFileResource> {
  if (fileId !== "solution") throw new Error(`Lesson file not found: ${fileId}`);
  const lesson = await readLesson(root, courseId, lessonId);
  if (!lesson || lesson.dojo !== courseId) throw new Error(`Lesson not found: ${lessonId}`);
  return {
    type: "lesson-files",
    id: "solution",
    attributes: {
      path: lesson.filePath,
      language: lesson.language,
      content: lesson.code,
      starterContent: lesson.starterCode,
    },
  };
}

export async function writeLessonFile(
  root: string,
  courseId: string,
  lessonId: string,
  fileId: string,
  content: string,
): Promise<LessonFileResource> {
  if (fileId !== "solution") throw new Error(`Lesson file not found: ${fileId}`);
  await writeSolution(root, courseId, lessonId, content);
  clearCheckResult(root, courseId, lessonId);
  return readLessonFile(root, courseId, lessonId, fileId);
}

/** The one writer of a lesson's solution file (constraint 4): temp file and rename inside the path's lock, then the rc rules. */
export async function writeSolution(root: string, courseId: string, lessonId: string, content: string): Promise<void> {
  const target = lessonTarget(root, courseId, lessonId);
  await withPathLock(target.workspacePath, async () => {
    await writeFileAtomic(target.workspacePath, content);
    // A save while Sensei works is the learner's, so the guard keeps it (D21); inside the lock, a verify cannot interleave
    await updateOpenWindows(root, target.workspacePath, content);
  });
  markActive(root, courseId, lessonId);
}

/** The lesson's SENSEI.md, for Sensei's per-session instructions. */
export function lessonSource(root: string, courseId: string, lessonId: string): string {
  return readFileSync(lessonTarget(root, courseId, lessonId).senseiPath, "utf8");
}

/** The observation id of the lesson's stored check result, when there is one. */
export function latestObservationId(root: string, courseId: string, lessonId: string): string | undefined {
  const state = readWebState(root);
  const key = lessonKey(courseId, lessonId);
  return state.results[key] ? state.observations[key]?.id : undefined;
}

/** The lesson's solution file, which the guard copies (design, "Write guard"). */
export function solutionPath(root: string, courseId: string, lessonId: string): string {
  return lessonTarget(root, courseId, lessonId).workspacePath;
}

/** A completed begin turn introduced the lesson (`progress[courseId].kataIntros`). */
export function markLessonIntroduced(root: string, courseId: string, lessonId: string): void {
  const rc = readDojoRc(root);
  rc.progress ??= {};
  rc.progress[courseId] ??= { completed: [], lastActive: null };
  const progress = rc.progress[courseId];
  progress.kataIntros ??= [];
  if (progress.kataIntros.includes(lessonId)) return;
  progress.kataIntros.push(lessonId);
  writeDojoRc(root, rc);
}

/** `progress[courseId].lastActive` always; `currentKata` only for the CLI's current course (D30). */
function markActive(root: string, courseId: string, lessonId: string): void {
  const rc = readDojoRc(root);
  if (rc.currentDojo === courseId) rc.currentKata = lessonId;
  rc.progress ??= {};
  rc.progress[courseId] ??= { completed: [], lastActive: null };
  rc.progress[courseId].lastActive = lessonId;
  writeDojoRc(root, rc);
}

/** A save, a guard restore or a navigation makes the stored check result stale. */
export function clearCheckResult(root: string, courseId: string, lessonId: string): void {
  const state = readWebState(root);
  if (!(lessonKey(courseId, lessonId) in state.results)) return;
  delete state.results[lessonKey(courseId, lessonId)];
  writeWebState(root, state);
}

/** A lesson can only be left forward once its checks pass or it is completed. */
export class LessonIncompleteError extends Error {
  readonly status = 409;
  readonly code = "lesson_incomplete";
  constructor(message = "Complete the current lesson before moving on") {
    super(message);
    this.name = "LessonIncompleteError";
  }
}

/** The learner's and Sensei's "Move on" (D25): the first lesson after `lessonId` that is not completed, scaffolded only when
 *  its file does not exist yet, so a visited lesson keeps the learner's work; no ACP history or checkpoint. */
export async function advanceLesson(root: string, courseId: string, lessonId: string): Promise<LessonSnapshot> {
  const lesson = await readLesson(root, courseId, lessonId);
  if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
  if (!lesson.result?.complete && lesson.state !== "completed") throw new LessonIncompleteError();
  const rc = courseView(readDojoRc(root), courseId);
  const katas = resolveAllKatas(root, rc, readCatalog(root, courseId));
  const index = katas.findIndex(kata => kata.name === lesson.kata);
  const next = katas.slice(index + 1).find(kata => !rc.progress?.[courseId]?.completed.includes(kata.name));
  if (!next) throw new Error("The dojo is complete");
  if (!next.workspaceIsSource && !existsSync(next.workspacePath)) {
    const scaffoldPath = next.starterPath ?? resolve(dojoDir(root, courseId), next.template);
    if (!existsSync(scaffoldPath)) throw new Error(`Lesson scaffold not found: ${next.name}`);
    await writeSolution(root, courseId, next.name, readFileSync(scaffoldPath, "utf8"));
  } else markActive(root, courseId, next.name);
  const snapshot = await readLesson(root, courseId, next.name);
  if (!snapshot) throw new Error("No next lesson is available");
  return snapshot;
}

/** The lesson's checks on whatever its file holds, recording nothing: no completion, no web.json result (an evaluation's fixtures). */
export async function runLessonTests(root: string, courseId: string, lessonId: string): Promise<TestReport> {
  await prepareWorkspace(root);
  return parseTestReport(runDojo(root, ["kata", lessonId, "--check", "--course", courseId, "--no-record", "--reporter=json"]));
}

export async function checkLesson(
  root: string,
  courseId: string,
  lessonId: string,
): Promise<{ lesson: LessonSnapshot; observation: CheckObservation }> {
  const target = lessonTarget(root, courseId, lessonId);
  const code = existsSync(target.workspacePath) ? readFileSync(target.workspacePath, "utf8") : "";
  // Trials enter through the server rather than the CLI's startup preparation.
  // Reuse the same cached mise contract before invoking the prepared-only CLI.
  await prepareWorkspace(root);
  const output = runDojo(root, ["kata", lessonId, "--check", "--course", courseId, "--reporter=json"]);
  const report = parseTestReport(output);
  const webState = readWebState(root);
  const key = lessonKey(courseId, lessonId);
  const previous = webState.observations[key];
  const failureSignature = report.tests
    .filter((test) => test.status === "failed")
    .map((test) => [...test.suite, test.name].join(" > "))
    .sort()
    .join("\n");
  const codeChanged = previous?.code !== code;
  const attempt = previous && previous.failureSignature === failureSignature && !codeChanged
    ? previous.attempt + 1
    : 1;
  const id = crypto.randomUUID();
  webState.results[key] = report;
  webState.observations[key] = { id, code, failureSignature, attempt };
  writeWebState(root, webState);
  const updated = await readLesson(root, courseId, lessonId);
  if (!updated) throw new Error(`Lesson not found: ${lessonId}`);
  return {
    lesson: updated,
    observation: {
      id,
      attempt,
      codeChanged,
      diff: lineDelta(previous?.code ?? "", code),
      report,
    },
  };
}

function lineDelta(previous: string, current: string): string {
  if (previous === current) return "No code change since the previous check.";
  const before = previous.split("\n");
  const after = current.split("\n");
  const lines: string[] = [];
  for (let index = 0; index < Math.max(before.length, after.length); index++) {
    if (before[index] === after[index]) continue;
    if (before[index] !== undefined) lines.push(`- ${before[index]}`);
    if (after[index] !== undefined) lines.push(`+ ${after[index]}`);
  }
  return lines.slice(0, 40).join("\n") || "Code changed.";
}

export function checkObservationInstruction(observation: Pick<CheckObservation, "attempt" | "codeChanged" | "report">): string {
  const step = observation.report.complete ? senseiTurn("check-passed")
    : observation.codeChanged ? senseiTurn("check-changed")
    : observation.attempt === 1 ? senseiTurn("check-unchanged")
    : observation.attempt === 2 ? senseiTurn("check-unchanged-again")
    : senseiTurn("check-repeated", { attempt: String(observation.attempt) });
  return `${senseiTurn("check-base")} ${step}`;
}

function lessonTarget(root: string, courseId: string, lessonId: string) {
  const rc = courseView(readDojoRc(root), courseId);
  const catalog = readCatalog(root, courseId);
  const lesson = findKataByIdOrName(resolveAllKatas(root, rc, catalog), lessonId);
  if (!lesson) throw new Error(`Lesson not found: ${lessonId}`);
  return lesson;
}

function runDojo(root: string, args: string[]): string {
  const configured = dojoCliPath();
  const command = configured ? process.execPath : "npx";
  const commandArgs = configured ? [configured, ...args] : ["dojofoo", ...args];
  return execFileSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DOJO_PROJECT_ROOT: root, DOJO_SKIP_PREPARE: "1" },
    timeout: 90_000,
  });
}

function dojoCliPath(): string | undefined {
  if (process.env.DOJO_CLI) return process.env.DOJO_CLI;
  const serverEntry = process.argv[1];
  if (!serverEntry) return undefined;
  const bundledCli = resolve(dirname(serverEntry), "..", "..", "index.js");
  return existsSync(bundledCli) ? bundledCli : undefined;
}

function senpaiBriefing(markdown: string): string {
  const section = markdown.match(/## Briefing\s*\n([\s\S]*?)(?=\n## |$)/i)?.[1] ?? "";
  return section.replace(/### Hints[\s\S]*$/i, "").trim();
}

function lessonSummary(markdown: string): string {
  const briefing = senpaiBriefing(markdown);
  const prose = briefing
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !/^\d+[.)]\s/.test(line));
  if (!prose) return "Open this lesson to see its learning goal.";
  return prose.replaceAll("`", "").replace(/\.$/, "") + ".";
}

function humanTitle(name: string): string {
  return name.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function testSummary(output: string): string {
  return output.replace(/<dojo:prompt>[\s\S]*?<\/dojo:prompt>/g, "").trim();
}

function parseTestReport(output: string): TestReport {
  try {
    const result = JSON.parse(output) as {
      total: number;
      passed: number;
      failed?: number;
      skipped?: number;
      durationMs?: number;
      tests: Array<{
        name?: string;
        title?: string;
        suite?: string[];
        filePath?: string;
        status: "passed" | "failed" | "skipped";
        failureMessages?: string[];
        durationMs?: number;
      }>;
      coverage?: TestReport["coverage"];
      error: string | null;
    };
    if (result.error) throw new Error(result.error);
    return {
      passed: result.passed,
      failed: result.failed ?? result.tests.filter((test) => test.status === "failed").length,
      skipped: result.skipped ?? result.tests.filter((test) => test.status === "skipped").length,
      total: result.total,
      ...(result.durationMs === undefined ? {} : { durationMs: result.durationMs }),
      complete: result.total > 0 && result.passed === result.total,
      tests: result.tests.map((test) => ({
        name: test.name ?? test.title ?? "Unnamed test",
        suite: test.suite ?? [],
        ...(test.filePath ? { filePath: test.filePath } : {}),
        status: test.status,
        failureMessages: test.failureMessages ?? [],
        ...(test.durationMs === undefined ? {} : { durationMs: test.durationMs }),
      })),
      ...(result.coverage ? { coverage: result.coverage } : {}),
    };
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      // Migrate reports persisted before the machine-readable CLI reporter.
    } else {
      throw cause;
    }
  }
  const summary = testSummary(output);
  const counts = summary.match(/:\s+(\d+)\/(\d+)(?:\s+passing|\s+—\s+complete!)/i);
  if (!counts) throw new Error("The dojo returned an unreadable test report");
  const passed = Number(counts[1]);
  const total = Number(counts[2]);
  const tests = [...summary.matchAll(/^\s*\[([x ])\]\s+(.+)$/gim)].map((match) => ({
    name: match[2].trim(),
    suite: [],
    status: match[1].toLowerCase() === "x" ? "passed" as const : "failed" as const,
    failureMessages: [],
  }));
  return { passed, failed: total - passed, skipped: 0, total, complete: total > 0 && passed === total, tests };
}

function completedTestReport(sensei: string): TestReport | null {
  const table = sensei.match(/## Test Map\s*\n([\s\S]*?)(?=\n## |$)/i)?.[1] ?? "";
  const titles = table
    .split("\n")
    .filter((line) => /^\|/.test(line) && !/^\|\s*(?:Test\s*\||[-: ]+\|)/i.test(line))
    .map((line) => line.split("|")[1]?.trim().replaceAll("`", ""))
    .filter((title): title is string => Boolean(title));
  if (titles.length === 0) return null;
  return {
    passed: titles.length,
    failed: 0,
    skipped: 0,
    total: titles.length,
    complete: true,
    tests: titles.map((name) => ({ name, suite: [], status: "passed", failureMessages: [] })),
  };
}

function editorLanguage(path: string): LessonSnapshot["language"] {
  if (/\.py$/i.test(path)) return "python";
  if (/\.[cm]?js$/i.test(path)) return "javascript";
  return "typescript";
}

function lessonKey(dojo: string, kata: string): string {
  return `${dojo}/${kata}`;
}

function webStatePath(root: string): string {
  return resolve(root, ".dojo", "web.json");
}

/** A kata observation from the host port (decision 12): its sources are Eve's evidence store, it is kept in web.json. */
export function saveObservation(root: string, courseId: string, input: unknown, sources: LearnerEvidenceExcerpt[]): LearnerObservation {
  const state = readWebState(root);
  const result = recordLearnerObservation(state.learnerObservations[courseId] ?? [], input, sources);
  state.learnerObservations[courseId] = result.observations;
  writeWebState(root, state);
  return result.observation;
}

function readWebState(root: string): WebState {
  const path = webStatePath(root);
  if (!existsSync(path)) return { version: 4, results: {}, observations: {}, learnerObservations: {} };
  // A file with the ACP lesson's threads, checkpoints and learnerEvidence reads fine; they are dropped on the next write
  const stored = JSON.parse(readFileSync(path, "utf8")) as {
    results?: Record<string, string | TestReport>;
    observations?: WebState["observations"];
    learnerObservations?: WebState["learnerObservations"];
  };
  const results = Object.fromEntries(
    Object.entries(stored.results ?? {}).map(([key, result]) => [
      key,
      typeof result === "string" ? parseTestReport(result) : normalizeStoredTestReport(result),
    ]),
  );
  return {
    version: 4,
    results,
    observations: stored.observations ?? {},
    learnerObservations: stored.learnerObservations ?? {},
  };
}

function normalizeStoredTestReport(report: TestReport | Record<string, unknown>): TestReport {
  if (Array.isArray((report as TestReport).tests)) return report as TestReport;
  const legacy = report as {
    passed: number;
    total: number;
    complete: boolean;
    checks?: Array<{ title: string; status: "passed" | "failed"; failureMessages?: string[] }>;
  };
  const tests = (legacy.checks ?? []).map((check) => ({
    name: check.title,
    suite: [],
    status: check.status,
    failureMessages: check.failureMessages ?? [],
  }));
  return {
    passed: legacy.passed,
    failed: tests.filter((test) => test.status === "failed").length,
    skipped: 0,
    total: legacy.total,
    complete: legacy.complete,
    tests,
  };
}

function writeWebState(root: string, state: WebState): void {
  const path = webStatePath(root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`);
}
