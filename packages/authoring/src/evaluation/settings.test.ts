import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, onTestFinished } from "vitest";
import { configuredEvaluation, readEvaluationSettings, writeEvaluationSettings } from "./settings";

const settings = { enabled: true, teacher: { harness: "opencode", model: "zai/glm" }, learner: { harness: "pi", model: "deepseek/pro" } };
async function workspace() {
  const root = await mkdtemp(join(tmpdir(), "dojo-evaluation-settings-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  return root;
}
it("shares persisted selections across CLI, UI, and agent calls without environment edits", async () => {
  const root = await workspace();
  expect(await readEvaluationSettings(root)).toBeNull();
  expect(await configuredEvaluation(root, {})).toBeUndefined();
  await writeEvaluationSettings(root, settings);
  expect(await configuredEvaluation(root, { DOJO_CLI: "/installed/bin/index.js", DOJOFOO_EVAL_WORKER: "/untrusted/script" })).toEqual({
    workerPath: "/installed/bin/teaching-eval.js", teachingHarness: "opencode", teachingModel: "zai/glm", fixtureHarness: "pi", fixtureModel: "deepseek/pro",
  });
  await writeEvaluationSettings(root, { ...settings, enabled: false });
  expect(await configuredEvaluation(root, { DOJO_CLI: "/installed/bin/index.js" })).toBeUndefined();
});
it("rejects secrets and worker overrides without replacing valid settings", async () => {
  const root = await workspace();
  await writeEvaluationSettings(root, settings);
  for (const property of ["apiKey", "workerPath", "environment"]) {
    await expect(writeEvaluationSettings(root, { ...settings, [property]: "never persist" })).rejects.toThrow();
  }
  expect(await readEvaluationSettings(root)).toEqual(settings);
});
it("shows legacy configured selections in the UI without exposing environment or worker paths", async () => {
  const root = await workspace();
  const env = { DOJOFOO_EVAL_TEACHING_HARNESS: "opencode", DOJOFOO_EVAL_TEACHING_MODEL: "zai/glm",
    DOJOFOO_EVAL_FIXTURE_HARNESS: "pi", DOJOFOO_EVAL_FIXTURE_MODEL: "deepseek/pro", SECRET_TOKEN: "not-for-the-browser" };
  expect(await readEvaluationSettings(root, env)).toEqual(settings);
  await writeEvaluationSettings(root, { ...settings, enabled: false });
  expect(await readEvaluationSettings(root, env)).toEqual({ ...settings, enabled: false });
});
it("does not silently enable evaluations using environment defaults when saved settings are corrupt", async () => {
  const root = await workspace();
  await writeEvaluationSettings(root, settings);
  await writeFile(join(root, ".dojo/evaluation-settings.json"), "broken json");
  await expect(readEvaluationSettings(root, {})).rejects.toThrow();
  await expect(configuredEvaluation(root, {})).rejects.toThrow();
});
