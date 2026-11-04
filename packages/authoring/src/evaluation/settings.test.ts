import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { readEvaluationSettings, writeEvaluationSettings } from "./settings";

async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "dojo-evaluation-settings-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  return root;
}
const saved = async (root: string) => JSON.parse(await readFile(join(root, ".dojo/evaluation-settings.json"), "utf8"));

it("stores only consent", async () => {
  const root = await workspace();
  expect(await readEvaluationSettings(root)).toBeNull();
  expect(await writeEvaluationSettings(root, { enabled: true, apiKey: "never persist", workerPath: "/untrusted/script" })).toEqual({ enabled: true });
  expect(await saved(root)).toEqual({ enabled: true });
  await writeEvaluationSettings(root, { enabled: false });
  expect(await readEvaluationSettings(root)).toEqual({ enabled: false });
});

it("reads a file with teacher and learner keys and drops them", async () => {
  const root = await workspace();
  await mkdir(join(root, ".dojo"));
  await writeFile(join(root, ".dojo/evaluation-settings.json"), JSON.stringify({ enabled: true,
    teacher: { harness: "opencode", model: "zai/glm" }, learner: { harness: "pi", model: "deepseek/pro" } }));
  expect(await readEvaluationSettings(root)).toEqual({ enabled: true });
});

it("rejects a non-boolean enabled", async () => {
  const root = await workspace();
  await writeEvaluationSettings(root, { enabled: true });
  for (const enabled of ["true", 1, null, undefined]) await expect(writeEvaluationSettings(root, { enabled })).rejects.toThrow();
  expect(await saved(root)).toEqual({ enabled: true });
});

it("a corrupt file is an error, not consent", async () => {
  const root = await workspace();
  await writeEvaluationSettings(root, { enabled: true });
  await writeFile(join(root, ".dojo/evaluation-settings.json"), "broken json");
  await expect(readEvaluationSettings(root)).rejects.toThrow();
  await writeFile(join(root, ".dojo/evaluation-settings.json"), JSON.stringify({ enabled: "yes" }));
  await expect(readEvaluationSettings(root)).rejects.toThrow();
});
