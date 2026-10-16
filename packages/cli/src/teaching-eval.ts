import { access, readFile, realpath } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "yaml";
import { fileURLToPath } from "node:url";
import { verifyLearnerFixtures } from "./fixture-preflight";

// Internal worker entry, not a second evaluator or a course-authored script.
// Its caller owns consent, timeout, budget, and captured stdout/stderr.
if (!["--run", "--evaluate", "--evaluate-heldout"].includes(process.argv[2]) || !process.argv[3]) {
  process.stdout.write("Usage: teaching-eval --run|--evaluate|--evaluate-heldout <course-root> (uses configured local model; consumes usage; evaluation adds two independent judges)\n");
  process.exitCode = process.argv.includes("--help") ? 0 : 1;
} else if (!process.env.DOJOFOO_HARNESS) {
  process.stderr.write("Select the teaching harness before running a live evaluation.\n");
  process.exitCode = 1;
} else {
  // The host kills the worker on cancel or timeout. Abort instead of dying so
  // the report is completed as interrupted rather than left "running".
  const stopped = new AbortController();
  process.once("SIGTERM", () => {
    stopped.abort(new Error("Evaluation was cancelled before it finished"));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
  process.env.DOJOFOO_EVALUATION_WORKER = "1";
  process.env.DOJOFOO_HANDOFF_COURSE = await realpath(process.argv[3]);
  process.env.DOJO_CLI = fileURLToPath(new URL("./index.js", import.meta.url));
  try {
    // Validate against the production lesson runtime before either judge or
    // learner fixture generation can consume model usage.
    const { dojofooHarness } = await import("../../ui/src/server/harness/registry");
    dojofooHarness();
    const { runAuthoringHandoff } = await import("../../ui/src/server/lesson/authoring-handoff");
    if (process.argv[2] !== "--run") {
      const root = process.env.DOJOFOO_HANDOFF_COURSE;
      await access(join(root, "dojo.yaml"));
      const fixtureHarness = process.env.DOJOFOO_EVAL_FIXTURE_HARNESS;
      const fixtureModel = process.env.DOJOFOO_EVAL_FIXTURE_MODEL;
      if (!fixtureHarness || !fixtureModel) throw new Error("Select DOJOFOO_EVAL_FIXTURE_HARNESS and DOJOFOO_EVAL_FIXTURE_MODEL before evaluating");
      const manifest = parse(await readFile(join(root, "dojo.yaml"), "utf8"));
      const lessonIds: string[] = process.argv[4] ? process.argv.slice(4) : manifest.katas.map((entry: { name: string }) => entry.name);
      const { evaluateAuthoredCourse } = await import("@dojofoo/authoring/evaluation/run");
      const { generateLearnerFixtures, parseLearnerFixture } = await import("@dojofoo/authoring/evaluation/learner-fixtures");
      const replayPath = process.env.DOJOFOO_EVAL_FIXTURE_PATH;
      if (replayPath) {
        if (process.argv[2] === "--evaluate-heldout") throw new Error("Held-out evaluation requires fresh learner fixtures");
        const fixtures = JSON.parse(await readFile(replayPath, "utf8"));
        for (const lessonId of lessonIds) parseLearnerFixture(JSON.stringify(fixtures[lessonId]));
      }
      const { readLessonMaterial } = await import("@dojofoo/authoring/evaluation/material");
      const { respondAsLearner } = await import("@dojofoo/authoring/evaluation/learner-response");
      const { senseiEvaluationPolicy } = await import("../../ui/src/server/lesson/instructions");
      const report = await evaluateAuthoredCourse({
        teachingPolicy: senseiEvaluationPolicy(manifest.mode ?? "katas"),
        root, lessonIds, signal: AbortSignal.any([stopped.signal, AbortSignal.timeout(2_100_000)]), trial: async signal => {
          const fixtures = replayPath ? { path: replayPath } : await generateLearnerFixtures({
            material: await readLessonMaterial(root, lessonIds), lessonIds,
            harness: fixtureHarness, model: fixtureModel, signal,
          });
          return runAuthoringHandoff(signal, lessonIds, {
            learnerProfile: process.argv[2] === "--evaluate-heldout" ? "confident" : "struggling",
            fixturesPath: fixtures.path, verifyFixtures: verifyLearnerFixtures,
            respondToReview: (dialogue, source, signal) => respondAsLearner({ dialogue, source, signal, harness: fixtureHarness, model: fixtureModel }),
          });
        },
      });
      process.stdout.write(`${JSON.stringify(report)}\n`);
      if (report.status !== "passed") process.exitCode = 1;
    } else {
      const evidenceRoot = await runAuthoringHandoff();
      process.stdout.write(`${JSON.stringify({ evidenceRoot })}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}
