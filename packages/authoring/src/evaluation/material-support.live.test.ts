import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { judgeMaterial } from "./judges";
import { checkSensei } from "./preflight";
import { materialRubricVersion } from "./prompts";

// Seed captured from MJh3Jx/run-Q8OaQl; mutations isolate missing instruction
// and leaked solutions. No teacher turns, installation or model matrix.
const captured = await readFile(new URL("./fixtures/initialization.SENSEI.md", import.meta.url), "utf8");
const improved = captured
  .replace("a variable that changes on each loop pass", "a variable carried between loop passes; it can stay unchanged")
  .replace('a "largest" has no obviously safe start — that\'s the first decision.', 'the starting state must fit the operation and its input domain.')
  .replace("The seed must be a genuine candidate from the array, or the comparison never gets a fair chance.",
    "A start can come from input, not just a constant. For `colours = ['blue', 'gold']`, `colours[0]` reads 'blue'; indexing starts at zero. Leave choosing the start to the learner. Don't prescribe their initializer or claim input-based initialization is the only valid strategy.")
  .replace("rather than leaving it to whatever the code happens to do.",
    "rather than leaving it to whatever the code happens to do. An early return handles a case before later work: a delivery-fee function can return 0 immediately when a basket is empty, so its weight calculation never runs. Let the learner choose where their no-answer case belongs.");
const unsupported = captured
  .replace(/## Teach\n[\s\S]*?(?=## Stumbling points)/u,
    "## Teach\n\nAsk the learner what a running value is and which value it should start at.\n\n")
  .replace("The seed must be a genuine candidate from the array, or the comparison never gets a fair chance.", "Ask which seed fixes it.")
  .replace("choose the answer on purpose (`undefined` here) rather than leaving it to whatever the code happens to do.", "ask which statement they need.");

const cases = [
  { name: "counterexamples without instruction leave new decisions untaught", sensei: unsupported, expected: { "adaptive-instruction": false } },
  { name: "concise concept support without a dialogue script", sensei: improved, expected: { "adaptive-instruction": true, "solution-withholding": true } },
  { name: "complete algorithm disguised as a different example", sensei: `${improved}\n\nFor a stuck learner demonstrate finding the longest word: return undefined for no words; start best at words[0]; loop over all words and replace best when a word is longer; return best. Ask them to adapt this to numbers.`, expected: { "solution-withholding": false } },
] as const;

it.runIf(process.env.DOJOFOO_EVAL_MATERIAL_CALIBRATION === "1").each(cases)(
  "both judges: $name",
  async ({ name, sensei, expected }) => {
    if (name === "concise concept support without a dialogue script") expect(checkSensei(sensei)).toEqual([]);
    const policy = await Promise.all(["DOJOFOO", "KATAS", "TURNS"].map(file => readFile(
      new URL(`../../../ui/src/server/lesson/contracts/${file}.md`, import.meta.url), "utf8")));
    const evidence = {
      "DOJO.md": "Learner knows variables, functions, arrays, loops and basic TypeScript. New: union return types, running state and explicitly handling empty input. Use plain loops; no Math.max or sort. Teach concepts, not one required implementation.",
      "src/001-max/SENSEI.md": sensei,
      "src/001-max/kata.ts": "export function max(numbers: number[]): number | undefined { return undefined; }",
      "src/001-max/kata.test.ts": "// Tests: [5] => 5; [3,7] => 7; [10,2,9,4] => 10; [1,3,8] => 8; [-5,-2,-9] => -2; [] => undefined.",
      "production-teaching-policy.md": policy.join("\n\n"),
    };
    const directory = await mkdtemp(join(tmpdir(), "dojo-material-calibration-"));
    await writeFile(join(directory, "input.json"), JSON.stringify({ name, rubric: materialRubricVersion, expected, evidence }, null, 2));
    const results = await judgeMaterial(evidence, AbortSignal.timeout(210_000));
    await writeFile(join(directory, "result.json"), JSON.stringify(results, null, 2));
    console.info(`${name}: ${directory}`);
    for (const result of results) {
      for (const [id, pass] of Object.entries(expected)) {
        const criterion = result.verdict.criteria.find(criterion => criterion.id === id);
        expect(criterion?.pass, `${result.judge}/${id}: ${criterion?.evidence}; ${directory}`).toBe(pass);
      }
      if (name === "concise concept support without a dialogue script") {
        expect(result.verdict.overall, `${result.judge}: ${JSON.stringify(result.verdict)}; ${directory}`).toBe("pass");
      }
    }
  },
  240_000,
);
