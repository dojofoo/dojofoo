import { execFile } from "node:child_process";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import type { AuthoringHarness } from "./harness.ts";

const execute = promisify(execFile);

/** Supply native adapter prerequisites without rewriting adapter shell commands. */
export async function authoringEnvironment(
  harness: AuthoringHarness,
  environment: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): Promise<NodeJS.ProcessEnv> {
  const result = { ...environment };
  if (harness !== "fx" || platform !== "darwin") return result;

  const isGNU = async (command: string) => {
    try {
      const { stdout } = await execute(command, ["--version"], { env: result, timeout: 5000 });
      return stdout.startsWith("chmod (GNU coreutils)");
    } catch { return false; }
  };
  if (await isGNU("chmod")) return result;
  for (const directory of [
    "/opt/homebrew/opt/coreutils/libexec/gnubin",
    "/usr/local/opt/coreutils/libexec/gnubin",
  ]) {
    if (await isGNU(join(directory, "chmod"))) {
      result.PATH = [directory, result.PATH].filter(Boolean).join(delimiter);
      return result;
    }
  }
  throw new Error(
    "FX's official adapter requires GNU chmod on macOS. Install coreutils (brew install coreutils), " +
    "or put GNU coreutils on PATH, then retry. No credentials or adapter files were changed.",
  );
}
