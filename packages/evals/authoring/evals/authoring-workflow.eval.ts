import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { defineEval } from "@dojofoo/agent/evals";
import { satisfies } from "@dojofoo/agent/evals/expect";
import { readMaterial } from "@dojofoo/authoring/evaluation/material";
import { evaluationConfiguration, executeEvaluationWorker } from "@dojofoo/authoring/evaluation/host";
import type { EvaluationReport } from "@dojofoo/authoring/evaluation/run";
import instructions from "@dojofoo/authoring/eve/instructions";
import { chainPrompts } from "./authoring-chain.eval";

/** Acceptance invokes the shipped agent/tool, never an extra coaching turn or
 * a developer-run evaluator after the author has already declared success.
 */
export default defineEval({
  description: "Production Kyoshi authors, evaluates and revises its own lessons from learning goals",
  tags: ["kyoshi", "workflow", "pedagogy"],
  timeoutMs: 5_400_000,
  async test(t) {
    if (process.env.DOJOFOO_EVAL_WORKFLOW !== "1") return t.skip("Requires explicit --live --workflow");
    const root = process.env.DOJOFOO_EVAL_WORKSPACE;
    if (!root) throw new Error("Isolated authoring workspace is required");
    await writeFile(join(root, ".dojo/evaluated-instructions.md"), String(instructions.content));
    const evidence: unknown[] = [];
    let accepted: EvaluationReport | undefined;
    // --quick: one lesson through Kyoshi's own evaluation loop, no held-out run.
    const quick = process.env.DOJOFOO_EVAL_QUICK === "1";
    try {
      for (const [index, prompt] of (quick ? chainPrompts.slice(0, 1) : chainPrompts).entries()) {
        const turn = await t.send(prompt);
        const events = turn.events.filter(event => ["message.completed", "actions.requested", "action.result", "turn.completed", "turn.failed", "error"].includes(event.type));
        const material = await readMaterial(root);
        evidence.push({ prompt, events, material });
        await writeFile(join(root, ".dojo/workflow-evidence.json"), JSON.stringify(evidence, null, 2));
        turn.expectOk();
        await t.require(Object.keys(material).filter(path => /\/SENSEI\.md$/u.test(path)).length === index + 1,
          satisfies((valid: boolean) => valid, "Author one lesson at a time"));
        await t.require(JSON.stringify(events.filter(event => event.type === "actions.requested")).includes('"dojo_authoring_evaluate"'),
          satisfies((valid: boolean) => valid, "Kyoshi must invoke its shipped evaluation tool"));
        const directory = join(root, ".dojo/evaluations");
        const reports: EvaluationReport[] = [];
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name.startsWith("run-")) reports.push(JSON.parse(await readFile(join(directory, entry.name, "report.json"), "utf8")));
        }
        const latest = reports.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
        evidence.push({ afterLesson: index + 1, reports });
        await t.require(latest?.status === "passed" && latest.lessonIds.length === index + 1,
          satisfies((valid: boolean) => valid, "Both judge panels and production teaching must pass; second lesson must check continuity"));
        const evaluatedMaterial = JSON.parse(await readFile(join(latest.directory, "material.json"), "utf8"));
        await t.require(isDeepStrictEqual(evaluatedMaterial, material),
          satisfies((valid: boolean) => valid, "The delivered files must be exactly the evaluated material"));
        accepted = latest;
      }
      if (quick) { t.succeeded(); return; }
      // No more author turns after this point. Held-out failures are retained
      // for human review, not fed back into this attempt's revision loop.
      const config = evaluationConfiguration();
      if (!config || !accepted) throw new Error("Held-out acceptance requires the configured evaluation worker and accepted lessons");
      const heldout = await executeEvaluationWorker(root, accepted.lessonIds, config, AbortSignal.timeout(2_160_000), "confident");
      evidence.push({ heldout });
      await t.require(heldout.status === "passed" && heldout.materialHash === accepted.materialHash && Boolean(accepted.teachingPolicyHash) && heldout.teachingPolicyHash === accepted.teachingPolicyHash && isDeepStrictEqual(heldout.lessonIds, accepted.lessonIds),
        satisfies((valid: boolean) => valid, "The frozen lessons must also pass held-out teaching without author revision"));
      t.succeeded();
    } finally {
      await writeFile(join(root, ".dojo/workflow-evidence.json"), JSON.stringify(evidence, null, 2));
    }
  },
});
