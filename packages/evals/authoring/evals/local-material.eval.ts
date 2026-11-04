import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { defineEval, type EveEvalContext } from "@dojofoo/harness/evals";
import { satisfies } from "@dojofoo/harness/evals/expect";
import { decidePanel } from "@dojofoo/agents/evaluation/panel";
import { judgeMaterial } from "./local-judges";
import { readMaterial } from "./material";
import { brief } from "@dojofoo/agents/evaluation/prompts/suites";

export const authorBrief = brief("reverse-string");

export default defineEval({
  description: "Author one novice kata through production Kyoshi; independently judge with Codex and Claude",
  tags: ["kyoshi", "local-judges", "pedagogy"],
  timeoutMs: 600_000,
  async test(t: EveEvalContext) {
    if (process.env.DOJOFOO_EVAL_LOCAL_JUDGES !== "1") return t.skip("Local judge usage requires --local-judges --live");
    const root = process.env.DOJOFOO_EVAL_WORKSPACE;
    if (!root) throw new Error("Isolated workspace is required");
    const instructions = await readFile(new URL(import.meta.resolve("@dojofoo/agents/KYOSHI.md")), "utf8");
    await writeFile(join(root, ".dojo", "evaluated-KYOSHI.md"), instructions);
    const authored = await t.send(authorBrief);
    t.succeeded();
    authored.expectOk();
    // A parked error or unanswered question has no completed turn.
    await t.require(authored.events.some((event) => event.type === "turn.settled" && event.data.outcome === "completed"), satisfies((completed: boolean) => completed, "authoring must finish before paid grading"));
    const material = await readMaterial(root);
    await writeFile(join(root, ".dojo", "authored-material.json"), JSON.stringify(material, null, 2));
    const results = await judgeMaterial(material, t.abortSignal);
    await writeFile(join(root, ".dojo", "judge-results.json"), JSON.stringify({ authorBrief, results }, null, 2));
    const decision = decidePanel(results);
    await writeFile(join(root, ".dojo", "panel-decision.json"), JSON.stringify(decision, null, 2));
    if (results.length) t.check(decision.outcome, satisfies((outcome: string) => outcome === "pass", `panel: ${JSON.stringify(decision.blocking)}`));
  },
});
