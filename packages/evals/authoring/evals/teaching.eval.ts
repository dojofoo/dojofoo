import { defineEval, type EveEvalContext } from "@dojofoo/agent/evals";
import { satisfies } from "@dojofoo/agent/evals/expect";
import { validateManifest } from "@dojofoo/config";
import { parse } from "yaml";
import { readMaterial } from "./material";
import { autoevalQuestion, brief as authorBrief } from "@dojofoo/authoring/evaluation/prompts/suites";

const brief = authorBrief("collapse-whitespace");

export default defineEval({
  description: "Author a novice kata, then revise it using evidence of a learner's misconception",
  tags: ["kyoshi", "katas", "pedagogy"],
  async test(t: EveEvalContext) {
    const root = process.env.DOJOFOO_EVAL_WORKSPACE;
    if (!root) throw new Error("Use pnpm eval:authoring --live to create an isolated workspace.");
    const first = (await t.send(brief)).expectOk();
    t.succeeded();
    const before = await readMaterial(root);
    const manifest = parse(before["dojo.yaml"] ?? before["dojo.json"] ?? "");
    t.check(validateManifest(manifest),
      satisfies((errors: string[]) => errors.length === 0, "valid course manifest"));
    t.check(manifest?.katas, satisfies((lessons: unknown) => Array.isArray(lessons) && lessons.length === 1, "exactly one focused lesson"));
    t.check(Object.keys(before), satisfies((paths: string[]) => paths.some((path) => /\/SENSEI\.md$/u.test(path)), "authored Sensei material"));
    t.judge(
      autoevalQuestion("novice-teaching-not-solution-recipe"),
      { on: { brief, files: before, dialogue: first.events.map(event => JSON.stringify(event)) } },
    ).label("novice-teaching-not-solution-recipe").gate(0.8);
    t.judge(
      autoevalQuestion("engaging-and-concrete"),
      { on: { brief, files: before } },
    ).label("engaging-and-concrete").gate(0.8);
    const feedback = (await first.session.send(authorBrief("collapse-whitespace-feedback"))).expectOk();
    t.succeeded();
    const after = await readMaterial(root);
    t.check(after, satisfies((files: Record<string, string>) => JSON.stringify(files) !== JSON.stringify(before), "feedback changes the authored files"));
    t.judge(
      autoevalQuestion("feedback-produces-adaptive-teaching"),
      { on: { brief, before, after, dialogue: [...first.events, ...feedback.events].map(event => JSON.stringify(event)) } },
    ).label("feedback-produces-adaptive-teaching").gate(0.8);
  },
});
