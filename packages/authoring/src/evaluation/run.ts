import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { judgeMaterial, requireJudgeResults } from "./judges";
import { materialHash, readLessonMaterial } from "./material";
import { teachingJudgePrompt, teachingRubricVersion } from "./teaching-rubric";
import { TeachingFailure } from "./failure";
import { decidePanel, type PanelDecision } from "./panel";

type Panel = Awaited<ReturnType<typeof judgeMaterial>>;
export type EvaluationReport = {
  version: 1;
  directory: string;
  materialHash: string;
  teachingPolicyHash?: string;
  lessonIds: string[];
  status: "running" | "passed" | "material-failed" | "teaching-failed" | "infrastructure-failed" | "stale";
  stage: "material" | "trial" | "teaching";
  startedAt: string;
  completedAt?: string;
  material?: Panel;
  teaching?: Panel;
  /** Combined judge decisions; see panel.ts. */
  decisions?: { material?: PanelDecision; teaching?: PanelDecision };
  trialDirectory?: string;
  error?: string;
};

const requiredStages = ["introduction", "uncertainty", "unfamiliar-terminology", "misconception", "failure-1", "failure-2", "frustration", "independence", "success", "review"];
const explanationStages = new Set(["introduction", "uncertainty", "unfamiliar-terminology", "misconception", "frustration", "review"]);

// Dependencies still receive the signal for cleanup, but a stuck provider
// must not prevent the evaluator from saving its terminal report.
async function abortableStage<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let onAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try { return await Promise.race([run(), cancelled]); }
  finally { signal.removeEventListener("abort", onAbort); }
}
type RecordedTurn = { learnerProfile?: string; lessonId?: string; sessionId?: string; fastForward?: boolean; stage?: string; deterministicLifecycle?: string; parts?: Array<{ type: string; delta?: string }> };

/** Read evidence produced by the production worker, never the author's claims. */
export async function readTeachingEvidence(directory: string, lessonIds?: string[]) {
  const turns: RecordedTurn[] = JSON.parse(await readFile(join(directory, "evidence.json"), "utf8"));
  if (!Array.isArray(turns) || turns.at(-1)?.deterministicLifecycle !== "passed") {
    throw new Error("Production lifecycle did not pass");
  }
  const learnerProfile = turns[0]?.learnerProfile ?? "struggling";
  if (!["struggling", "confident"].includes(learnerProfile)) throw new Error("Unknown learner scenario");
  const stages = learnerProfile === "confident" ? ["introduction", "quick-understanding", "success", "review"] : requiredStages;
  const sessions = turns.filter(turn => turn.sessionId && turn.lessonId);
  // Only the last requested lesson is taught. Earlier lessons are completed
  // progress (solved and checked without a Sensei), which lets the judges assess
  // continuity without replaying, and re-judging, a lesson that already passed.
  const prior = turns.filter(turn => turn.fastForward && turn.lessonId).map(turn => turn.lessonId);
  const distinct = new Set(sessions.map(turn => turn.sessionId)).size === sessions.length && new Set(sessions.map(turn => turn.lessonId)).size === sessions.length;
  const scoped = !lessonIds || (sessions.length === 1 && sessions[0]!.lessonId === lessonIds.at(-1) && JSON.stringify(prior) === JSON.stringify(lessonIds.slice(0, -1)));
  if (!sessions.length || !distinct || !scoped) {
    throw new Error("Teaching evidence does not match the requested isolated lesson sessions");
  }
  for (const session of sessions) {
    for (const stage of stages) {
      const recorded = turns.filter(turn => turn.lessonId === session.lessonId && turn.stage === stage && Array.isArray(turn.parts));
      if (!recorded.length) {
        throw new Error(`Missing teaching evidence: ${session.lessonId}/${stage}`);
      }
      // A lifecycle marker or encrypted/private reasoning is not evidence of
      // teaching. Silent check observations remain valid; direct requests for
      // explanation need a learner-visible response for judges to assess.
      if (explanationStages.has(stage) && !recorded.some(turn => turn.parts?.some(part => part.type === "text-delta" && part.delta?.trim()))) {
        throw new Error(`Missing learner-visible teaching: ${session.lessonId}/${stage}`);
      }
    }
  }
  const evidence: Record<string, string> = {
    rubric: teachingRubricVersion,
    learnerProfile,
    lessonIds: JSON.stringify(sessions.map(session => session.lessonId)),
    completedBefore: JSON.stringify(prior),
    transcript: JSON.stringify(turns.map(turn => ({ ...turn, parts: turn.parts?.filter(part => !part.type.startsWith("reasoning-")) }))),
  };
  for (const name of await readdir(directory)) {
    if (name.endsWith("-instructions.md")) evidence[name] = await readFile(join(directory, name), "utf8");
  }
  return evidence;
}


/** One bounded attempt. Revisions create new attempts; old failures stay intact.
 * The trial callback invokes the isolated production worker, not another teacher.
 */
export async function evaluateAuthoredCourse({ root, lessonIds, signal, trial, teachingPolicy, judge = judgeMaterial }: {
  root: string;
  lessonIds: string[];
  signal: AbortSignal;
  teachingPolicy?: string;
  trial(signal: AbortSignal): Promise<string>;
  judge?: typeof judgeMaterial;
}): Promise<EvaluationReport> {
  signal.throwIfAborted();
  if (!lessonIds.length || lessonIds.length > 2 || lessonIds.some(id => !id.trim()) || new Set(lessonIds).size !== lessonIds.length) {
    throw new Error("Evaluate one lesson, or two lessons to check continuity");
  }
  const files = await readLessonMaterial(root, lessonIds);
  await mkdir(join(root, ".dojo/evaluations"), { recursive: true });
  const directory = await mkdtemp(join(root, ".dojo/evaluations/run-"));
  const report: EvaluationReport = {
    version: 1, directory, lessonIds, materialHash: materialHash(files),
    status: "running", stage: "material", startedAt: new Date().toISOString(),
  };
  if (teachingPolicy !== undefined) {
    report.teachingPolicyHash = createHash("sha256").update(teachingPolicy).digest("hex");
    await writeFile(join(directory, "production-teaching-policy.md"), teachingPolicy);
  }
  // Atomic: the UI polls report.json while the run rewrites it.
  const persist = async () => {
    await writeFile(join(directory, "report.json.tmp"), JSON.stringify(report, null, 2));
    await rename(join(directory, "report.json.tmp"), join(directory, "report.json"));
  };
  const unchanged = async () => {
    signal.throwIfAborted();
    if (materialHash(await readLessonMaterial(root, lessonIds)) !== report.materialHash) {
      report.status = "stale";
      throw new Error("Course changed during evaluation; verdicts do not apply to the current material");
    }
  };
  await writeFile(join(directory, "material.json"), JSON.stringify(files, null, 2));
  await persist();
  try {
    const materialEvidence = {
      // Keep dependency resolution in the snapshot/hash, not a teaching review.
      ...Object.fromEntries(Object.entries(files).filter(([path]) => path !== "pnpm-lock.yaml")),
      ...(teachingPolicy === undefined ? {} : { "production-teaching-policy.md": teachingPolicy }),
      "evaluation-scope.json": JSON.stringify({
        lessonIds,
        teachingLessonId: lessonIds.at(-1),
        completedBefore: lessonIds.slice(0, -1),
        scope: "Evaluate the teaching lesson and shared course guidance. Earlier lessons are completed-learning context for continuity, not material to revise in this trial. This result does not certify those earlier lessons.",
      }),
    };
    report.material = requireJudgeResults(await abortableStage(signal, () => judge(materialEvidence, signal)));
    await unchanged();
    report.decisions = { material: decidePanel(report.material) };
    // Consensus explains disagreement; it is not the acceptance gate. Do not
    // spend a teaching trial until both independent material reviews pass.
    if (!report.material.every(({ verdict }) => verdict.overall === "pass")) {
      report.status = "material-failed";
      return report;
    }
    report.stage = "trial";
    await persist();
    report.trialDirectory = await abortableStage(signal, () => trial(signal));
    await unchanged();
    const evidence = await readTeachingEvidence(report.trialDirectory, lessonIds);
    report.stage = "teaching";
    await writeFile(join(directory, "teaching-evidence.json"), JSON.stringify(evidence, null, 2));
    await persist();
    report.teaching = requireJudgeResults(await abortableStage(signal, () => judge(evidence, signal, teachingJudgePrompt)));
    await unchanged();
    report.decisions.teaching = decidePanel(report.teaching);
    report.status = report.teaching.every(({ verdict }) => verdict.overall === "pass") ? "passed" : "teaching-failed";
  } catch (error) {
    if (error instanceof TeachingFailure) report.status = "teaching-failed";
    else if (report.status !== "stale") report.status = "infrastructure-failed";
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    report.completedAt = new Date().toISOString();
    await persist();
  }
  return report;
}
