import { execFile } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
export const starterCourseIds = ["create-your-own-dojo", "how-to-run-a-dojo"] as const;

/** Installation belongs to the existing CLI, including duplicate and file policies. */
export async function installStarter(root: string, courseId: string): Promise<void> {
  if (!starterCourseIds.some(id => id === courseId)) throw new Error("Unknown starter course.");
  const cli = process.env.DOJO_CLI;
  if (!cli) throw new Error("Start the app with dojofoo ui to install bundled courses.");
  try {
    await execute(process.execPath, [cli, "add", resolve(dirname(realpathSync(cli)), "starters", courseId), "--master"], {
      cwd: root,
      env: { ...process.env, DOJO_PROJECT_ROOT: root },
      timeout: 60_000,
    });
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr).trim() : "";
    throw new Error(stderr || "The course could not be installed. Existing courses have not been overwritten.");
  }
}
