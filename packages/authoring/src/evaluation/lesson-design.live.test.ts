import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalHarnessSandbox } from "@dojofoo/agent/experimental/local";
import { authoringHarness } from "../eve/harness";
import { kyoshiInstructions } from "../eve/instructions";
import { judgeMaterial } from "./judges";
import { checkSensei } from "./preflight";
import { materialRubricVersion } from "./prompts";

// Small draft/review/revise tests, not an Eve/tool or teaching acceptance test.
// Three judge pairs, plus bounded free preflight repairs, as in production.
// Never retry infrastructure errors.
// Failed drafts are retained. Passing here is not a one-shot quality claim.
type DesignCase = {
  name: string; dojo: string; goal: string; scaffold: string; checks: string;
  revision?: { material: Record<string, string>; senseiPath: string; feedback: unknown };
};
const cases: DesignCase[] = [
  {
    name: "running-state decisions",
    dojo: "Learner knows variables, functions, arrays, loops and basic TypeScript. New: union return types, running state and explicitly handling empty input. Use plain loops; no Math.max or sort.",
    goal: "Find the largest number in an array, returning undefined when empty.",
    scaffold: "export function max(numbers: number[]): number | undefined { return undefined; }",
    checks: "[5] => 5; [3,7] => 7; [10,2,9,4] => 10; [1,3,8] => 8; [-5,-2,-9] => -2; [] => undefined.",
  },
  {
    name: "unfamiliar whitespace syntax",
    dojo: "Learner can write functions and call string methods. They have never learned regular expressions. This is the first lesson. The input is already trimmed and lowercase.",
    goal: "Collapse each nonempty run of internal whitespace, including spaces, tabs and newlines, into one hyphen.",
    scaffold: "export function separateWords(text: string): string { return text; }",
    checks: "'red blue' => 'red-blue'; 'red   blue' => 'red-blue'; 'red\\tblue\\ngreen' => 'red-blue-green'; 'red' => 'red'; '' => ''.",
  },
];

// Replay a captured material failure without installation or a live teacher.
// Keep its authored context and actual feedback, rather than rewriting a nicer fixture.
if (process.env.DOJOFOO_EVAL_MATERIAL_REPORT) {
  const reportDirectory = process.env.DOJOFOO_EVAL_MATERIAL_REPORT;
  const material: Record<string, string> = JSON.parse(await readFile(join(reportDirectory, "material.json"), "utf8"));
  delete material["pnpm-lock.yaml"];
  const report = JSON.parse(await readFile(join(reportDirectory, "report.json"), "utf8"));
  const senseiPaths = Object.keys(material).filter(path => path.endsWith("/SENSEI.md"));
  const senseiPath = senseiPaths[0];
  if (senseiPaths.length !== 1 || !senseiPath || !report.material?.length) {
    throw new Error("Captured revision needs single-lesson material and judge findings");
  }
  cases.push({ name: "captured material revision", dojo: material["DOJO.md"] ?? "", goal: "Keep the captured lesson's goal and learner.",
    scaffold: "", checks: "", revision: { material, senseiPath,
      feedback: report.material.map(({ judge, verdict }: { judge: string; verdict: { criteria: Array<{ pass: boolean }> } }) => ({
        judge, findings: verdict.criteria.filter(criterion => !criterion.pass),
      })),
    },
  });
}

it.runIf(process.env.DOJOFOO_EVAL_DESIGN === "1").each(cases)(
  "Kyoshi material reaches both-judge acceptance: $name",
  async ({ name, dojo, goal, scaffold, checks, revision }) => {
    const directory = await mkdtemp(join(tmpdir(), "dojo-design-eval-"));
    const instructions = kyoshiInstructions();
    let prompt = `Material-only drafting rehearsal; the files below are already prepared. Return only the complete SENSEI.md text. Do not use tools or run a trial in this rehearsal.\nGoal: ${goal}\nDOJO.md:\n${dojo}\nkata.ts:\n${scaffold}\nChecks:\n${checks}`;
    if (revision) prompt = `Material-only revision rehearsal. Keep the captured goal, learner and other files. Revise SENSEI.md from the actual material-review findings. Return only the complete SENSEI.md, without tools or a live trial.\nFiles: ${JSON.stringify(revision.material)}\nFindings: ${JSON.stringify(revision.feedback)}`;
    const harness = process.env.DOJOFOO_HARNESS;
    const model = process.env.DOJOFOO_EVAL_MODEL;
    if (!harness || !model) throw new Error("Select the authoring harness and model explicitly");
    await writeFile(join(directory, "input.json"), JSON.stringify({ name, harness, model, rubric: materialRubricVersion, instructions, prompt }, null, 2));
    const agent = new HarnessAgent({
      harness: await authoringHarness(), model, instructions, activeTools: [],
      sandbox: createLocalHarnessSandbox(directory),
      stopWhen: ({ steps }) => steps.length >= 1,
    });
    const signal = AbortSignal.timeout(1_770_000);
    const session = await agent.createSession({ abortSignal: signal });
    const policy = await Promise.all(["DOJOFOO", "KATAS", "TURNS"].map(file => readFile(
      new URL(`../../../ui/src/server/lesson/contracts/${file}.md`, import.meta.url), "utf8")));
    let results: Awaited<ReturnType<typeof judgeMaterial>> = [];
    let reviews = 0;
    try {
      for (let attempt = 1; attempt <= 6 && reviews < 3; attempt++) {
        await writeFile(join(directory, `${attempt}-prompt.txt`), prompt);
        const result = await agent.generate({ session, abortSignal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]), prompt });
        const sensei = result.text.replace(/^```(?:md|markdown)?\s*\n/u, "").replace(/\n```\s*$/u, "").trim();
        await writeFile(join(directory, `${attempt}-SENSEI.md`), sensei);
        const findings = checkSensei(sensei);
        await writeFile(join(directory, `${attempt}-preflight.json`), JSON.stringify(findings));
        if (findings.length) {
          expect(attempt, `${directory}: ${findings.join("; ")}`).toBeLessThan(6);
          prompt = `Preflight: ${findings.join("\n")}\nRevise the same SENSEI.md. Retain the explanations that address the material review. Return only the complete revised file; no tools.`;
          continue;
        }
        const evidence = {
          ...(revision?.material ?? {
          "DOJO.md": dojo,
          "src/001-lesson/kata.ts": scaffold,
          "src/001-lesson/checks.txt": checks,
          }),
          [revision?.senseiPath ?? "src/001-lesson/SENSEI.md"]: sensei,
          "production-teaching-policy.md": policy.join("\n\n"),
        };
        await writeFile(join(directory, `${attempt}-evidence.json`), JSON.stringify(evidence, null, 2));
        results = await judgeMaterial(evidence, AbortSignal.any([signal, AbortSignal.timeout(210_000)]));
        reviews++;
        await writeFile(join(directory, `${attempt}-result.json`), JSON.stringify(results, null, 2));
        console.info(`${name}, attempt ${attempt}: ${results.map(r => `${r.judge}=${r.verdict.overall}`).join(", ")}; ${directory}`);
        if (results.every(r => r.verdict.overall === "pass")) break;
        const feedback = results.map(({ judge, verdict }) => ({ judge,
          findings: verdict.criteria.filter(criterion => !criterion.pass),
          limitation: verdict.limitation,
        }));
        prompt = `Material review: ${JSON.stringify(feedback)}\nRevise the same SENSEI.md using these findings. Keep the goal and learner unchanged. Return only the complete revised file; no tools.`;
      }
    } finally {
      await session.destroy();
    }
    expect(results).toHaveLength(2);
    for (const result of results) {
      expect(result.verdict.overall, `${result.judge}: ${JSON.stringify(result.verdict)}; ${directory}`).toBe("pass");
    }
  },
  1_800_000,
);
