import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { agentSourceHash, authoringPackageRoot, courseAgentOutput } from "./artifact.ts";
import { prepareKyoshiApp } from "./prepare.ts";
export { kyoshiRuntimeSource, prepareKyoshiApp } from "./prepare.ts";

/** Installation/authoring only. Runtime startup never calls the compiler. */
export async function buildCourseKyoshi(courseRoot: string): Promise<void> {
  if (!existsSync(join(courseRoot, ".dojo/kyoshi"))) return;
  const source = await prepareKyoshiApp(courseRoot);
  const hash = await agentSourceHash(source);
  const output = courseAgentOutput(source, hash);
  try {
    if (await readFile(join(output, "source.sha256"), "utf8") === hash) {
      await access(join(output, "server/index.mjs"));
      return;
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  await promisify(execFile)(process.execPath, [join(authoringPackageRoot, "scripts/build-agent.mjs"), courseRoot], {
    maxBuffer: 4 * 1024 * 1024,
  });
}
