import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const bootstrapTools = ["pnpm@10.34.5"];

/** Resolve Dojofoo's bootstrap tools, never the course's toolchain or tasks.
 * Only PATH is adopted; credentials and the caller's environment are untouched.
 */
export async function prepareHarnessEnvironment(environment: NodeJS.ProcessEnv = process.env): Promise<NodeJS.ProcessEnv> {
  const installed = join(environment.HOME ?? homedir(), ".local", "bin", "mise");
  const mise = existsSync(installed) ? installed : "mise";
  const options = { env: { ...environment }, timeout: 120_000 };
  try {
    await execute(mise, ["--no-config", "install", ...bootstrapTools, "--yes"], options);
    const { stdout } = await execute(mise, ["--no-config", "env", ...bootstrapTools, "--json"], options);
    const resolved: unknown = JSON.parse(stdout);
    if (!resolved || typeof resolved !== "object" || !("PATH" in resolved)
      || typeof resolved.PATH !== "string" || !resolved.PATH.trim()) {
      throw new Error("mise returned no runtime PATH");
    }
    return { ...environment, PATH: resolved.PATH };
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Dojofoo's harness runtime requires mise. Run `npx dojofoo install` to prepare it.", { cause });
    }
    throw new Error("Could not prepare Dojofoo's harness toolchain with mise (pnpm@10.34.5). Check mise installation and network access.", { cause });
  }
}
