import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { evaluationConfiguration, type EvaluationConfiguration } from "./host.ts";

const model = z.object({
  harness: z.enum(["codex", "opencode", "pi", "cursor", "grok", "fx"]),
  model: z.string().trim().min(1).max(200),
}).strict();
export const evaluationSettingsSchema = z.object({
  enabled: z.boolean(),
  teacher: model,
  learner: model,
}).strict();
export type EvaluationSettings = z.infer<typeof evaluationSettingsSchema>;

export async function readEvaluationSettings(root: string, env: NodeJS.ProcessEnv = process.env): Promise<EvaluationSettings | null> {
  try {
    return evaluationSettingsSchema.parse(JSON.parse(await readFile(join(root, ".dojo/evaluation-settings.json"), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const values = [env.DOJOFOO_EVAL_TEACHING_HARNESS, env.DOJOFOO_EVAL_TEACHING_MODEL, env.DOJOFOO_EVAL_FIXTURE_HARNESS, env.DOJOFOO_EVAL_FIXTURE_MODEL];
      if (values.every(value => !value)) return null;
      return evaluationSettingsSchema.parse({ enabled: true,
        teacher: { harness: values[0], model: values[1] },
        learner: { harness: values[2], model: values[3] },
      });
    }
    throw error;
  }
}

/** Preferences only: no credentials, executable paths, or conversation state. */
export async function writeEvaluationSettings(root: string, input: unknown): Promise<EvaluationSettings> {
  const settings = evaluationSettingsSchema.parse(input);
  const directory = join(root, ".dojo");
  await mkdir(directory, { recursive: true });
  const path = join(directory, "evaluation-settings.json");
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
  return settings;
}

export async function configuredEvaluation(root: string, env: NodeJS.ProcessEnv = process.env): Promise<EvaluationConfiguration | undefined> {
  const settings = await readEvaluationSettings(root, env);
  if (!settings) return evaluationConfiguration(env);
  if (!settings.enabled) return undefined;
  return evaluationConfiguration({
    DOJO_CLI: env.DOJO_CLI,
    DOJOFOO_EVAL_TEACHING_HARNESS: settings.teacher.harness,
    DOJOFOO_EVAL_TEACHING_MODEL: settings.teacher.model,
    DOJOFOO_EVAL_FIXTURE_HARNESS: settings.learner.harness,
    DOJOFOO_EVAL_FIXTURE_MODEL: settings.learner.model,
  });
}
