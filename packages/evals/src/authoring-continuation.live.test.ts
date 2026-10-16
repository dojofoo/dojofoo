import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { expect, it } from "vitest";
import { parse } from "yaml";
import { HarnessAgent } from "@dojofoo/agent/harness";
import { createLocalHarnessSandbox } from "@dojofoo/agent/experimental/local";
import { readLessonMaterial, readMaterial } from "@dojofoo/authoring/evaluation/material";
import { kyoshiInstructions } from "../../authoring/src/eve/instructions";
import { authoringHarness } from "../../authoring/src/eve/harness";
import { prepareKyoshiCommand, prepareKyoshiHarness } from "../../authoring/src/eve/prepare";
import { preservesAcceptedMaterial, restoreMaterial } from "./accepted-material";

// Replay a real accepted snapshot, without repeating its paid Sensei trial.
// This checks filesystem behavior, not the quality of the new lesson.
const handoffOnly = process.env.DOJOFOO_EVAL_HANDOFF === "1";
it.runIf(process.env.DOJOFOO_EVAL_CONTINUATION === "1" || handoffOnly)(handoffOnly
  ? "post-pass handover preserves every evaluated file"
  : "adding a lesson preserves accepted course guidance", async () => {
  const source = process.env.DOJOFOO_ACCEPTED_MATERIAL;
  const model = process.env.DOJOFOO_EVAL_MODEL;
  const cli = process.env.DOJO_CLI;
  if (!source || !model || !cli) throw new Error("Select an accepted material.json snapshot, authoring model and bundled CLI");
  const previous: Record<string, string> = JSON.parse(await readFile(source, "utf8"));
  const recorded: Array<{ prompt?: string; material?: Record<string, string>; events?: Array<{
    type: string; data?: { finishReason?: string; message?: string };
  }> }> = JSON.parse(await readFile(resolve(dirname(source), "../../workflow-evidence.json"), "utf8"));
  const prior = [...recorded].reverse().find(turn => turn.prompt && turn.material?.["dojo.yaml"] === previous["dojo.yaml"]);
  const handover = prior?.events?.filter(event => event.type === "message.completed" && event.data?.finishReason === "stop").at(-1)?.data?.message;
  if (!handover) throw new Error("The snapshot needs its recorded authoring handover for a faithful continuation replay");
  const manifest = parse(previous["dojo.yaml"]!);
  const lessonIds: string[] = manifest.katas.map((entry: { name: string }) => entry.name);
  const root = await mkdtemp(join(tmpdir(), "dojo-continuation-eval-"));
  await restoreMaterial(root, previous);
  const harnessRoot = await prepareKyoshiHarness(root);
  const commands = await prepareKyoshiCommand(harnessRoot, cli);
  const instructions = kyoshiInstructions();
  const prompt = handoffOnly
    ? `Finish this authoring turn in the copied course.\n\nAuthor request:\n${prior!.prompt}\n\nThe production evaluation just returned this report for the current files:\n${await readFile(join(dirname(source), "report.json"), "utf8")}\n\nPrepare your handover to the author. This is a handover-only rehearsal; do not run another paid evaluation.`
    : `Continue this authoring conversation in the copied course.\n\nPrevious author request:\n${prior!.prompt}\n\nPrevious Kyoshi handover:\n${handover}\n\nCurrent author request:\nNow create the next lesson on filtering positive numbers, including zero and negative values. Same learner. Create this lesson and its checks now.\n\nThis is a draft-only rehearsal: don't run a paid teaching trial. Finish after writing and checking the new lesson.`;
  await writeFile(join(root, ".dojo/replay-input.json"), JSON.stringify({ source, model, harness: process.env.DOJOFOO_HARNESS, instructions, prompt }, null, 2));
  const agent = new HarnessAgent({
    harness: authoringHarness(), model, instructions, sandboxConfig: { workDir: "course" },
    sandbox: createLocalHarnessSandbox(harnessRoot, { environment: { ...process.env, PATH: `${commands}${delimiter}${process.env.PATH}` } }),
  });
  const abortSignal = AbortSignal.timeout(360_000);
  const session = await agent.createSession({ abortSignal });
  try {
    const result = await agent.generate({ session, abortSignal, prompt });
    await writeFile(join(root, ".dojo/replay-response.txt"), result.text);
    await writeFile(join(root, ".dojo/replay-steps.json"), JSON.stringify(result.steps.map(
      ({ text, toolCalls, toolResults }) => ({ text, toolCalls, toolResults }),
    ), null, 2));
  } finally {
    await session.destroy();
  }
  const current = await readMaterial(root);
  await writeFile(join(root, ".dojo/replay-material.json"), JSON.stringify(current, null, 2));
  const accepted = await readLessonMaterial(root, lessonIds);
  console.info(`Continuation replay: ${root}`);
  if (handoffOnly) {
    expect(current, `Post-pass edits invalidate the report; ${root}`).toEqual(previous);
    return;
  }
  expect(preservesAcceptedMaterial(previous, accepted, lessonIds), `Accepted files changed; ${root}`).toBe(true);
  const next = parse(current["dojo.yaml"]!).katas;
  expect(next).toHaveLength(lessonIds.length + 1);
  const added = next.filter((entry: { name: string }) => !lessonIds.includes(entry.name));
  expect(added).toHaveLength(1);
  expect(Object.keys(current)).toContain(`${dirname(added[0].template)}/SENSEI.md`);
}, 390_000);
