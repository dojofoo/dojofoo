import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { z } from "zod";
import { criterionIds, judgeMaterial } from "./judges";
import { teachingJudgePrompt, teachingRubricVersion } from "./teaching-rubric";

const momentSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["user-report", "proposed-reference", "authored-counterexample"]),
  context: z.string().min(1),
  transcript: z.array(z.object({
    role: z.enum(["sensei", "learner"]),
    text: z.string().min(1),
  }).strict()).min(1),
  expected: z.partialRecord(z.enum(criterionIds), z.boolean())
    .refine(value => Object.keys(value).length > 0, "At least one scoped expectation is required"),
  note: z.string().min(1),
}).strict();

const moments = z.array(momentSchema).min(1).parse(JSON.parse(await readFile(
  new URL("./fixtures/teaching-moments.json", import.meta.url), "utf8",
)));
const live = process.env.DOJOFOO_EVAL_TEACHING_CALIBRATION === "1";
const requested = process.env.DOJOFOO_EVAL_CASES?.split(",").map(id => id.trim()).filter(Boolean);
if (live && requested?.some(id => !moments.some(moment => moment.id === id))) {
  throw new Error("Unknown teaching calibration case; use IDs from fixtures/teaching-moments.json");
}

it("has unique, provenance-labelled teaching cases with positive and negative expectations", () => {
  expect(new Set(moments.map(moment => moment.id)).size).toBe(moments.length);
  for (const criterion of ["engagement", "adaptive-instruction", "solution-withholding"] as const) {
    expect(moments.some(moment => moment.expected[criterion] === true), criterion).toBe(true);
    expect(moments.some(moment => moment.expected[criterion] === false), criterion).toBe(true);
  }
});

// No author, learner model, installation, or live Sensei. These calls measure
// the existing judges, not teaching quality or a complete lesson's acceptance.
it.runIf(live).each(moments.filter(moment => !requested || requested.includes(moment.id)))(
  "calibrates teaching judgment: $id",
  async ({ id, source, context, transcript, expected, note }) => {
    const evidence = {
      scope: "A teaching excerpt only. Judge observed behavior in its supplied context. Missing introduction, review, or completion stages cannot establish a complete lesson pass.",
      context,
      transcript: transcript.map(turn => `${turn.role}: ${turn.text}`).join("\n\n"),
    };
    const directory = await mkdtemp(join(tmpdir(), "dojo-teaching-calibration-"));
    // Expected labels and provenance never enter the judge prompt.
    await writeFile(join(directory, "input.json"), JSON.stringify({
      id, source, expected, note, rubric: teachingRubricVersion, evidence,
    }, null, 2));
    console.info(`Teaching calibration ${id}: ${directory}`);
    const results = await judgeMaterial(evidence, AbortSignal.timeout(210_000), teachingJudgePrompt);
    await writeFile(join(directory, "result.json"), JSON.stringify(results, null, 2));
    for (const result of results) {
      for (const [criterionId, pass] of Object.entries(expected)) {
        const criterion = result.verdict.criteria.find(value => value.id === criterionId);
        expect(criterion?.pass, `${result.judge}/${criterionId}: ${criterion?.evidence}; ${directory}`).toBe(pass);
      }
      expect(result.verdict.overall, "An excerpt cannot certify a complete lesson").not.toBe("pass");
    }
  },
  240_000,
);
