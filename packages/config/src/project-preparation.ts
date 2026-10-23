import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { dojoDir, readDojoRc } from "./index";

const MISE_CONFIG_NAMES = ["mise.toml", ".mise.toml"] as const;
const preparations = new Map<string, Promise<ProjectPreparationResult>>();

export type ProjectPreparationResult = {
  prepared: boolean;
  configPath: string | null;
  setupTask: boolean;
};

export type ProjectPreparationRunner = (
  command: string,
  args: string[],
  options: { cwd: string; quiet: boolean },
) => Promise<string>;

export function miseConfigPath(root: string): string | null {
  for (const name of MISE_CONFIG_NAMES) {
    const path = resolve(root, name);
    if (existsSync(path)) return path;
  }
  return null;
}

/**
 * Prepare a project through its checked-in mise contract. Mise owns tool
 * installation, trust, task dependencies, and task freshness; dojofoo only
 * follows the `setup` task convention.
 */
export function prepareProject(
  root: string,
  options: { run?: ProjectPreparationRunner } = {},
): Promise<ProjectPreparationResult> {
  const configPath = miseConfigPath(root);
  if (!configPath) return Promise.resolve({ prepared: false, configPath: null, setupTask: false });

  const projectRoot = resolve(root);
  if (options.run) return prepareWithMise(projectRoot, configPath, options.run);

  const current = preparations.get(projectRoot);
  if (current) return current;
  const pending = prepareWithMise(projectRoot, configPath, runCommand)
    .catch((cause) => {
      preparations.delete(projectRoot);
      throw cause;
    });
  preparations.set(projectRoot, pending);
  return pending;
}

/** Prepare both the learner workspace and the active dojo's own tool contract. */
export async function prepareWorkspace(
  root: string,
  options: { run?: ProjectPreparationRunner } = {},
): Promise<ProjectPreparationResult[]> {
  const results = [await prepareProject(root, options)];
  let activeDojo: string | null = null;
  try {
    const rc = readDojoRc(root);
    if (typeof rc.currentDojo === "string" && rc.currentDojo) activeDojo = rc.currentDojo;
  } catch {
    // Project preparation remains useful before a dojo has been selected.
  }
  if (activeDojo) {
    const courseRoot = dojoDir(root, activeDojo);
    if (miseConfigPath(courseRoot)) results.push(await prepareProject(courseRoot, options));
  }
  return results;
}

async function prepareWithMise(
  root: string,
  configPath: string,
  run: ProjectPreparationRunner,
): Promise<ProjectPreparationResult> {
  try {
    await run("mise", ["install"], { cwd: root, quiet: false });
    const tasks = await run("mise", ["tasks", "ls", "--local", "--name-only"], {
      cwd: root,
      quiet: true,
    });
    const setupTask = tasks.split(/\r?\n/).some((task) => task.trim() === "setup");
    if (setupTask) await run("mise", ["run", "setup"], { cwd: root, quiet: false });
    return { prepared: true, configPath, setupTask };
  } catch (cause) {
    if (isMissingExecutable(cause)) {
      throw new Error(
        `This dojo uses mise for its development environment, but mise is not installed. Install it from https://mise.jdx.dev/installing-mise.html and try again.`,
        { cause },
      );
    }
    throw cause;
  }
}

function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; quiet: boolean },
): Promise<string> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (!options.quiet) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (!options.quiet) process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolveRun(stdout);
      else reject(new Error(`mise ${args.join(" ")} failed${stderr.trim() ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

function isMissingExecutable(cause: unknown): boolean {
  return cause instanceof Error && "code" in cause && cause.code === "ENOENT";
}
