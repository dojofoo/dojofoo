import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineEval, type EveEvalContext } from "@dojofoo/agent/evals";
import { satisfies } from "@dojofoo/agent/evals/expect";
import { decidePanel } from "@dojofoo/authoring/evaluation/panel";
import instructions from "@dojofoo/authoring/eve/instructions";
import { judgeMaterial, requireJudgeResults } from "./local-judges";
import { brief, chainJudgePrompt, chainRubricVersion } from "@dojofoo/authoring/evaluation/prompts/suites";
import { readMaterial } from "./material";
import { verifyCourse } from "./verify-course";

export const chainPrompts = [brief("chain-1"), brief("chain-2")];
export { chainJudgePrompt };

export default defineEval({
  description: "Chained authoring from learning goals, without extra human teaching instructions",
  tags: ["kyoshi", "local-judges", "pedagogy", "chained"],
  timeoutMs: 1_200_000,
  async test(t: EveEvalContext) {
    if (process.env.DOJOFOO_EVAL_LOCAL_JUDGES !== "1") return t.skip("Requires --live --local-judges --chained");
    const workspace = process.env.DOJOFOO_EVAL_WORKSPACE;
    if (!workspace) throw new Error("Isolated workspace is required");
    const root = workspace;
    const evidence: Record<string, string> = { configuration: JSON.stringify({
      harness: process.env.DOJOFOO_HARNESS,
      model: process.env.DOJOFOO_EVAL_MODEL,
      rubric: chainRubricVersion,
      revisionPasses: process.env.DOJOFOO_EVAL_REVISE === "1" ? 1 : 0,
    }) };
    await writeFile(join(root, ".dojo/evaluated-KYOSHI.md"), await readFile(new URL(import.meta.resolve("@dojofoo/authoring/KYOSHI.md")), "utf8"));
    if (typeof instructions.content !== "string") throw new Error("Capture resolved authoring instructions before evaluating dynamic guidance");
    await writeFile(join(root, ".dojo/evaluated-instructions.md"), instructions.content);
    let turnNumber = 0;
    async function author(prompt: string, expectedLessons: number) {
      const index = turnNumber++;
      evidence[`turn-${index + 1}/prompt`] = prompt;
      let turn;
      try {
        turn = await t.send(prompt);
      } catch (error) {
        evidence[`turn-${index + 1}/infrastructureFailure`] = error instanceof Error ? error.message : String(error);
        evidence[`turn-${index + 1}/files`] = JSON.stringify(await readMaterial(root));
        await writeFile(join(root, ".dojo/chain-evidence.json"), JSON.stringify(evidence, null, 2));
        throw error;
      }
      // Preserve completed dialogue/tool evidence, not token deltas or private reasoning.
      evidence[`turn-${index + 1}/events`] = JSON.stringify(turn.events.filter(event =>
        ["message.completed", "actions.requested", "action.result", "input.requested", "turn.completed", "turn.failed", "error"].includes(event.type)));
      const files = await readMaterial(root);
      evidence[`turn-${index + 1}/files`] = JSON.stringify(files);
      await writeFile(join(root, ".dojo/chain-evidence.json"), JSON.stringify(evidence, null, 2));
      turn.expectOk();
      t.succeeded();
      await t.require(turn.events.some(event => event.type === "turn.completed"), satisfies((done: boolean) => done, "turn must complete before continuing"));
      const count = Object.keys(files).filter(path => /\/SENSEI\.md$/u.test(path)).length;
      await t.require(count === expectedLessons, satisfies((valid: boolean) => valid, `author exactly ${expectedLessons} lessons before continuing or paying judges (found ${count})`));
    }
    for (const [index, prompt] of chainPrompts.entries()) await author(prompt, index + 1);
    async function review(round: number) {
      const checks = await verifyCourse(root, t.signal);
      evidence[`review-${round}/productionChecks`] = JSON.stringify(checks);
      evidence["handoff/files"] = JSON.stringify(await readMaterial(root));
      await writeFile(join(root, ".dojo/chain-evidence.json"), JSON.stringify(evidence, null, 2));
      await t.require(checks.every(({ report }) => !report.error && report.total > 0 && report.failed > 0), satisfies((valid: boolean) => valid, "Production checks must run and fail against unsolved scaffolds"));
      await t.require(checks.every(({ learnerFileObserved }) => learnerFileObserved), satisfies((valid: boolean) => valid, "Tests must load the learner's editable file, not the bundled stub"));
      const results = requireJudgeResults(await judgeMaterial(evidence, t.signal, chainJudgePrompt));
      await writeFile(join(root, `.dojo/chain-judge-round-${round}.json`), JSON.stringify(results, null, 2));
      await writeFile(join(root, ".dojo/chain-judge-results.json"), JSON.stringify(results, null, 2));
      return results;
    }
    let results = await review(0);
    if (process.env.DOJOFOO_EVAL_REVISE === "1" && decidePanel(results).outcome !== "pass") {
      const feedback = results.map(result => ({ judge: result.judge,
        findings: result.verdict.criteria.filter(criterion => !criterion.pass),
      }));
      const lessons = Object.keys(await readMaterial(root))
        .filter(path => /\/SENSEI\.md$/u.test(path)).map(path => path.slice(0, path.lastIndexOf("/") + 1)).sort();
      for (const lesson of lessons) {
        const before = await readMaterial(root);
        await author(brief("chain-revise", { lesson, feedback: JSON.stringify(feedback) }), 2);
        const after = await readMaterial(root);
        const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
        const otherLessonsUnchanged = [...paths].every(path => !path.startsWith("src/") || path.startsWith(lesson) || before[path] === after[path]);
        await t.require(otherLessonsUnchanged, satisfies((valid: boolean) => valid, "Revise one lesson at a time, without editing other lessons"));
      }
      results = await review(1);
    }
    const decision = decidePanel(results);
    await writeFile(join(root, ".dojo/chain-panel-decision.json"), JSON.stringify(decision, null, 2));
    t.check(decision.outcome, satisfies((outcome: string) => outcome === "pass", `panel: ${JSON.stringify(decision.blocking)}`));
  },
});
