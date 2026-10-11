import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { createLessonTrial } from "@dojofoo/authoring/service";
import { readDojoRc, resolveKata } from "@dojofoo/config";
import { listWorkspaces } from "@dojofoo/config/local-state";
import { prepareWorkspace } from "@dojofoo/config/project-preparation";
import { parse } from "yaml";

/** Validate through the installed-course path, not an author's claimed test run. */
export async function verifyCourse(root: string, signal: AbortSignal) {
  const cli = process.env.DOJOFOO_EVAL_CLI;
  if (!cli) throw new Error("Build the CLI and set DOJOFOO_EVAL_CLI before evaluating");
  process.env.DOJOFOO_HOME = join(root, ".dojo/eval-state");
  const manifest = parse(await readFile(join(root, "dojo.yaml"), "utf8"));
  const results = [];
  for (const lesson of manifest.katas) {
    const trial = createLessonTrial(root, lesson.name);
    const workspace = listWorkspaces().find(entry => entry.id === trial.workspaceId)?.path;
    if (!workspace) throw new Error("Production trial did not register its workspace");
    await prepareWorkspace(workspace);
    const run = async () => {
      const { stdout } = await promisify(execFile)(process.execPath, [cli, "kata", lesson.name, "--check", "--reporter=json"], {
        cwd: workspace, signal, timeout: 90_000,
        env: { ...process.env, DOJO_PROJECT_ROOT: workspace, DOJO_SKIP_PREPARE: "1" },
      });
      return JSON.parse(stdout);
    };
    const report = await run();
    // A module-load failure in the learner file must prevent test collection.
    // If the test count is unchanged, the tests are reading a bundled stub.
    const learnerFile = resolveKata(workspace, readDojoRc(workspace), lesson).workspacePath;
    const source = await readFile(learnerFile, "utf8");
    let learnerFileObserved = false;
    if (!report.error && report.total > 0) {
      try {
        await writeFile(learnerFile, `${source}\nthrow new Error("Dojo learner-file wiring probe");\n`);
        learnerFileObserved = (await run()).total === 0;
      } finally {
        await writeFile(learnerFile, source);
      }
    }
    results.push({ lesson: lesson.name, report, learnerFileObserved });
  }
  return results;
}
