import { acpAgentIds, type AcpAgentId } from "@dojofoo/protocol";

/** Every ACP lesson agent, plus Pi on its own driver. */
export const matrixHarnesses = [...acpAgentIds, "pi"] as const;

export type MatrixHarness = AcpAgentId | "pi";

export type CourseLesson = {
  id: string;
  initialSource: string;
  solvedSource: string;
};

export const starterCourseLessons: CourseLesson[] = [
  {
    id: "001-normalize-handle",
    initialSource: "/** Turn a display name into the canonical handle used by the dojo. */\nexport function normalizeHandle(input: string): string {\n  throw new Error(\"Not implemented\");\n}\n",
    solvedSource: "export function normalizeHandle(input: string): string {\n  return input.trim().toLowerCase().replace(/\\s+/g, '-');\n}\n",
  },
  {
    id: "002-validate-registration",
    initialSource: "export type RegistrationResult =\n  | { ok: true; handle: string }\n  | { ok: false; reason: \"empty\" | \"too-short\" };\n\n/** Validate a display name and return a typed registration result. */\nexport function validateRegistration(input: string): RegistrationResult {\n  throw new Error(\"Not implemented\");\n}\n",
    solvedSource: "export type RegistrationResult =\n  | { ok: true; handle: string }\n  | { ok: false; reason: \"empty\" | \"too-short\" };\n\nexport function validateRegistration(input: string): RegistrationResult {\n  const handle = input.trim().toLowerCase().replace(/\\s+/g, \"-\");\n  if (!handle) return { ok: false, reason: \"empty\" };\n  if (handle.length < 3) return { ok: false, reason: \"too-short\" };\n  return { ok: true, handle };\n}\n",
  },
  {
    id: "003-summarize-roster",
    initialSource: "export interface Registration {\n  readonly handle: string;\n  readonly active: boolean;\n}\n\nexport interface RosterSummary {\n  readonly total: number;\n  readonly active: number;\n  readonly handles: readonly string[];\n}\n\nexport function summarizeRoster(registrations: readonly Registration[]): RosterSummary {\n  throw new Error(\"Not implemented\");\n}\n",
    solvedSource: "export interface Registration {\n  readonly handle: string;\n  readonly active: boolean;\n}\n\nexport interface RosterSummary {\n  readonly total: number;\n  readonly active: number;\n  readonly handles: readonly string[];\n}\n\nexport function summarizeRoster(registrations: readonly Registration[]): RosterSummary {\n  return {\n    total: registrations.length,\n    active: registrations.filter((registration) => registration.active).length,\n    handles: registrations.map((registration) => registration.handle),\n  };\n}\n",
  },
];

export type CheckEvidence = {
  total: number;
  passed: number;
  failed: number;
};

export interface FullCourseDriver {
  begin(lesson: CourseLesson): Promise<void>;
  introduce(lesson: CourseLesson): Promise<string>;
  followUp?(lesson: CourseLesson): Promise<string>;
  writeSource(lesson: CourseLesson, source: string): Promise<void>;
  check(lesson: CourseLesson): Promise<CheckEvidence>;
  complete(lesson: CourseLesson): Promise<void>;
  advance(current: CourseLesson, next: CourseLesson): Promise<void>;
  reload(lesson: CourseLesson): Promise<void>;
}

export type FullCourseReport = {
  harness: MatrixHarness;
  lessons: Array<{ id: string; failing: CheckEvidence; passing: CheckEvidence }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * One reusable user journey for cassette, local, and authenticated harness tests.
 * The driver owns transport details; this function owns lifecycle invariants.
 */
export async function runFullCourseScenario(
  harness: MatrixHarness,
  driver: FullCourseDriver,
  lessons: CourseLesson[] = starterCourseLessons,
): Promise<FullCourseReport> {
  const results: FullCourseReport["lessons"] = [];

  for (const [index, lesson] of lessons.entries()) {
    await driver.begin(lesson);
    const introduction = await driver.introduce(lesson);
    assert(introduction.trim().length > 0, `${harness}/${lesson.id}: introduction was empty`);

    if (driver.followUp) {
      const followUp = await driver.followUp(lesson);
      assert(followUp.trim().length > 0, `${harness}/${lesson.id}: follow-up was empty`);
    }

    const failing = await driver.check(lesson);
    assert(failing.failed > 0, `${harness}/${lesson.id}: scaffold unexpectedly passed`);

    await driver.writeSource(lesson, lesson.solvedSource);
    const passing = await driver.check(lesson);
    assert(passing.total > 0, `${harness}/${lesson.id}: no checks ran`);
    assert(passing.failed === 0 && passing.passed === passing.total, `${harness}/${lesson.id}: solution did not pass`);

    await driver.complete(lesson);
    await driver.reload(lesson);
    results.push({ id: lesson.id, failing, passing });

    const next = lessons[index + 1];
    if (next) await driver.advance(lesson, next);
  }

  return { harness, lessons: results };
}
