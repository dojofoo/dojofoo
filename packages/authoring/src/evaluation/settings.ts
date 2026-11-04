import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

/** Consent only (D10): every role runs on the draft's coding agent and model. Keys of the old per-role pickers are dropped on read. */
export const evaluationSettingsSchema = z.object({ enabled: z.boolean() });
export type EvaluationSettings = z.infer<typeof evaluationSettingsSchema>;

export async function readEvaluationSettings(root: string): Promise<EvaluationSettings | null> {
  try {
    return evaluationSettingsSchema.parse(JSON.parse(await readFile(join(root, ".dojo/evaluation-settings.json"), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Consent only: no credentials, executable paths, or conversation state. */
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
